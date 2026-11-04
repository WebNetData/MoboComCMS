import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { moduleGuard } from '@/extensions/server/modules'
import { requireUser } from '@/modules/identity/server/access'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { auditAdmin } from '@/platform/audit/server'
import { ProfileError } from '@/modules/identity/domain/profile'
import {
  block, follow, followList, myProfile, peopleDirectory, profileByUsername, readProfileMedia, saveProfileMedia, suggestions, unblock, unfollow, updateUserProfile,
} from '@/modules/identity/server/profile'
import { CommunityError } from '@/modules/community/domain/community'
import { addComment, createPost, deleteComment, deletePost, editPost, getPost, homeFeed, pinPost, profilePosts, report, toggleLike } from '@/modules/community/server/community'
import { communityDashboard, moderatePost, moderationPosts, resolveReport, reportQueue, setVerified, verificationList } from '@/modules/community/server/admin'
import { humanCheckRefusal } from '@/modules/identity/server/human-check'

function failure(error: unknown) {
  if (error instanceof CommunityError || error instanceof ProfileError) return err(error.message, error.status, { code: error.code })
  console.error('[community]', error)
  return err('خطای داخلی؛ دوباره تلاش کنید', 500)
}

const id = (value: unknown) => { const n = Number(value); return Number.isSafeInteger(n) && n > 0 ? n : 0 }
const body = async (req: NextRequest) => ((await req.json().catch(() => null)) || {}) as Record<string, unknown>
type Ctx = { params: Promise<Record<string, string>> }

async function member(req: NextRequest) {
  const off = await moduleGuard('community')
  if (off) return { response: off }
  const user = await requireUser(req)
  if (!user) return { response: err('برای این کار وارد حساب کاربری شوید', 401, { code: 'LOGIN_REQUIRED' }) }
  return { user }
}

// ------------------------------------------------------------------ own profile (core identity)

/** GET /api/profile/public — the signed-in member's public profile for editing. */
export async function GET_myProfile(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return err('وارد شوید', 401)
  try { return ok(await myProfile(user.id)) } catch (error) { return failure(error) }
}

/** PATCH /api/profile/public { username?, name?, headline?, bio?, location?, website?, avatar?, cover?, links?, privacy? } */
export async function PATCH_myProfile(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return err('وارد شوید', 401)
  try { await updateUserProfile(user.id, await body(req)); return ok(await myProfile(user.id)) } catch (error) { return failure(error) }
}

/** POST /api/profile/media (multipart "file") → { url } */
export async function POST_media(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return err('وارد شوید', 401)
  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  try { return ok(await saveProfileMedia(user.id, file instanceof File ? file : null)) } catch (error) { return failure(error) }
}

/** GET /api/profile/media/:name */
export async function GET_media(req: NextRequest, ctx: Ctx) {
  const { name } = await ctx.params
  const media = await readProfileMedia(name, Number(req.nextUrl.searchParams.get('w')) || 0)
  if (!media) return new NextResponse('Not found', { status: 404 })
  return new NextResponse(new Uint8Array(media.bytes), { headers: { 'content-type': media.type, 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' } })
}

// ------------------------------------------------------------------ people

/** GET /api/people?q=&sort=&page=  ·  GET /api/people?suggest=1 */
export async function GET_people(req: NextRequest) {
  const off = await moduleGuard('community')
  if (off) return off
  const user = await requireUser(req)
  const params = req.nextUrl.searchParams
  if (params.get('suggest')) return ok({ people: await suggestions(user?.id ?? null, 8) })
  return ok(await peopleDirectory({ q: params.get('q') || '', sort: params.get('sort') || '', page: Number(params.get('page')) || 1 }, user?.id ?? null))
}

async function target(username: string) {
  const found = await profileByUsername(username)
  if (!found) throw new ProfileError('کاربر پیدا نشد', 404, 'NOT_FOUND')
  return found
}

/** POST /api/people/:username/follow { on } */
export async function POST_follow(req: NextRequest, ctx: Ctx) {
  const g = await member(req)
  if ('response' in g) return g.response
  const { username } = await ctx.params
  try {
    const owner = await target(username)
    const input = await body(req)
    if (input.on === false) await unfollow(g.user.id, owner.profile.userId)
    else await follow(g.user.id, owner.profile.userId)
    const after = await target(username)
    return ok({ following: input.on !== false, followers: after.profile.followers })
  } catch (error) { return failure(error) }
}

/** POST /api/people/:username/block { on } */
export async function POST_block(req: NextRequest, ctx: Ctx) {
  const g = await member(req)
  if ('response' in g) return g.response
  const { username } = await ctx.params
  try {
    const owner = await target(username)
    const input = await body(req)
    if (input.on === false) await unblock(g.user.id, owner.profile.userId)
    else await block(g.user.id, owner.profile.userId)
    return ok({ blocked: input.on !== false })
  } catch (error) { return failure(error) }
}

/** GET /api/people/:username/followers|following?page= */
export async function GET_follows(req: NextRequest, ctx: Ctx) {
  const off = await moduleGuard('community')
  if (off) return off
  const { username, list } = await ctx.params
  if (list !== 'followers' && list !== 'following') return err('not found', 404)
  const user = await requireUser(req)
  try {
    const owner = await target(username)
    return ok(await followList(owner.profile.userId, list, user?.id ?? null, Number(req.nextUrl.searchParams.get('page')) || 1))
  } catch (error) { return failure(error) }
}

/** GET /api/people/:username/posts?cursor= */
export async function GET_profilePosts(req: NextRequest, ctx: Ctx) {
  const off = await moduleGuard('community')
  if (off) return off
  const { username } = await ctx.params
  const user = await requireUser(req)
  try {
    const owner = await target(username)
    return ok(await profilePosts(owner.profile.userId, user?.id ?? null, req.nextUrl.searchParams.get('cursor') || undefined))
  } catch (error) { return failure(error) }
}

// ------------------------------------------------------------------ posts

/** GET /api/community/feed?mode=following|all&tag=&cursor= */
export async function GET_feed(req: NextRequest) {
  const off = await moduleGuard('community')
  if (off) return off
  const user = await requireUser(req)
  const params = req.nextUrl.searchParams
  return ok(await homeFeed(user?.id ?? null, { mode: params.get('mode') || '', tag: params.get('tag') || '', cursor: params.get('cursor') || '' }))
}

/** POST /api/community/posts { content, images, visibility, item? } */
export async function POST_posts(req: NextRequest) {
  const g = await member(req)
  if ('response' in g) return g.response
  const input = await body(req)
  const refused = await humanCheckRefusal(input.humanCheck, req.headers, 'community')
  if (refused) return refused
  try { return ok({ post: await createPost(g.user.id, input) }, 201) } catch (error) { return failure(error) }
}

/** GET /api/community/posts/:id */
export async function GET_post(req: NextRequest, ctx: Ctx) {
  const off = await moduleGuard('community')
  if (off) return off
  const user = await requireUser(req)
  try { return ok({ post: await getPost(id((await ctx.params).id), user?.id ?? null) }) } catch (error) { return failure(error) }
}

/** PATCH /api/community/posts/:id { content?, visibility?, pin? } */
export async function PATCH_post(req: NextRequest, ctx: Ctx) {
  const g = await member(req)
  if ('response' in g) return g.response
  const postId = id((await ctx.params).id)
  const input = await body(req)
  try {
    if (input.pin !== undefined) return ok(await pinPost(g.user.id, input.pin ? postId : null))
    return ok({ post: await editPost(g.user.id, postId, input) })
  } catch (error) { return failure(error) }
}

/** DELETE /api/community/posts/:id */
export async function DELETE_post(req: NextRequest, ctx: Ctx) {
  const g = await member(req)
  if ('response' in g) return g.response
  try { return ok(await deletePost(g.user.id, id((await ctx.params).id))) } catch (error) { return failure(error) }
}

/** POST /api/community/posts/:id/like { on } */
export async function POST_like(req: NextRequest, ctx: Ctx) {
  const g = await member(req)
  if ('response' in g) return g.response
  try { return ok(await toggleLike(g.user.id, id((await ctx.params).id), (await body(req)).on !== false)) } catch (error) { return failure(error) }
}

/** POST /api/community/posts/:id/comments { content } */
export async function POST_comment(req: NextRequest, ctx: Ctx) {
  const g = await member(req)
  if ('response' in g) return g.response
  const input = await body(req)
  const refused = await humanCheckRefusal(input.humanCheck, req.headers, 'community')
  if (refused) return refused
  try { return ok({ comment: await addComment(g.user.id, id((await ctx.params).id), input) }, 201) } catch (error) { return failure(error) }
}

/** DELETE /api/community/comments/:id */
export async function DELETE_comment(req: NextRequest, ctx: Ctx) {
  const g = await member(req)
  if ('response' in g) return g.response
  try { return ok(await deleteComment(g.user.id, id((await ctx.params).id))) } catch (error) { return failure(error) }
}

/** POST /api/community/reports { postId? commentId? reason note } */
export async function POST_report(req: NextRequest) {
  const g = await member(req)
  if ('response' in g) return g.response
  try { return ok(await report(g.user.id, await body(req))) } catch (error) { return failure(error) }
}

// ------------------------------------------------------------------ admin

const moderator = (req: NextRequest) => adminGuard(req, 'community', ['community.moderate', 'users.manage'])

/** GET /api/admin/community?section=dashboard|reports|posts|people&… */
export async function GET_admin(req: NextRequest) {
  const g = await moderator(req)
  if ('response' in g) return g.response
  const params = req.nextUrl.searchParams
  const section = params.get('section') || 'dashboard'
  if (section === 'reports') return ok(await reportQueue(params.get('status') || 'OPEN'))
  if (section === 'posts') return ok(await moderationPosts({ q: params.get('q') || '', status: params.get('status') || '', page: Number(params.get('page')) || 1 }))
  if (section === 'people') return ok(await verificationList({ q: params.get('q') || '', verified: params.get('verified') || '', page: Number(params.get('page')) || 1 }))
  return ok(await communityDashboard())
}

/** POST /api/admin/community { action: resolve|dismiss|hide|restore|verify|unverify, id } */
export async function POST_admin(req: NextRequest) {
  const g = await moderator(req)
  if ('response' in g) return g.response
  const input = await body(req)
  const action = String(input.action || '')
  const target = id(input.id)
  if (!target) return err('شناسه نامعتبر است')
  try {
    let result: unknown
    if (action === 'resolve' || action === 'dismiss') result = await resolveReport(target, action, g.admin.id, input.hide === true)
    else if (action === 'hide' || action === 'restore') result = await moderatePost(target, action)
    else if (action === 'verify' || action === 'unverify') result = await setVerified(target, action === 'verify')
    else return err('عملیات نامعتبر است')
    await auditAdmin({ req, actor: g.admin, action: `community.${action}`, targetType: action.includes('verify') ? 'user' : action === 'hide' || action === 'restore' ? 'community_post' : 'community_report', targetId: target, metadata: { hide: input.hide === true } })
    return ok(result)
  } catch (error) { return failure(error) }
}
