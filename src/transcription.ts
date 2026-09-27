import { MAX_AUDIO_BYTES, SUPPORTED_RESPONSE_FORMATS } from "./constants";
import { json, openAIError } from "./http";
import { readUpstreamError, upstreamErrorResponse } from "./minimax";
import { resolveModel } from "./models";
import { streamTranscription } from "./sse";
import type { Config, MiniMaxJsonResponse, MiniMaxSegment } from "./types";

const REQUEST_BODY_OVERHEAD_BYTES = 1024 * 1024;

function normalizeBoolean(value: FormDataEntryValue | null): boolean {
  return (
    typeof value === "string" &&
    ["1", "true", "yes", "on"].includes(value.toLowerCase())
  );
}

function segmentForOpenAI(segment: MiniMaxSegment, index: number) {
  return {
    id: String(segment.id ?? index),
    seek: 0,
    start: Number(segment.start ?? 0),
    end: Number(segment.end ?? 0),
    text: String(segment.text ?? ""),
    tokens: [],
    temperature: 0,
    avg_logprob: 0,
    compression_ratio: 0,
    no_speech_prob: 0,
    ...(segment.speaker ? { speaker: segment.speaker } : {}),
  };
}

function normalizeVerboseResponse(
  upstream: MiniMaxJsonResponse,
  language?: string,
) {
  return {
    task: "transcribe",
    language: language || "und",
    duration: Number(upstream.duration ?? 0),
    text: String(upstream.text ?? ""),
    segments: (upstream.segments ?? []).map(segmentForOpenAI),
    ...(upstream.n_speakers === undefined
      ? {}
      : { n_speakers: upstream.n_speakers }),
    ...(upstream.trace_id === undefined
      ? {}
      : { trace_id: upstream.trace_id }),
  };
}

function textFromUpstream(data: MiniMaxJsonResponse): string {
  return String(data.text ?? "");
}

function textResponse(
  text: string,
  contentType = "text/plain; charset=utf-8",
): Response {
  return new Response(text, {
    status: 200,
    headers: { "content-type": contentType },
  });
}

function upstreamResponseFormat(format: string): string {
  if (format === "text") {
    return "json";
  }
  if (format === "diarized_json") {
    return "verbose_json";
  }
  return format;
}

async function callMiniMax(
  file: File,
  upstreamModel: string,
  responseFormat: string,
  stream: boolean,
  language: string | undefined,
  config: Config,
): Promise<Response> {
  const form = new FormData();
  form.append("model", upstreamModel);
  form.append("file", file, file.name || "audio");
  form.append("response_format", upstreamResponseFormat(responseFormat));
  if (stream) {
    form.append("stream", "true");
  }

  const headers = new Headers({
    Authorization: `Bearer ${config.minimaxApiKey}`,
  });
  if (language) {
    headers.set("language", language);
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    config.requestTimeoutMs,
  );

  try {
    return await fetch(`${config.minimaxBaseUrl}/v1/speech_to_text`, {
      method: "POST",
      headers,
      body: form,
      signal: controller.signal,
    });
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "MiniMax request timed out"
        : `Unable to reach MiniMax: ${error instanceof Error ? error.message : String(error)}`;
    throw openAIError(message, 502, "api_error");
  } finally {
    clearTimeout(timeout);
  }
}

export async function handleTranscription(
  request: Request,
  config: Config,
): Promise<Response> {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_AUDIO_BYTES + REQUEST_BODY_OVERHEAD_BYTES) {
    return openAIError(
      "Request body exceeds the 50 MB audio limit",
      413,
      "invalid_request_error",
      "file",
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return openAIError(
      "Expected a multipart/form-data request",
      400,
      "invalid_request_error",
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return openAIError(
      "The `file` field is required and must be an audio file",
      400,
      "invalid_request_error",
      "file",
    );
  }
  if (file.size > MAX_AUDIO_BYTES) {
    return openAIError(
      "Audio file exceeds MiniMax's 50 MB limit",
      413,
      "invalid_request_error",
      "file",
    );
  }

  const modelValue = form.get("model");
  if (typeof modelValue !== "string" || !modelValue.trim()) {
    return openAIError(
      "The `model` field is required",
      400,
      "invalid_request_error",
      "model",
    );
  }

  const model = modelValue.trim();
  const upstreamModel = resolveModel(model);
  if (!upstreamModel) {
    return openAIError(
      `The model '${model}' is not available on this proxy. Use 'minimax-asr-1.0' or 'asr-1.0'.`,
      404,
      "invalid_request_error",
      "model",
      "model_not_found",
    );
  }

  const responseFormat = String(form.get("response_format") || "json");
  if (!SUPPORTED_RESPONSE_FORMATS.has(responseFormat)) {
    return openAIError(
      `Unsupported response_format '${responseFormat}'.`,
      400,
      "invalid_request_error",
      "response_format",
    );
  }

  const stream = normalizeBoolean(form.get("stream"));
  if (stream && responseFormat !== "json") {
    return openAIError(
      "MiniMax streaming is only supported with response_format=json.",
      400,
      "invalid_request_error",
      "stream",
    );
  }

  const languageValue = form.get("language");
  const language =
    typeof languageValue === "string" ? languageValue.trim() : undefined;

  let upstream: Response;
  try {
    upstream = await callMiniMax(
      file,
      upstreamModel,
      responseFormat,
      stream,
      language || undefined,
      config,
    );
  } catch (error) {
    return error instanceof Response
      ? error
      : openAIError("MiniMax request failed", 502, "api_error");
  }

  if (!upstream.ok) {
    return upstreamErrorResponse(
      upstream.status,
      await readUpstreamError(upstream),
    );
  }

  if (stream) {
    return streamTranscription(
      upstream,
      upstream.headers.get("x-request-id") || undefined,
    );
  }

  if (responseFormat === "srt" || responseFormat === "vtt") {
    return textResponse(
      await upstream.text(),
      responseFormat === "vtt" ? "text/vtt; charset=utf-8" : undefined,
    );
  }

  let data: MiniMaxJsonResponse;
  try {
    data = (await upstream.json()) as MiniMaxJsonResponse;
  } catch {
    return openAIError(
      "MiniMax returned an invalid JSON response",
      502,
      "api_error",
    );
  }

  if (responseFormat === "text") {
    return textResponse(textFromUpstream(data));
  }

  if (responseFormat === "verbose_json" || responseFormat === "diarized_json") {
    return json(normalizeVerboseResponse(data, language || undefined));
  }

  return json({
    text: textFromUpstream(data),
    ...(data.duration === undefined ? {} : { duration: data.duration }),
    ...(data.trace_id === undefined ? {} : { trace_id: data.trace_id }),
  });
}
