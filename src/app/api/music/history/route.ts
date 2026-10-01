import type { NextRequest } from 'next/server'
import { moduleGuard } from '@/extensions/server/modules'
import { requireUser } from '@/modules/identity/server/access'
import { bulkSameOrigin } from '@/modules/content/server/bulk'
import { err, ok } from '@/platform/http/response'
import { clearListeningHistory, getListeningProgress, HistoryError, recordListen, saveListeningProgress } from '@/modules/music/server/listening-history'

async function authorize(req: NextRequest) {
  const off = await moduleGuard('music')
  if (off) return { response: off, userId: null }
  if (!bulkSameOrigin(req)) return { response: err('forbidden', 403), userId: null }
  const user = await requireUser(req)
  if (!user) return { response: err('LOGIN_REQUIRED', 401), userId: null }
  return { response: null, userId: user.id }
}

async function readBody(req: NextRequest) {
  if (!req.headers.get('content-type')?.startsWith('application/json')) return err('invalid body', 400)
  const reader = req.body?.getReader()
  if (!reader) return err('invalid body', 400)
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const part = await reader.read()
    if (part.done) break
    size += part.value.byteLength
    if (size > 256) { await reader.cancel(); return err('invalid body', 400) }
    chunks.push(part.value)
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : err('invalid body', 400)
  } catch { return err('invalid body', 400) }
}

export async function GET(req: NextRequest) {
  const auth = await authorize(req)
  if (auth.response) return auth.response
  try { return ok(await getListeningProgress(auth.userId!, req.nextUrl.searchParams.get('trackId'))) }
  catch (error) { return error instanceof HistoryError ? err(error.message, error.status) : err('unable to read progress', 500) }
}

export async function POST(req: NextRequest) {
  const auth = await authorize(req)
  if (auth.response) return auth.response
  const body = await readBody(req)
  if (body instanceof Response) return body
  try { return ok(await recordListen(auth.userId!, body.trackId)) }
  catch (error) { return error instanceof HistoryError ? err(error.message, error.status) : err('unable to save history', 500) }
}

export async function PATCH(req: NextRequest) {
  const auth = await authorize(req)
  if (auth.response) return auth.response
  const body = await readBody(req)
  if (body instanceof Response) return body
  try { return ok(await saveListeningProgress(auth.userId!, { trackId: body.trackId, position: body.position, duration: body.duration, completed: body.completed })) }
  catch (error) { return error instanceof HistoryError ? err(error.message, error.status) : err('unable to save progress', 500) }
}

export async function DELETE(req: NextRequest) {
  const auth = await authorize(req)
  if (auth.response) return auth.response
  return ok({ deleted: (await clearListeningHistory(auth.userId!)).count })
}
