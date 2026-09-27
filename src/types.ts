export type Config = {
  minimaxApiKey: string;
  proxyApiKey?: string;
  host: string;
  port: number;
  minimaxBaseUrl: string;
  requestTimeoutMs: number;
};

export type MiniMaxSegment = {
  id?: number;
  start?: number;
  end?: number;
  speaker?: string;
  text?: string;
  [key: string]: unknown;
};

export type MiniMaxJsonResponse = {
  text?: string;
  duration?: number;
  trace_id?: string;
  n_speakers?: number;
  segments?: MiniMaxSegment[];
  [key: string]: unknown;
};
