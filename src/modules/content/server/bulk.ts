import { parseBulkRequest } from '@/modules/content/domain/bulk'

/** Next's internal URL can be 0.0.0.0 behind Docker; the browser's Host remains canonical. */
export function bulkSameOrigin(req: Request) {
  const origin = req.headers.get('origin')
  if (!origin) return true
  const host = req.headers.get('host')
  if (!host) return false
  try {
    const parsed = new URL(origin)
    return (parsed.protocol === 'https:' || parsed.protocol === 'http:') && parsed.host === host
  } catch { return false }
}

export async function readBulkInput(req: Request) {
  const reader = req.body?.getReader()
  if (!reader) throw new Error('invalid batch')
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const part = await reader.read()
    if (part.done) break
    size += part.value.byteLength
    if (size > 16_384) {
      await reader.cancel()
      throw new Error('batch too large')
    }
    chunks.push(part.value)
  }
  try { return parseBulkRequest(JSON.parse(Buffer.concat(chunks).toString('utf8'))) }
  catch (error) { throw error instanceof SyntaxError ? new Error('invalid batch') : error }
}
