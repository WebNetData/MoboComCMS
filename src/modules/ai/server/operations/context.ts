import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { richTextToPlain } from '@/shared/content/sanitize'
import { AI_TOOLS, AiOperationError, type AiOperation } from '../../domain/operations'
import { FULFILMENT_LABEL, canMoveTo } from '@/modules/store/domain/store'
import { productInput } from '@/modules/catalog/server/product-input'
import { validateCategorySelection } from '@/modules/site/server/categories'

export async function operationsContext(allowed: string[]) {
  const permissions = new Set(AI_TOOLS.filter(t => allowed.includes(t.id)).map(t => t.permission))
  const [posts, pages, products, orders, postCategories, productCategories] = await Promise.all([
    permissions.has('cms.posts') ? db.post.findMany({ take: 20, orderBy: { updatedAt: 'desc' }, select: { id: true, title: true, status: true, slug: true } }) : [],
    permissions.has('cms.pages') ? db.page.findMany({ take: 10, orderBy: { updatedAt: 'desc' }, select: { id: true, title: true, status: true, slug: true } }) : [],
    permissions.has('cms.products') ? db.product.findMany({ take: 20, orderBy: { updatedAt: 'desc' }, select: { id: true, name: true, slug: true, currency: true, priceMinor: true, stock: true, active: true } }).then(rows => rows.map(r => ({ ...r, priceMinor: r.priceMinor.toString() }))) : [],
    permissions.has('orders.manage') ? db.order.findMany({ take: 20, orderBy: { updatedAt: 'desc' }, where: { productId: { not: null } }, select: { id: true, status: true, currency: true, totalMinor: true, productDelivery: { select: { status: true } } } }).then(rows => rows.map(r => ({ ...r, totalMinor: r.totalMinor.toString() }))) : [],
    permissions.has('cms.posts') ? db.postCategory.findMany({ take: 50, orderBy: { id: 'asc' }, select: { id: true, name: true } }) : [],
    permissions.has('cms.products') ? db.productCategory.findMany({ take: 50, orderBy: { id: 'asc' }, select: { id: true, name: true, kind: true } }) : [],
  ])
  return { posts, pages, products, orders, postCategories, productCategories, note: 'فقط همین فهرست محدود دیده شده؛ نبودن در فهرست به معنی نبودن در سایت نیست. پول به واحد خرد است؛ قیمت محصول تازه باید مقدار اعشاری دقیق با ارز از کاربر باشد.' }
}
export async function operationPreview(op: AiOperation, reader: Prisma.TransactionClient | typeof db = db) {
  const a = op.args, id = Number(a.id)
  if (op.tool.endsWith('.create')) {
    const where = { slug: String(a.slug) }, existing = op.tool === 'post.create' ? await reader.post.findUnique({ where, select: { id: true } }) : op.tool === 'page.create' ? await reader.page.findUnique({ where, select: { id: true } }) : await reader.product.findUnique({ where, select: { id: true } })
    if (existing) throw new AiOperationError('این نشانی قبلاً ثبت شده است؛ نشانی تازه‌ای پیشنهاد دهید', 409)
    if (op.tool === 'post.create') await validateCategorySelection(reader, { categoryId: a.categoryId })
    if (op.tool === 'product.create') {
      try { await productInput({ ...a, description: a.body }) }
      catch { throw new AiOperationError('اطلاعات محصول با قواعد دسته، قیمت یا موجودی سازگار نیست؛ جزئیات لازم را در فرم محصول تکمیل کنید یا دستهٔ معتبر دیگری انتخاب کنید', 422) }
    }
  }
  if (op.tool === 'post.publish') {
    const row = await reader.post.findUnique({ where: { id }, select: { id: true, title: true, status: true, updatedAt: true, content: true, publishedAt: true } })
    if (!row || !['DRAFT', 'PENDING_REVIEW'].includes(row.status)) throw new AiOperationError('مطلب قابل انتشار پیدا نشد یا وضعیت آن تغییر کرده است', 409)
    return { snapshot: { updatedAt: row.updatedAt.toISOString(), status: row.status }, preview: { targetId: id, href: `/admin/posts?edit=${id}`, title: row.title, body: richTextToPlain(row.content, 24_000), status: 'PUBLISHED', publishedAt: row.publishedAt.toISOString(), warning: 'برای رسانه‌ها و تنظیمات کامل، مطلب را در پنل بازبینی کنید. انتشار و اعلان‌ها طبق تنظیمات فعلی مجله انجام می‌شوند' } }
  }
  if (op.tool.startsWith('order.')) {
    const row = await reader.order.findFirst({ where: { id, productId: { not: null } }, select: { id: true, status: true, updatedAt: true, assigneeId: true, productDelivery: { select: { id: true, status: true, trackingCode: true } } } })
    if (!row) throw new AiOperationError('سفارش فروشگاه پیدا نشد', 404)
    if (op.tool === 'order.transition' && (row.status !== 'PAID' || !row.productDelivery || !canMoveTo(row.productDelivery.status, String(a.status)))) throw new AiOperationError('پیشبرد این سفارش پرداخت‌شده به وضعیت پیشنهادی مجاز نیست', 409)
    return { snapshot: { updatedAt: row.updatedAt.toISOString(), status: row.status, assigneeId: row.assigneeId, delivery: row.productDelivery }, preview: { targetId: id, href: `/admin/store/orders/${id}`, title: `سفارش ${id}`, body: String(a.note), currentStatus: row.productDelivery ? FULFILMENT_LABEL[row.productDelivery.status as keyof typeof FULFILMENT_LABEL] || row.productDelivery.status : 'ثبت نشده', paymentStatus: row.status, status: op.tool === 'order.transition' ? FULFILMENT_LABEL[String(a.status) as keyof typeof FULFILMENT_LABEL] : 'یادداشت داخلی', trackingCode: String(a.trackingCode || ''), warning: 'هیچ پرداخت، بازپرداخت یا پیام مشتری انجام نمی‌شود' } }
  }
  return { snapshot: {}, preview: { ...a, title: String(a.title || a.name), warning: op.tool === 'product.create' ? 'قیمت، موجودی و فعال‌بودن محصول را پیش از تأیید بررسی کنید' : 'متن، واقعیت‌ها و وضعیت انتشار را پیش از تأیید بررسی کنید' } }
}
export async function assertOperationSnapshot(op: AiOperation, stored: string, reader: Prisma.TransactionClient) {
  const now = await operationPreview(op, reader)
  if (JSON.stringify(now.snapshot) !== stored) throw new AiOperationError('رکورد پس از پیشنهاد تغییر کرده است؛ پیشنهاد تازه بگیرید', 409)
}
