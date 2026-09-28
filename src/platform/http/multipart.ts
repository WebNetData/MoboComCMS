import type { NextRequest } from 'next/server'

export class MultipartError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

/** Reads a multipart form with a hard size cap (streams, so a lying Content-Length cannot exceed it). */
export async function readMultipart(req: NextRequest, maxBytes: number, tooLarge = 'حجم فایل‌ها بیش از حد مجاز است') {
  const contentType = req.headers.get('content-type') || ''
  if (!contentType.toLowerCase().startsWith('multipart/form-data')) throw new MultipartError('فرم ارسالی معتبر نیست')
  if (Number(req.headers.get('content-length')) > maxBytes) throw new MultipartError(tooLarge, 413)
  const reader = req.body?.getReader()
  if (!reader) throw new MultipartError('فرم دریافت نشد')
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const part = await reader.read()
    if (part.done) break
    size += part.value.byteLength
    if (size > maxBytes) { await reader.cancel(); throw new MultipartError(tooLarge, 413) }
    chunks.push(part.value)
  }
  try { return await new Response(Buffer.concat(chunks), { headers: { 'content-type': contentType } }).formData() }
  catch { throw new MultipartError('فرم ارسالی معتبر نیست') }
}
