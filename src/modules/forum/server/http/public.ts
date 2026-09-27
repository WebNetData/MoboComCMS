import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { requireUser } from '@/modules/identity/server/access'
import { moduleGuard } from '@/extensions/server/modules'
import { ForumError } from '@/modules/forum/domain/forum'
import { CommunityError, type Viewer } from '@/modules/forum/domain/community'
import { viewerFor } from '@/modules/forum/server/community'
import {
  bookmark, createReply, createTopic, deleteThread, editPost, flag, moderatePost, moderateThread, postRevisions, react, resolveFlags, setSolution, setTopicState,
} from '@/modules/forum/server/actions'
import { groupAction, mentionSearch, readProfileImage, saveProfileImage, updateProfile } from '@/modules/forum/server/people'
import { setPollClosed, unvote, vote } from '@/modules/forum/server/polls'
import { movePosts, reviewPost, reviewQueue, setCategoryLevel, setWiki, topicSettings } from '@/modules/forum/server/moderation'
import { conversationAction, inbox, replyConversation, startConversation } from '@/modules/forum/server/messages'
import { auditAdmin } from '@/platform/audit/server'

// Forum API. Reading happens in server components; every route here
// authenticates, re-checks access in the service and fails closed while the
// forum module is switched off.

type Ctx<K extends string = 'id'> = { params: Promise<Record<K, string>> }

async function guard(req: NextRequest): Promise<{ response: Response } | { viewer: Viewer; userId: number; user: NonNullable<Awaited<ReturnType<typeof requireUser>>> }> {
  const off = await moduleGuard('forum')
  if (off) return { response: off }
  const user = await requireUser(req)
  if (!user) return { response: err('برای ادامه وارد حساب خود شوید', 401) }
  return { viewer: await viewerFor(user.id), userId: user.id, user }
}

function failure(error: unknown) {
  if (error instanceof ForumError || error instanceof CommunityError) return err(error.message, error.status)
  console.error('[forum]', error)
  return err('خطای داخلی؛ دوباره تلاش کنید', 500)
}

const numberParam = async (params: Ctx['params']) => Number((await params).id)
const body = async (req: NextRequest) => (await req.json().catch(() => null)) || {}

/** POST /api/forum/threads { categoryId, title, content, tags } */
export async function POST_thread(req: NextRequest) {
  const g = await guard(req)
  if ('response' in g) return g.response
  try { return ok(await createTopic(g.viewer, await body(req)), 201) } catch (error) { return failure(error) }
}

/** PATCH /api/forum/threads/:id — staff: pinned, locked, status, categoryId */
export async function PATCH_thread(req: NextRequest, { params }: Ctx) {
  const g = await guard(req)
  if ('response' in g) return g.response
  try { return ok(await moderateThread(g.viewer, await numberParam(params), await body(req))) } catch (error) { return failure(error) }
}

export async function DELETE_thread(req: NextRequest, { params }: Ctx) {
  const g = await guard(req)
  if ('response' in g) return g.response
  try { await deleteThread(g.viewer, await numberParam(params)); return ok({ deleted: true }) } catch (error) { return failure(error) }
}

/** POST /api/forum/threads/:id/posts { content, replyToId } */
export async function POST_reply(req: NextRequest, { params }: Ctx) {
  const g = await guard(req)
  if ('response' in g) return g.response
  try { return ok(await createReply(g.viewer, await numberParam(params), await body(req)), 201) } catch (error) { return failure(error) }
}

/** PUT /api/forum/threads/:id/state { level: WATCHING | TRACKING | NORMAL | MUTED } */
export async function PUT_state(req: NextRequest, { params }: Ctx) {
  const g = await guard(req)
  if ('response' in g) return g.response
  try { return ok(await setTopicState(g.viewer, await numberParam(params), await body(req))) } catch (error) { return failure(error) }
}

/** PATCH /api/forum/posts/:id — edit { content, title, tags, categoryId } or staff { action: hide | show } */
export async function PATCH_post(req: NextRequest, { params }: Ctx) {
  const g = await guard(req)
  if ('response' in g) return g.response
  const id = await numberParam(params)
  const input = await body(req)
  try {
    if (input.action === 'hide' || input.action === 'show') return ok(await moderatePost(g.viewer, id, input.action))
    return ok(await editPost(g.viewer, id, input))
  } catch (error) { return failure(error) }
}

export async function DELETE_post(req: NextRequest, { params }: Ctx) {
  const g = await guard(req)
  if ('response' in g) return g.response
  try { return ok(await moderatePost(g.viewer, await numberParam(params), 'delete')) } catch (error) { return failure(error) }
}

/** POST /api/forum/posts/:id/actions { action: react | unreact | bookmark | unbookmark | flag | solve | unsolve | agree | disagree | purge } */
export async function POST_post_action(req: NextRequest, { params }: Ctx) {
  const g = await guard(req)
  if ('response' in g) return g.response
  const id = await numberParam(params)
  const input = await body(req)
  try {
    switch (input.action) {
      case 'react': case 'unreact': return ok(await react(g.viewer, id, String(input.emoji || 'heart'), input.action === 'react'))
      case 'bookmark': case 'unbookmark': return ok(await bookmark(g.viewer, id, input.action === 'bookmark'))
      case 'flag': return ok(await flag(g.viewer, id, input))
      case 'solve': case 'unsolve': return ok(await setSolution(g.viewer, id, input.action === 'solve'))
      case 'agree': case 'disagree': return ok(await resolveFlags(g.viewer, id, input.action))
      case 'purge': return ok(await resolveFlags(g.viewer, id, 'delete'))
      case 'wiki': case 'unwiki': return ok(await setWiki(g.viewer, id, input.action === 'wiki'))
      default: return err('عملیات نامعتبر', 400)
    }
  } catch (error) { return failure(error) }
}

export async function GET_revisions(req: NextRequest, { params }: Ctx) {
  const g = await guard(req)
  if ('response' in g) return g.response
  try { return ok(await postRevisions(g.viewer, await numberParam(params))) } catch (error) { return failure(error) }
}

/** GET /api/forum/users?q= — @mention autocomplete (signed-in users only). */
export async function GET_users(req: NextRequest) {
  const g = await guard(req)
  if ('response' in g) return g.response
  return ok({ users: await mentionSearch(req.nextUrl.searchParams.get('q') || '') })
}

/** PATCH /api/forum/profile — own profile. */
export async function PATCH_profile(req: NextRequest) {
  const g = await guard(req)
  if ('response' in g) return g.response
  try { return ok(await updateProfile(g.viewer, await body(req))) } catch (error) { return failure(error) }
}

/** POST /api/forum/upload (multipart "file") — avatar or cover image. */
export async function POST_upload(req: NextRequest) {
  const g = await guard(req)
  if ('response' in g) return g.response
  if (Number(req.headers.get('content-length')) > 4 * 1024 * 1024) return err('حجم تصویر حداکثر ۳ مگابایت است', 413)
  try {
    const form = await req.formData()
    const file = form.get('file')
    return ok(await saveProfileImage(g.userId, typeof file === 'string' ? null : file))
  } catch (error) { return failure(error) }
}

/** GET /api/forum/media/:file — public profile images. */
export async function GET_media(_req: NextRequest, { params }: Ctx<'file'>) {
  const file = await readProfileImage((await params).file)
  if (!file) return err('not found', 404)
  return new Response(new Uint8Array(file.bytes), { headers: { 'content-type': file.type, 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; sandbox" } })
}

/** POST /api/forum/groups/:slug { action, username } */
export async function POST_group(req: NextRequest, { params }: Ctx<'slug'>) {
  const g = await guard(req)
  if ('response' in g) return g.response
  try { return ok(await groupAction(g.viewer, (await params).slug, await body(req))) } catch (error) { return failure(error) }
}

// ------------------------------------------------------------------ polls

/** POST /api/forum/polls/:id { action: vote | unvote | close | open, options } */
export async function POST_poll(req: NextRequest, { params }: Ctx) {
  const g = await guard(req)
  if ('response' in g) return g.response
  const id = await numberParam(params)
  const input = await body(req)
  try {
    switch (input.action) {
      case 'vote': return ok({ poll: await vote(g.viewer, id, input.options) })
      case 'unvote': return ok({ poll: await unvote(g.viewer, id) })
      case 'close': case 'open': return ok({ poll: await setPollClosed(g.viewer, id, input.action === 'close') })
      default: return err('عملیات نامعتبر', 400)
    }
  } catch (error) { return failure(error) }
}

// ------------------------------------------------------------------ staff tools

/** POST /api/forum/threads/:id/move { postNumbers | all, target (topic id) | title + categoryId } */
export async function POST_move(req: NextRequest, { params }: Ctx) {
  const g = await guard(req)
  if ('response' in g) return g.response
  const id = await numberParam(params)
  try {
    const result = await movePosts(g.viewer, id, await body(req))
    await auditAdmin({ req, actor: g.user, action: 'forum.posts.move', targetType: 'forum_thread', targetId: id, metadata: { to: result.id, moved: result.moved } })
    return ok(result)
  } catch (error) { return failure(error) }
}

/** PATCH /api/forum/threads/:id/settings { closeHours | closeAt | slowMode | listed } */
export async function PATCH_topic_settings(req: NextRequest, { params }: Ctx) {
  const g = await guard(req)
  if ('response' in g) return g.response
  const id = await numberParam(params)
  const input = await body(req)
  try {
    const result = await topicSettings(g.viewer, id, input)
    await auditAdmin({ req, actor: g.user, action: 'forum.topic.settings', targetType: 'forum_thread', targetId: id, metadata: { fields: Object.keys(input) } })
    return ok(result)
  } catch (error) { return failure(error) }
}

/** GET /api/forum/review — held posts (staff). POST { postId, decision: approve | reject, note } */
export async function GET_review(req: NextRequest) {
  const g = await guard(req)
  if ('response' in g) return g.response
  try { return ok({ items: await reviewQueue(g.viewer) }) } catch (error) { return failure(error) }
}

export async function POST_review(req: NextRequest) {
  const g = await guard(req)
  if ('response' in g) return g.response
  const input = await body(req)
  try {
    const decision = input.decision === 'reject' ? 'reject' : 'approve'
    const result = await reviewPost(g.viewer, Number(input.postId), decision, String(input.note || '').slice(0, 300))
    await auditAdmin({ req, actor: g.user, action: `forum.review.${decision}`, targetType: 'forum_post', targetId: Number(input.postId), metadata: {} })
    return ok(result)
  } catch (error) { return failure(error) }
}

/** PUT /api/forum/categories/:id/level { level: WATCHING | WATCHING_FIRST | TRACKING | NORMAL | MUTED } */
export async function PUT_category_level(req: NextRequest, { params }: Ctx) {
  const g = await guard(req)
  if ('response' in g) return g.response
  try { return ok(await setCategoryLevel(g.viewer, await numberParam(params), (await body(req)).level)) } catch (error) { return failure(error) }
}

// ------------------------------------------------------------------ personal messages

/** GET /api/forum/messages?box=&page= · POST { to, groups, title, content } */
export async function GET_messages(req: NextRequest) {
  const g = await guard(req)
  if ('response' in g) return g.response
  return ok(await inbox(g.viewer, req.nextUrl.searchParams.get('box'), req.nextUrl.searchParams.get('page')))
}

export async function POST_messages(req: NextRequest) {
  const g = await guard(req)
  if ('response' in g) return g.response
  try { return ok(await startConversation(g.viewer, await body(req)), 201) } catch (error) { return failure(error) }
}

/** POST /api/forum/messages/:id { content } · PATCH { action: archive | unarchive | leave | invite, to } */
export async function POST_message_reply(req: NextRequest, { params }: Ctx) {
  const g = await guard(req)
  if ('response' in g) return g.response
  try { return ok(await replyConversation(g.viewer, await numberParam(params), await body(req)), 201) } catch (error) { return failure(error) }
}

export async function PATCH_message(req: NextRequest, { params }: Ctx) {
  const g = await guard(req)
  if ('response' in g) return g.response
  try { return ok(await conversationAction(g.viewer, await numberParam(params), await body(req))) } catch (error) { return failure(error) }
}
