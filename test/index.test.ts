import { afterEach, describe, expect, test } from "bun:test";
import { createApp } from "../src/index";

type Config = Parameters<typeof createApp>[0];

const config: Config = {
  minimaxApiKey: "minimax-test-key",
  host: "127.0.0.1",
  port: 18080,
  minimaxBaseUrl: "https://api.minimax.cn",
  requestTimeoutMs: 5_000,
};

const protectedConfig: Config = {
  ...config,
  proxyApiKey: "proxy-test-key",
};

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockFetch(
  handler: (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => Promise<Response>,
): void {
  globalThis.fetch = handler as typeof fetch;
}

function multipartRequest(
  fields: Record<string, string>,
  file = new File(["audio"], "voice.mp3", { type: "audio/mpeg" }),
): Request {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    form.append(key, value);
  }
  form.append("file", file);

  return new Request("http://localhost:18080/v1/audio/transcriptions", {
    method: "POST",
    body: form,
  });
}

describe("OpenAI-compatible MiniMax STT proxy", () => {
  test("serves a public health check", async () => {
    const response = await createApp(protectedConfig)(
      new Request("http://localhost:18080/healthz"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  test("protects API routes with the proxy key", async () => {
    const app = createApp(protectedConfig);
    const unauthorized = await app(
      new Request("http://localhost:18080/v1/models"),
    );
    const authorized = await app(
      new Request("http://localhost:18080/v1/models", {
        headers: { Authorization: "Bearer proxy-test-key" },
      }),
    );

    expect(unauthorized.status).toBe(401);
    expect(authorized.status).toBe(200);
  });

  test("lists the configured model", async () => {
    const response = await createApp(config)(
      new Request("http://localhost:18080/v1/models"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      object: "list",
      data: [
        {
          id: "minimax-asr-1.0",
          object: "model",
          created: 0,
          owned_by: "minimax",
        },
        {
          id: "asr-1.0",
          object: "model",
          created: 0,
          owned_by: "minimax",
        },
      ],
    });
  });

  test("forwards multipart audio and maps json output", async () => {
    let received: Request | undefined;
    mockFetch(async (input, init) => {
      received = input instanceof Request ? input : new Request(input, init);
      return new Response(
        JSON.stringify({
          text: "你好，世界",
          duration: 1.25,
          trace_id: "trace-1",
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    });

    const response = await createApp(config)(
      multipartRequest({ model: "minimax-asr-1.0", language: "zh" }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      text: "你好，世界",
      duration: 1.25,
      trace_id: "trace-1",
    });

    expect(received?.url).toBe("https://api.minimax.cn/v1/speech_to_text");
    expect(received?.headers.get("authorization")).toBe(
      "Bearer minimax-test-key",
    );
    expect(received?.headers.get("language")).toBe("zh");

    const sent = await received?.formData();
    expect(sent?.get("model")).toBe("asr-1.0");
    expect((sent?.get("file") as File).name).toBe("voice.mp3");
  });

  test("converts verbose_json to an OpenAI-shaped response", async () => {
    mockFetch(
      async () =>
        new Response(
          JSON.stringify({
            text: "hello",
            duration: 2.5,
            n_speakers: 2,
            segments: [
              { id: 0, start: 0.1, end: 2.5, speaker: "S1", text: "hello" },
            ],
          }),
          { headers: { "content-type": "application/json" } },
        ),
    );

    const response = await createApp(config)(
      multipartRequest({ model: "asr-1.0", response_format: "verbose_json" }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      task: "transcribe",
      language: "und",
      duration: 2.5,
      text: "hello",
      n_speakers: 2,
      segments: [
        { id: "0", start: 0.1, end: 2.5, speaker: "S1", text: "hello" },
      ],
    });
  });

  test("transforms MiniMax SSE into OpenAI transcription events", async () => {
    mockFetch(
      async () =>
        new Response(
          'data: {"index":0,"delta":"hel","finish":false}\n\n' +
            'data: {"index":1,"delta":"lo","finish":false}\n\n' +
            'data: {"index":2,"delta":"","finish":true,"duration":1.2}\n\n',
          { headers: { "content-type": "text/event-stream" } },
        ),
    );

    const response = await createApp(config)(
      multipartRequest({ model: "asr-1.0", stream: "true" }),
    );

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('"type":"transcript.text.delta","delta":"hel"');
    expect(body).toContain('"type":"transcript.text.delta","delta":"lo"');
    expect(body).toContain(
      '"type":"transcript.text.done","text":"hello","duration":1.2',
    );
    expect(body).toContain("data: [DONE]");
  });

  test("rejects an invalid model before calling MiniMax", async () => {
    let called = false;
    mockFetch(async () => {
      called = true;
      return new Response("unexpected", { status: 500 });
    });

    const response = await createApp(config)(
      multipartRequest({ model: "not-a-model" }),
    );

    expect(response.status).toBe(404);
    expect(called).toBe(false);
  });
});
