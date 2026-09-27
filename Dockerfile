FROM oven/bun:1.4.2-slim

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY src ./src

ENV HOST=0.0.0.0 \
    PORT=18080 \
    MINIMAX_BASE_URL=https://api.minimax.cn \
    REQUEST_TIMEOUT_MS=120000

EXPOSE 18080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD bun -e 'fetch("http://127.0.0.1:18080/healthz").then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))'

USER bun
CMD ["bun", "run", "src/index.ts"]
