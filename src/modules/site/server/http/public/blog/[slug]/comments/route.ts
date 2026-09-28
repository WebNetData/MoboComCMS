import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { requireUser } from '@/modules/identity/server/access'
import { rateLimitHit } from '@/platform/http/rate-limit'
import { getJournalSettings } from '@/modules/journal/server/admin'

type Context = { params: Promise<{ slug: string }> }

export async function GET(req: NextRequest, { params }: Context) {
  const { slug } = await params
  const post = await db.post.findUnique({ where: { slug }, select: { id: true, status: true } })
  if (!post || post.status !== 'PUBLISHED') return err('not found', 404)
  const requested = Number(req.nextUrl.searchParams.get('page') || 1)
  const page = Number.isSafeInteger(requested) ? Math.min(1000, Math.max(1, requested)) : 1
  const where = { postId: post.id, status: 'APPROVED', parentId: null }
  const [total, comments] = await Promise.all([
    db.postComment.count({ where }),
    db.postComment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * 20,
      take: 20,
      select: {
        id: true, body: true, createdAt: true,
        user: { select: { name: true } },
        replies: {
          where: { status: 'APPROVED' }, orderBy: { createdAt: 'asc' }, take: 100,
          select: { id: true, body: true, createdAt: true, user: { select: { name: true } } },
        },
      },
    }),
  ])
  return ok({ comments: comments.map(comment => ({ ...comment, user: { name: comment.user.name || 'Member' }, replies: comment.replies.map(reply => ({ ...reply, user: { name: reply.user.name || 'Member' } })) })), total, page, pages: Math.max(1, Math.ceil(total / 20)) })
}

export async function POST(req: NextRequest, { params }: Context) {
  const user = await requireUser(req)
  if (!user) return err('unauthorized', 401)
  const { slug } = await params
  const post = await db.post.findUnique({ where: { slug }, select: { id: true, status: true } })
  if (!post || post.status !== 'PUBLISHED') return err('not found', 404)
  const body = await req.json().catch(() => null)
  const text = typeof body?.body === 'string' ? body.body.trim() : ''
  if (text.length < 2 || text.length > 2000 || /[<>]/.test(text)) return err('Comment must be 2–2000 plain-text characters / نظر باید متن ساده با طول ۲ تا ۲۰۰۰ کاراکتر باشد')
  const parentId = body?.parentId == null ? null : Number(body.parentId)
  if (parentId !== null) {
    if (!Number.isSafeInteger(parentId) || parentId <= 0) return err('invalid parent')
    const parent = await db.postComment.findFirst({ where: { id: parentId, postId: post.id, status: 'APPROVED', parentId: null }, select: { id: true } })
    if (!parent) return err('parent comment not found', 404)
  }
  if (!rateLimitHit(`post-comment:${user.id}`, 3, 60_000).ok) return err('Please wait before commenting again / کمی بعد دوباره تلاش کنید', 429)
  const { autoApproveComments } = await getJournalSettings()
  const comment = await db.postComment.create({ data: { postId: post.id, userId: user.id, parentId, body: text, status: autoApproveComments ? 'APPROVED' : 'PENDING' } })
  return ok({ id: comment.id, status: comment.status }, 201)
}
