export const DEFAULT_MINIMAX_BASE_URL = "https://api.minimax.cn";
export const DEFAULT_PUBLIC_MODEL_ID = "minimax-asr-1.0";
export const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;
export const MAX_AUDIO_BYTES = 50 * 1024 * 1024;

export const SUPPORTED_RESPONSE_FORMATS = new Set([
  "json",
  "text",
  "srt",
  "verbose_json",
  "vtt",
  "diarized_json",
]);

export const MODEL_OBJECT = "model" as const;
