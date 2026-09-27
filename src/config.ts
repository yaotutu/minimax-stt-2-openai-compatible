import {
  DEFAULT_MINIMAX_BASE_URL,
  DEFAULT_REQUEST_TIMEOUT_MS,
} from "./constants";
import type { Config } from "./types";

export function loadConfig(
  env: Record<string, string | undefined> = process.env,
): Config {
  const minimaxApiKey = env.MINIMAX_API_KEY?.trim();
  if (!minimaxApiKey) {
    throw new Error("MINIMAX_API_KEY is required");
  }

  return {
    minimaxApiKey,
    proxyApiKey: env.PROXY_API_KEY?.trim() || undefined,
    host: env.HOST?.trim() || "0.0.0.0",
    port: parsePositiveInteger(env.PORT, 18080, "PORT"),
    minimaxBaseUrl: (
      env.MINIMAX_BASE_URL?.trim() || DEFAULT_MINIMAX_BASE_URL
    ).replace(/\/$/, ""),
    requestTimeoutMs: parsePositiveInteger(
      env.REQUEST_TIMEOUT_MS,
      DEFAULT_REQUEST_TIMEOUT_MS,
      "REQUEST_TIMEOUT_MS",
    ),
  };
}

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
  name: string,
): number {
  if (value === undefined || value === "") {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsed;
}
