import { bearerToken, json, openAIError, withCors } from "./http";
import { isAllowedModel, modelList, modelObject } from "./models";
import { handleTranscription } from "./transcription";
import type { Config } from "./types";

const TRANSCRIPTION_PATHS = new Set([
  "/v1/audio/transcriptions",
  "/audio/transcriptions",
]);

export function createApp(config: Config) {
  return async function app(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }));
    }

    if (path === "/healthz" && request.method === "GET") {
      return withCors(json({ status: "ok" }));
    }

    if (config.proxyApiKey && bearerToken(request) !== config.proxyApiKey) {
      return withCors(
        openAIError(
          "Invalid or missing proxy API key",
          401,
          "authentication_error",
        ),
      );
    }

    if (path === "/v1/models" && request.method === "GET") {
      return withCors(json(modelList()));
    }

    if (path.startsWith("/v1/models/") && request.method === "GET") {
      const id = decodeURIComponent(path.slice("/v1/models/".length));
      if (!isAllowedModel(id)) {
        return withCors(
          openAIError("Model not found", 404, "invalid_request_error", "model"),
        );
      }
      return withCors(json(modelObject(id)));
    }

    if (
      request.method === "POST" &&
      TRANSCRIPTION_PATHS.has(path)
    ) {
      return withCors(await handleTranscription(request, config));
    }

    return withCors(openAIError("Not found", 404, "invalid_request_error"));
  };
}
