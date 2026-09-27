import { createApp } from "./app";
import { loadConfig } from "./config";
import { DEFAULT_PUBLIC_MODEL_ID } from "./constants";

export { createApp } from "./app";
export { loadConfig } from "./config";
export type { Config, MiniMaxJsonResponse, MiniMaxSegment } from "./types";

if (import.meta.main) {
  const config = loadConfig();
  const app = createApp(config);

  Bun.serve({
    hostname: config.host,
    port: config.port,
    fetch: app,
  });

  console.log(
    `MiniMax OpenAI-compatible STT proxy listening on http://${config.host}:${config.port}`,
  );
  console.log(`OpenAI base URL: http://localhost:${config.port}/v1`);
  console.log(`Models: ${DEFAULT_PUBLIC_MODEL_ID}, asr-1.0`);
}
