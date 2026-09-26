import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { auditAdmin } from '@/platform/audit/server'
import { requirePerm } from '@/modules/identity/server/access'
import { moduleGuard } from '@/extensions/server/modules'
import { ForumError, boardSlug, excerpt } from '@/modules/forum/domain/forum'

// Board management and a moderation feed of the latest posts.

async function guard(req: NextRequest) {
  const off = await moduleGuard('forum')
  if (off) return { response: off }
  const admin = await requirePerm(req, 'forum.moderate') || await requirePerm(req, 'cms.posts')
  return admin ? { admin } : { response: err('forbidden', 403) }
}
const text = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max)

function parseBoard(body: Record<string, unknown>, creating: boolean) {
  const title = text(body.title, 120)
  if (creating && !title) throw new ForumError('عنوان انجمن لازم است')
  return {
    ...(title ? { title } : {}),
    ...(body.slug !== undefined || creating ? { slug: boardSlug(body.slug || body.title) } : {}),
    ...(body.description !== undefined ? { description: text(body.description, 400) } : {}),
    ...(body.icon !== undefined ? { icon: text(body.icon, 8) } : {}),
    ...(body.access !== undefined ? { access: body.access === 'MEMBERS' ? 'MEMBERS' : 'PUBLIC' } : {}),
    ...(body.locked !== undefined ? { locked: body.locked === true } : {}),
    ...(body.sortOrder !== undefined ? { sortOrder: Math.max(-999, Math.min(999, Math.round(Number(body.sortOrder) || 0))) } : {}),
  }
}

export async function GET(req: NextRequest) {
  const g = await guard(req)
  if ('response' in g) return g.response
  const [boards, posts] = await Promise.all([
    db.forumCategory.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }),
    db.forumPost.findMany({ orderBy: { createdAt: 'desc' }, take: 50, include: { user: { select: { id: true, name: true, email: true } }, thread: { select: { id: true, title: true, status: true, pinned: true, locked: true, category: { select: { title: true } } } } } }),
  ])
  return ok({ boards, posts: posts.map((post) => ({ id: post.id, excerpt: excerpt(post.content, 220), status: post.status, createdAt: post.createdAt, user: post.user, thread: post.thread })) })
}

export async function POST(req: NextRequest) {
  const g = await guard(req)
  if ('response' in g) return g.response
  const body = await req.json().catch(() => null)
  try {
    const board = await db.forumCategory.create({ data: parseBoard(body || {}, true) as { title: string; slug: string } })
    await auditAdmin({ req, actor: g.admin, action: 'forum.board.create', targetType: 'ForumCategory', targetId: board.id, metadata: { title: board.title } })
    return ok(board, 201)
  } catch (error) { return failure(error) }
}

export async function PATCH(req: NextRequest) {
  const g = await guard(req)
  if ('response' in g) return g.response
  const body = await req.json().catch(() => null)
  const id = Number(body?.id)
  if (!Number.isSafeInteger(id) || id <= 0) return err('invalid id')
  try {
    const board = await db.forumCategory.update({ where: { id }, data: parseBoard(body, false) })
    await auditAdmin({ req, actor: g.admin, action: 'forum.board.update', targetType: 'ForumCategory', targetId: id, metadata: { title: board.title } })
    return ok(board)
  } catch (error) { return failure(error) }
}

export async function DELETE(req: NextRequest) {
  const g = await guard(req)
  if ('response' in g) return g.response
  const id = Number(req.nextUrl.searchParams.get('id'))
  if (!Number.isSafeInteger(id) || id <= 0) return err('invalid id')
  const threads = await db.forumThread.count({ where: { categoryId: id } })
  if (threads > 0) return err('این انجمن موضوع دارد؛ ابتدا موضوع‌ها را جابه‌جا یا حذف کنید', 409)
  try {
    await db.forumCategory.delete({ where: { id } })
    await auditAdmin({ req, actor: g.admin, action: 'forum.board.delete', targetType: 'ForumCategory', targetId: id })
    return ok({ deleted: true })
  } catch (error) { return failure(error) }
}

function failure(error: unknown) {
  if (error instanceof ForumError) return err(error.message, error.status)
  const message = error instanceof Error ? error.message : ''
  if (/Unique constraint/i.test(message)) return err('این نشانی قبلاً استفاده شده است', 409)
  if (/Record to update not found/i.test(message)) return err('not found', 404)
  return err('invalid input')
}
