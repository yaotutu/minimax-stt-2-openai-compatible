import { openAIError } from "./http";

function sseEvent(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function processMiniMaxSseLine(
  line: string,
  emit: (event: Record<string, unknown>) => void,
): void {
  const trimmed = line.trim();
  if (!trimmed || !trimmed.startsWith("data:")) {
    return;
  }

  const payload = trimmed.slice("data:".length).trim();
  if (!payload || payload === "[DONE]") {
    return;
  }

  try {
    emit(JSON.parse(payload) as Record<string, unknown>);
  } catch {
    // Ignore keepalive or malformed events and continue the stream.
  }
}

export async function streamTranscription(
  response: Response,
  requestId?: string,
): Promise<Response> {
  if (!response.body) {
    return openAIError(
      "MiniMax returned an empty streaming response",
      502,
      "api_error",
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffered = "";
  let fullText = "";
  let finished = false;
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | undefined;

  const enqueueEvent = (event: Record<string, unknown>) => {
    controllerRef?.enqueue(encoder.encode(sseEvent(event)));
  };

  const enqueueRaw = (value: string) => {
    controllerRef?.enqueue(encoder.encode(value));
  };

  const emit = (event: Record<string, unknown>) => {
    if (event.finish === true) {
      finished = true;
      enqueueEvent({
        type: "transcript.text.done",
        text: fullText,
        ...(event.duration === undefined
          ? {}
          : { duration: event.duration }),
      });
      enqueueRaw("data: [DONE]\n\n");
      return;
    }

    const delta = typeof event.delta === "string" ? event.delta : "";
    if (!delta) {
      return;
    }

    fullText += delta;
    enqueueEvent({ type: "transcript.text.delta", delta });
  };

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;
    },

    async pull(controller) {
      controllerRef = controller;

      try {
        const { done, value } = await reader.read();
        if (done) {
          buffered += decoder.decode();
          if (buffered.trim()) {
            processMiniMaxSseLine(buffered, emit);
          }

          if (!finished) {
            controller.enqueue(
              encoder.encode(
                sseEvent({ type: "transcript.text.done", text: fullText }),
              ),
            );
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          }

          controller.close();
          return;
        }

        buffered += decoder.decode(value, { stream: true });
        const lines = buffered.split(/\r?\n/);
        buffered = lines.pop() ?? "";
        for (const line of lines) {
          processMiniMaxSseLine(line, emit);
        }
      } catch (error) {
        controller.error(error);
      }
    },

    cancel(reason) {
      return reader.cancel(reason);
    },
  });

  const headers = new Headers({
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  if (requestId) {
    headers.set("x-request-id", requestId);
  }

  return new Response(body, { status: 200, headers });
}
