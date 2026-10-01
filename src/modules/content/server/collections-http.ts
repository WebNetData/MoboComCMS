import type { NextRequest } from 'next/server'
import { requireUser } from '@/modules/identity/server/access'
import { bulkSameOrigin } from '@/modules/content/server/bulk'
import { CollectionError } from '@/modules/content/server/collections'
import { err } from '@/platform/http/response'

export async function collectionAuth(req: NextRequest) {
  if (!bulkSameOrigin(req)) return { response: err('forbidden', 403), userId: null }
  const user = await requireUser(req)
  if (!user) return { response: err('LOGIN_REQUIRED', 401), userId: null }
  return { response: null, userId: user.id }
}

export async function collectionBody(req: NextRequest): Promise<Record<string, unknown>> {
  if (!req.headers.get('content-type')?.startsWith('application/json')) throw new CollectionError('Invalid body')
  const reader = req.body?.getReader()
  if (!reader) throw new CollectionError('Invalid body')
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const part = await reader.read()
    if (part.done) break
    size += part.value.byteLength
    if (size > 4096) { await reader.cancel(); throw new CollectionError('Body too large') }
    chunks.push(part.value)
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
  } catch { /* invalid JSON */ }
  throw new CollectionError('Invalid body')
}

export function collectionFailure(error: unknown) {
  return error instanceof CollectionError ? err(error.message, error.status) : err('Collection request failed', 500)
}
