import { json, openAIError } from "./http";

export async function readUpstreamError(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      // Fall through to the text response.
    }
  }

  const text = await response.text();
  return text || `MiniMax request failed with HTTP ${response.status}`;
}

export function upstreamErrorResponse(
  status: number,
  body: unknown,
): Response {
  if (body && typeof body === "object" && "error" in body) {
    return json(body, { status });
  }

  const message =
    typeof body === "string"
      ? body
      : `MiniMax request failed with HTTP ${status}`;
  const type =
    status === 401
      ? "authentication_error"
      : status === 429
        ? "rate_limit_error"
        : "api_error";

  return openAIError(message, status, type);
}
