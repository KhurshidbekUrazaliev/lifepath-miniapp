/** An error that becomes a JSON response: { error: code, detail? }. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
  }
}

export const badRequest = (detail: string): HttpError => new HttpError(400, 'bad_request', detail);
export const unauthorized = (): HttpError => new HttpError(401, 'unauthorized');
export const notFound = (): HttpError => new HttpError(404, 'not_found');
export const rateLimited = (): HttpError => new HttpError(429, 'rate_limited');
export const serverError = (): HttpError => new HttpError(500, 'server');

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

/** Text of an error for the log. Never pass anything that could hold a secret. */
export const describe = (e: unknown): string => (e instanceof Error ? `${e.name}: ${e.message}` : String(e));

export function errorResponse(e: unknown): Response {
  if (e instanceof HttpError) {
    return json(e.detail ? { error: e.code, detail: e.detail } : { error: e.code }, e.status);
  }
  console.error('unhandled error:', describe(e));
  return json({ error: 'server' }, 500);
}

const MAX_BODY_BYTES = 64 * 1024;

/** Reads a JSON object from the request body and refuses bodies over 64 KB. */
export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw badRequest('body too large');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw badRequest('invalid JSON');
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw badRequest('body must be a JSON object');
  }
  return value as Record<string, unknown>;
}

/** Compares two strings without stopping at the first difference. */
export function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i % (b.length || 1));
  return diff === 0;
}
