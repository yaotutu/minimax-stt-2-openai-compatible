export function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...init.headers,
    },
  });
}

export function openAIError(
  message: string,
  status = 400,
  type = "invalid_request_error",
  param?: string,
  code?: string,
): Response {
  return json(
    {
      error: {
        message,
        type,
        param: param ?? null,
        code: code ?? null,
      },
    },
    { status },
  );
}

export function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-headers", "Authorization, Content-Type");
  headers.set("access-control-allow-methods", "GET, POST, OPTIONS");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function bearerToken(request: Request): string | undefined {
  const value = request.headers.get("authorization");
  if (!value) {
    return undefined;
  }

  return /^Bearer\s+(.+)$/i.exec(value.trim())?.[1];
}
