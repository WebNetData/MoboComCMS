import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { requireUser } from '@/modules/identity/server/access'
import { isStoreEnabled } from '@/modules/catalog/server/storefront'
import { clientIp, rateLimitHit } from '@/platform/http/rate-limit'
import { reviewScore } from '@/modules/catalog/domain/review-score'
import { isPublicProduct } from '@/modules/catalog/domain/product-publication'

type Context = { params: Promise<{ slug: string }> }

export async function POST(req: NextRequest, { params }: Context) {
  if (!await isStoreEnabled()) return err('not found', 404)
  const { slug } = await params
  const product = await db.product.findUnique({ where: { slug }, select: { id: true, active: true, approval: true } })
  if (!product || !isPublicProduct(product)) return err('not found', 404)
  const input = await req.json().catch(() => null)
  const kind = input?.kind
  const body = String(input?.body || '').trim()
  if (body.length < 10 || body.length > 3000 || /[<>]/.test(body)) return err('Use 10–3000 plain-text characters / متن ساده با طول ۱۰ تا ۳۰۰۰ نویسه وارد کنید')
  const user = await requireUser(req)
  if (!rateLimitHit(`product-feedback:ip:${clientIp(req.headers)}`, 5, 60_000).ok) return err('Please try again later / کمی بعد تلاش کنید', 429)
  if (user && !rateLimitHit(`product-feedback:user:${user.id}`, 4, 60_000).ok) return err('Please try again later / کمی بعد تلاش کنید', 429)
  if (kind === 'question') {
    const guestName = user ? '' : String(input?.guestName || '').trim()
    if (!user && (guestName.length < 2 || guestName.length > 80 || /[<>]/.test(guestName))) return err('Enter your name / نام خود را وارد کنید')
    const row = await db.productQuestion.create({ data: { productId: product.id, userId: user?.id || null, guestName, body } })
    return ok({ id: row.id, status: row.status }, 201)
  }
  if (kind !== 'review') return err('invalid feedback type')
  if (!user) return err('Login required / ابتدا وارد حساب شوید', 401)
  const score = reviewScore(input)
  const title = String(input?.title || '').trim()
  if (!score || title.length > 150 || /[<>]/.test(title)) return err('Invalid rating or title')
  const purchased = await db.order.count({ where: { userId: user.id, productId: product.id, status: 'PAID', invoice: { status: 'PAID' } } })
  if (!purchased) return err('Only verified buyers can review this product / فقط خریداران این محصول می‌توانند نظر ثبت کنند', 403)
  const existing = await db.productReview.findUnique({ where: { productId_userId: { productId: product.id, userId: user.id } } })
  if (existing) return err('You have already reviewed this product / قبلاً برای این محصول نظر ثبت کرده‌اید', 409)
  try {
    const row = await db.productReview.create({ data: { productId: product.id, userId: user.id, rating: score.rating, criteria: JSON.stringify(score.criteria), title, body } })
    return ok({ id: row.id, status: row.status }, 201)
  } catch (error: any) {
    if (error?.code === 'P2002') return err('You have already reviewed this product / قبلاً برای این محصول نظر ثبت کرده‌اید', 409)
    throw error
  }
}
