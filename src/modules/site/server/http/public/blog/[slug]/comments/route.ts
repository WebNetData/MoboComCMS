import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { requireUser } from '@/modules/identity/server/access'
import { rateLimitHit } from '@/platform/http/rate-limit'
import { getJournalSettings } from '@/modules/journal/server/admin'
import { isPublishedPost } from '@/modules/journal/domain/journal'
import { queueCommentNotification } from '@/modules/journal/server/comment-notification-intents'
import { pictureOf } from '@/modules/identity/domain/picture'
import { opensAudience } from '@/modules/account/server/item-audience'
import { humanCheckRefusal } from '@/modules/identity/server/human-check'

const who = (user: { name: string | null; telegramPhoto: string | null; userProfile: { avatar: string } | null }) => ({ name: user.name || 'Member', avatar: pictureOf(user) })

type Context = { params: Promise<{ slug: string }> }

export async function GET(req: NextRequest, { params }: Context) {
  const { slug } = await params
  const post = await db.post.findUnique({ where: { slug }, select: { id: true, status: true, publishedAt: true, audienceGroups: true } })
  if (!post || !isPublishedPost(post) || !await opensAudience(post.audienceGroups, 'post')) return err('not found', 404)
  const requested = Number(req.nextUrl.searchParams.get('page') || 1)
  const page = Number.isSafeInteger(requested) ? Math.min(1000, Math.max(1, requested)) : 1
  // A comment its author deleted stays as an empty placeholder while it still has published answers.
  const where = { postId: post.id, parentId: null, OR: [{ status: 'APPROVED' }, { status: 'DELETED', replies: { some: { status: 'APPROVED' } } }] }
  const [total, comments] = await Promise.all([
    db.postComment.count({ where }),
    db.postComment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * 20,
      take: 20,
      select: {
        id: true, body: true, createdAt: true, status: true,
        user: { select: { name: true, telegramPhoto: true, userProfile: { select: { avatar: true } } } },
        replies: {
          where: { status: 'APPROVED' }, orderBy: { createdAt: 'asc' }, take: 100,
          select: { id: true, body: true, createdAt: true, user: { select: { name: true, telegramPhoto: true, userProfile: { select: { avatar: true } } } } },
        },
      },
    }),
  ])
  // The reader's own picture, for the box they write in (nothing for a visitor).
  const reader = await requireUser(req).catch(() => null)
  const mine = reader ? await db.user.findUnique({ where: { id: reader.id }, select: { telegramPhoto: true, userProfile: { select: { avatar: true } } } }) : null
  return ok({ comments: comments.map(({ status, ...comment }) => ({ ...comment, ...(status === 'DELETED' ? { body: '', deleted: true, user: { name: '', avatar: '' } } : { user: who(comment.user) }), replies: comment.replies.map(reply => ({ ...reply, user: who(reply.user) })) })), total, page, pages: Math.max(1, Math.ceil(total / 20)), viewer: mine ? { avatar: pictureOf(mine) } : null })
}

export async function POST(req: NextRequest, { params }: Context) {
  const user = await requireUser(req)
  if (!user) return err('unauthorized', 401)
  const { slug } = await params
  const post = await db.post.findUnique({ where: { slug }, select: { id: true, status: true, publishedAt: true, audienceGroups: true } })
  if (!post || !isPublishedPost(post) || !await opensAudience(post.audienceGroups, 'post')) return err('not found', 404)
  const body = await req.json().catch(() => null)
  const refused = await humanCheckRefusal(body?.humanCheck, req.headers, 'comment')
  if (refused) return refused
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
  const comment = await db.$transaction(async tx => {
    const created = await tx.postComment.create({ data: { postId: post.id, userId: user.id, parentId, body: text, status: autoApproveComments ? 'APPROVED' : 'PENDING' } })
    if (created.status === 'APPROVED') await queueCommentNotification(tx, created.id, 'auto')
    return created
  })
  return ok({ id: comment.id, status: comment.status }, 201)
}
