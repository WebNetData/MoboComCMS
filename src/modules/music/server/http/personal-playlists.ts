import type { NextRequest } from 'next/server'
import { moduleGuard } from '@/extensions/server/modules'
import { requireUser } from '@/modules/identity/server/access'
import { bulkSameOrigin } from '@/modules/content/server/bulk'
import { err, ok } from '@/platform/http/response'
import { PlaylistError, playlistId, listPersonalPlaylists, getPersonalPlaylist, createPersonalPlaylist, renamePersonalPlaylist, deletePersonalPlaylist, addPersonalTrack, removePersonalTrack } from '@/modules/music/server/personal-playlists'

async function authorize(req: NextRequest, write = false) {
  const off = await moduleGuard('music')
  if (off) return { response: off, userId: null }
  if (write && !bulkSameOrigin(req)) return { response: err('forbidden', 403), userId: null }
  const user = await requireUser(req)
  if (!user) return { response: err('LOGIN_REQUIRED', 401), userId: null }
  return { response: null, userId: user.id }
}

async function body(req: NextRequest): Promise<Record<string, unknown>> {
  const reader = req.body?.getReader()
  if (!reader) throw new PlaylistError('درخواست نامعتبر است')
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const part = await reader.read()
    if (part.done) break
    size += part.value.byteLength
    if (size > 2048) { await reader.cancel(); throw new PlaylistError('درخواست بیش از حد بزرگ است') }
    chunks.push(part.value)
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (value && typeof value === 'object' && !Array.isArray(value)) return value
  } catch { /* invalid JSON */ }
  throw new PlaylistError('درخواست نامعتبر است')
}

function failure(error: unknown) {
  if (error instanceof PlaylistError) return err(error.message, error.status)
  return err('خطا در مدیریت پلی‌لیست', 500)
}

export async function GET_list(req: NextRequest) {
  const auth = await authorize(req)
  if (auth.response) return auth.response
  try { return ok(await listPersonalPlaylists(auth.userId!)) } catch (error) { return failure(error) }
}

export async function POST_list(req: NextRequest) {
  const auth = await authorize(req, true)
  if (auth.response) return auth.response
  try { return ok(await createPersonalPlaylist(auth.userId!, (await body(req)).title), 201) } catch (error) { return failure(error) }
}

export async function GET_one(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req)
  if (auth.response) return auth.response
  try { return ok(await getPersonalPlaylist(auth.userId!, playlistId((await params).id))) } catch (error) { return failure(error) }
}

export async function PATCH_one(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, true)
  if (auth.response) return auth.response
  try { return ok(await renamePersonalPlaylist(auth.userId!, playlistId((await params).id), (await body(req)).title)) } catch (error) { return failure(error) }
}

export async function DELETE_one(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, true)
  if (auth.response) return auth.response
  try { return ok(await deletePersonalPlaylist(auth.userId!, playlistId((await params).id))) } catch (error) { return failure(error) }
}

export async function POST_track(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, true)
  if (auth.response) return auth.response
  try { return ok(await addPersonalTrack(auth.userId!, playlistId((await params).id), (await body(req)).trackId)) } catch (error) { return failure(error) }
}

export async function DELETE_track(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, true)
  if (auth.response) return auth.response
  try { return ok(await removePersonalTrack(auth.userId!, playlistId((await params).id), req.nextUrl.searchParams.get('trackId'))) } catch (error) { return failure(error) }
}
