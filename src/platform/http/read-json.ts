/** Bounded while reading, including requests without a Content-Length header. */
export class JsonBodyError extends Error { constructor(message: string, readonly status = 400) { super(message) } }
export async function readJsonObject(request: Request, limit = 65536): Promise<Record<string, unknown>> {
  if (Number(request.headers.get('content-length')) > limit) throw new JsonBodyError('درخواست بیش از حد بزرگ است', 413)
  const reader = request.body?.getReader()
  if (!reader) throw new JsonBodyError('درخواست خالی است')
  const chunks: Uint8Array[] = []; let size = 0
  while (true) { const item = await reader.read(); if (item.done) break; size += item.value.length; if (size > limit) { await reader.cancel(); throw new JsonBodyError('درخواست بیش از حد بزرگ است', 413) } chunks.push(item.value) }
  let value: unknown
  try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw new JsonBodyError('JSON نامعتبر است') }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new JsonBodyError('درخواست نامعتبر است')
  return value as Record<string, unknown>
}
