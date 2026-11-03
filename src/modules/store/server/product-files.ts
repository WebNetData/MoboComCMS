import type { Prisma } from '@prisma/client'
import type { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { requirePerm } from '@/modules/identity/server/access'
import { auditAdminStrict } from '@/platform/audit/server'
import { sectionSettingsRevision } from '@/modules/settings/server'
import { isModuleEnabled } from '@/extensions/server/modules'
import { isPublishedProduct } from '@/modules/catalog/domain/product-publication'
import { hasVerifiedProductPurchase } from '@/modules/catalog/server/purchase-eligibility'
import { userOpensAudience } from '@/modules/account/server/item-audience'
import { userOpensSection } from '@/modules/account/server/section-access'
import { sectionClosedFor } from '@/modules/account/server/maintenance-access'
import { isMember, opensMembersOnly } from '@/modules/membership/server/membership'
import { groupDeal } from '@/modules/account/server/user-groups'
import { unitPrice } from '@/modules/store/server/pricing'
import { setDigitalMode } from '@/modules/store/server/digital-codes'
import { StoreError } from '@/modules/store/domain/store'
import { transitionOrder } from '@/modules/store/server/orders'

export const productFileView = (row: { id: number; label: string; filename: string; sizeBytes: bigint; sha256: string; active: boolean }) => ({ id: row.id, label: row.label, filename: row.filename, sizeBytes: row.sizeBytes.toString(), sha256: row.sha256, active: row.active })
export async function productFilesSnapshot(productId: number, reader: Prisma.TransactionClient = db) {
  const product = await reader.product.findUnique({ where: { id: productId }, select: { id: true, kind: true, digitalMode: true, openAmount: true, isService: true } })
  if (!product) throw new StoreError('محصول پیدا نشد', 404)
  const rows = await reader.productFile.findMany({ where: { productId }, orderBy: { id: 'asc' }, take: 100 })
  return { product, files: rows.map(productFileView), revision: sectionSettingsRevision({ mode: product.digitalMode, files: rows.map(row => [row.id, row.label, row.filename, row.sha256, row.active]) }) }
}

/** Metadata and strict audit are atomic; blob allocation/cleanup belongs to Media and its HTTP adapter. */
export async function writeProductFiles(req: NextRequest, productId: number, input: Record<string, unknown>, upload?: { storageKey: string; sizeBytes: bigint; sha256: string; filename: string }) {
  return db.$transaction(async tx => {
    const actor = await requirePerm(req, 'cms.products', tx)
    if (!actor) throw new StoreError('دسترسی فعلی کافی نیست', 403)
    await tx.$queryRaw`SELECT "id" FROM "Product" WHERE "id" = ${productId} FOR UPDATE`
    const before = await productFilesSnapshot(productId, tx)
    if (before.product.kind !== 'VIRTUAL') throw new StoreError('فایل فروشی فقط برای محصول مجازی است')
    if (typeof input.revision !== 'string' || input.revision !== before.revision) throw new StoreError('فایل‌ها یا روش تحویل تغییر کرده است؛ فهرست را تازه کنید', 409, 'FILES_CONFLICT')
    let fileId: number | undefined
    if (upload) {
      if (before.files.length >= 100) throw new StoreError('هر محصول حداکثر ۱۰۰ فایل دارد')
      const label = String(input.label || upload.filename).trim().slice(0, 180)
      const row = await tx.productFile.create({ data: { productId, ...upload, label } }); fileId = row.id
    } else if (input.action === 'delivery') {
      if (input.mode !== 'FILES' && input.mode !== 'MANUAL') throw new StoreError('روش تحویل معتبر نیست')
      if (input.mode === 'FILES' && !before.files.some(row => row.active)) throw new StoreError('ابتدا دست‌کم یک فایل فعال اضافه کنید')
      await setDigitalMode(productId, input.mode, tx)
    } else if (input.action === 'save') {
      fileId = Number(input.fileId)
      if (!Number.isSafeInteger(fileId) || fileId <= 0 || typeof input.active !== 'boolean') throw new StoreError('فایل معتبر نیست')
      const label = String(input.label || '').trim().slice(0, 180)
      if (!label) throw new StoreError('عنوان فایل را بنویسید')
      if ((await tx.productFile.updateMany({ where: { id: fileId, productId }, data: { label, active: input.active } })).count !== 1) throw new StoreError('فایل پیدا نشد', 404)
    } else throw new StoreError('عملیات معتبر نیست')
    await auditAdminStrict({ req, actor, action: upload ? 'store.file.add' : `store.file.${input.action}`, targetType: 'product', targetId: productId, metadata: { fileId, ...(upload ? { filename: upload.filename, sizeBytes: upload.sizeBytes.toString(), sha256: upload.sha256 } : { label: input.label, active: input.active, mode: input.mode }) } }, tx)
    return productFilesSnapshot(productId, tx)
  })
}

export async function productFileAccess(productId: number, userId: number | null) {
  if (!await isModuleEnabled('store') || !await userOpensSection('store', userId) || await sectionClosedFor('store', userId)) return null
  const product = await db.product.findUnique({ where: { id: productId }, include: { variants: { where: { active: true } } } })
  if (!product || !isPublishedProduct(product) || product.kind !== 'VIRTUAL' || product.digitalMode !== 'FILES' || !await userOpensAudience(product.audienceGroups, 'product', userId)) return null
  const member = await isMember(userId)
  if (product.access === 'MEMBERS' && !await opensMembersOnly(userId, member)) return null
  const deal = await groupDeal(userId, [productId])
  const price = unitPrice(product, null, member, undefined, deal)
  const bought = !!userId && await hasVerifiedProductPurchase(userId, productId, true)
  const free = !!userId && (product.variants.length ? product.variants.some(variant => unitPrice(product, variant, member, undefined, deal).unitMinor === 0n) : price.unitMinor === 0n)
  const files = await db.productFile.findMany({ where: { productId, active: true }, orderBy: { id: 'asc' }, select: { id: true, label: true, filename: true, sizeBytes: true, sha256: true, active: true } })
  return { open: bought || free, reason: bought ? 'purchased' as const : free ? 'free' as const : userId ? 'buy' as const : 'login' as const, files: files.map(productFileView) }
}

/** Existing buyer account/order page composes attachments through this address. */
export async function orderFileProducts(userId: number, orderId: number) {
  const order = await db.order.findFirst({ where: { id: orderId, userId, status: 'PAID', invoice: { status: 'PAID' } }, select: { productId: true, lines: { select: { productId: true } } } })
  if (!order) return []
  const ids = [...new Set([order.productId, ...order.lines.map(line => line.productId)].filter((id): id is number => id !== null))]
  const products = await db.product.findMany({ where: { id: { in: ids }, digitalMode: 'FILES' }, select: { id: true, name: true, slug: true } })
  const views = await Promise.all(products.map(async product => ({ product, access: await productFileAccess(product.id, userId) })))
  return views.filter(view => view.access?.open)
}

/** All-file orders finish through the existing delivery state claim; mixed orders keep their own workflow. */
export async function deliverProductFiles(orderId: number) {
  const order = await db.order.findUnique({ where: { id: orderId }, select: { status: true, product: { select: { digitalMode: true } }, lines: { select: { kind: true, product: { select: { digitalMode: true } } } }, productDelivery: { select: { status: true } } } })
  if (!order || order.status !== 'PAID' || !order.productDelivery || !['PENDING', 'PROCESSING'].includes(order.productDelivery.status)) return
  const allFiles = order.lines.length ? order.lines.every(line => line.kind === 'VIRTUAL' && line.product?.digitalMode === 'FILES') : order.product?.digitalMode === 'FILES'
  if (allFiles) await transitionOrder({ orderId, to: 'DELIVERED', actorId: null, note: 'فایل‌های محصول از صفحهٔ محصول و جزئیات سفارش قابل دریافت‌اند' })
}
