import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { auditAdmin } from '@/platform/audit/server'
import { notifyCommentPublished } from '@/modules/journal/server/comment-notifications'

export async function GET(req: NextRequest) {
  if (!await requirePerm(req, 'cms.posts')) return err('forbidden', 403)
  const status = req.nextUrl.searchParams.get('status') || 'PENDING'
  if (!['PENDING', 'APPROVED', 'REJECTED', 'ALL'].includes(status)) return err('invalid status')
  const requested = Number(req.nextUrl.searchParams.get('page') || 1)
  const page = Number.isSafeInteger(requested) ? Math.min(1000, Math.max(1, requested)) : 1
  const where = status === 'ALL' ? undefined : { status }
  const [total, comments] = await Promise.all([db.postComment.count({ where }), db.postComment.findMany({
    where,
    orderBy: { createdAt: 'desc' }, skip: (page - 1) * 30, take: 30,
    include: { post: { select: { slug: true, title: true, titleEn: true } }, user: { select: { name: true, email: true } } },
  })])
  return ok({ comments: comments.map(({ id, body, status, createdAt, post, user, parentId }) => ({ id, body, status, createdAt, post, user, parentId })), total, page, pages: Math.max(1, Math.ceil(total / 30)) })
}

export async function PATCH(req: NextRequest) {
  const admin = await requirePerm(req, 'cms.posts')
  if (!admin) return err('forbidden', 403)
  const body = await req.json().catch(() => null)
  const id = Number(body?.id)
  const status = body?.status
  if (!Number.isSafeInteger(id) || id <= 0 || !['APPROVED', 'REJECTED', 'PENDING'].includes(status)) return err('invalid input')
  const existing = await db.postComment.findUnique({ where: { id }, select: { id: true, parentId: true, postId: true, status: true } })
  if (!existing) return err('not found', 404)
  if (status === 'APPROVED' && existing.parentId) {
    const parent = await db.postComment.findFirst({ where: { id: existing.parentId, postId: existing.postId, status: 'APPROVED' }, select: { id: true } })
    if (!parent) return err('approve the parent first', 409)
  }
  await db.postComment.update({ where: { id }, data: { status } })
  if (status === 'APPROVED' && existing.status !== 'APPROVED') await notifyCommentPublished(id, 'moderator')
  await auditAdmin({ req, actor: admin, action: 'post_comment.moderate', targetType: 'PostComment', targetId: id, metadata: { status, postId: existing.postId } })
  return ok({ id, status })
}
