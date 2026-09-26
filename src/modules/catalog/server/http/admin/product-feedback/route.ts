import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { auditAdmin } from '@/platform/audit/server'

export async function GET(req: NextRequest) {
  if (!await requirePerm(req, 'cms.products')) return err('forbidden', 403)
  const kind = req.nextUrl.searchParams.get('kind') || 'review'
  const status = req.nextUrl.searchParams.get('status') || 'PENDING'
  if (!['review', 'question'].includes(kind) || !['PENDING', 'APPROVED', 'REJECTED', 'ALL'].includes(status)) return err('invalid filter')
  const pageRaw = Number(req.nextUrl.searchParams.get('page') || 1)
  const page = Number.isSafeInteger(pageRaw) ? Math.min(1000, Math.max(1, pageRaw)) : 1
  const where = status === 'ALL' ? {} : { status }
  const include = { product: { select: { name: true, slug: true } }, user: { select: { name: true, email: true } } }
  const [total, rows] = kind === 'review' ? await Promise.all([
    db.productReview.count({ where }),
    db.productReview.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * 30, take: 30, include }),
  ]) : await Promise.all([
    db.productQuestion.count({ where }),
    db.productQuestion.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * 30, take: 30, include }),
  ])
  return ok({ items: rows, total, page, pages: Math.max(1, Math.ceil(total / 30)) })
}

export async function PATCH(req: NextRequest) {
  const admin = await requirePerm(req, 'cms.products')
  if (!admin) return err('forbidden', 403)
  const body = await req.json().catch(() => null)
  const id = Number(body?.id)
  const kind = body?.kind
  const status = body?.status
  if (!Number.isSafeInteger(id) || id <= 0 || !['review', 'question'].includes(kind) || !['PENDING', 'APPROVED', 'REJECTED'].includes(status)) return err('invalid input')
  if (kind === 'review') {
    const row = await db.productReview.findUnique({ where: { id } })
    if (!row) return err('not found', 404)
    await db.productReview.update({ where: { id }, data: { status } })
  } else {
    const row = await db.productQuestion.findUnique({ where: { id } })
    if (!row) return err('not found', 404)
    const answer = String(body?.answer || '').trim()
    if (answer.length > 3000 || /[<>]/.test(answer)) return err('Invalid answer')
    await db.productQuestion.update({ where: { id }, data: { status, answer } })
  }
  await auditAdmin({ req, actor: admin, action: 'product_feedback.moderate', targetType: kind === 'review' ? 'ProductReview' : 'ProductQuestion', targetId: id, metadata: { status } })
  return ok({ id, status })
}
