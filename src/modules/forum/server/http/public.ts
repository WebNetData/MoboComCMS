import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { auditAdmin } from '@/platform/audit/server'
import { requireUser } from '@/modules/identity/server/access'
import { moduleGuard } from '@/extensions/server/modules'
import { ForumError } from '@/modules/forum/domain/forum'
import { actorFor, createReply, createThread, deleteThread, editPost, moderatePost, moderateThread } from '@/modules/forum/server/forum'
import { queueIndexNow } from '@/modules/seo/server/indexnow'
import { db } from '@/platform/database/prisma'

// Forum write API. Reading happens in server components; every route here
// authenticates, re-checks board access and fails closed while the module is off.

type Ctx = { params: Promise<{ id: string }> }

async function guard(req: NextRequest) {
  const off = await moduleGuard('forum')
  if (off) return { response: off }
  const user = await requireUser(req)
  if (!user) return { response: err('برای ادامه وارد حساب خود شوید', 401) }
  return { user, actor: await actorFor(user.id) }
}
function failure(error: unknown) {
  if (error instanceof ForumError) return err(error.message, error.status)
  console.error('[forum]', error)
  return err('خطای داخلی؛ دوباره تلاش کنید', 500)
}
const idOf = async (params: Ctx['params']) => Number((await params).id)

/** POST /api/forum/threads { categoryId, title, content } */
export async function POST_thread(req: NextRequest) {
  const g = await guard(req)
  if ('response' in g) return g.response
  const body = await req.json().catch(() => null)
  try {
    const thread = await createThread(g.actor, body || {})
    // Public threads are announced to IndexNow; VIP boards stay private.
    const board = await db.forumThread.findUnique({ where: { id: thread.id }, select: { category: { select: { access: true } } } }).catch(() => null)
    if (board?.category.access === 'PUBLIC') queueIndexNow([`/forum/t/${thread.id}`])
    return ok(thread, 201)
  } catch (error) { return failure(error) }
}

/** POST /api/forum/threads/:id/posts { content } */
export async function POST_reply(req: NextRequest, { params }: Ctx) {
  const g = await guard(req)
  if ('response' in g) return g.response
  const body = await req.json().catch(() => null)
  try { return ok(await createReply(g.actor, await idOf(params), body || {}), 201) } catch (error) { return failure(error) }
}

/** PATCH /api/forum/threads/:id { pinned?, locked?, status?, categoryId? } — moderators. DELETE removes it. */
export async function PATCH_thread(req: NextRequest, { params }: Ctx) {
  const g = await guard(req)
  if ('response' in g) return g.response
  const body = await req.json().catch(() => null)
  const id = await idOf(params)
  try {
    const result = await moderateThread(g.actor, id, body || {})
    await auditAdmin({ req, actor: g.user, action: 'forum.thread.moderate', targetType: 'ForumThread', targetId: id, metadata: body || {} })
    return ok(result)
  } catch (error) { return failure(error) }
}
export async function DELETE_thread(req: NextRequest, { params }: Ctx) {
  const g = await guard(req)
  if ('response' in g) return g.response
  const id = await idOf(params)
  try {
    const thread = await deleteThread(g.actor, id)
    await auditAdmin({ req, actor: g.user, action: 'forum.thread.delete', targetType: 'ForumThread', targetId: id, metadata: { title: thread.title } })
    return ok({ deleted: true })
  } catch (error) { return failure(error) }
}

/** PATCH /api/forum/posts/:id { content } (author within 24h or moderator) | { action: hide|show } (moderator). DELETE — moderator. */
export async function PATCH_post(req: NextRequest, { params }: Ctx) {
  const g = await guard(req)
  if ('response' in g) return g.response
  const body = await req.json().catch(() => null)
  const id = await idOf(params)
  try {
    if (body?.action === 'hide' || body?.action === 'show') {
      const result = await moderatePost(g.actor, id, body.action)
      await auditAdmin({ req, actor: g.user, action: `forum.post.${body.action}`, targetType: 'ForumPost', targetId: id })
      return ok(result)
    }
    return ok(await editPost(g.actor, id, body || {}))
  } catch (error) { return failure(error) }
}
export async function DELETE_post(req: NextRequest, { params }: Ctx) {
  const g = await guard(req)
  if ('response' in g) return g.response
  const id = await idOf(params)
  try {
    const result = await moderatePost(g.actor, id, 'delete')
    await auditAdmin({ req, actor: g.user, action: 'forum.post.delete', targetType: 'ForumPost', targetId: id })
    return ok(result)
  } catch (error) { return failure(error) }
}
