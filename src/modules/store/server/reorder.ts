import { db } from '@/platform/database/prisma'
import { isPublishedProduct } from '@/modules/catalog/domain/product-publication'
import { StoreError, lineLimit } from '@/modules/store/domain/store'
import { userOpensAudience } from '@/modules/account/server/item-audience'
import { ruleRefusal } from '@/modules/membership/server/rules'
import { isMember } from '@/modules/membership/server/membership'
import { unitPrice } from '@/modules/store/server/pricing'
import { groupDeal } from '@/modules/account/server/user-groups'
import { minorToNumber } from '@/shared/money'
import { readOrderFields } from '@/modules/store/domain/order-inputs'
import { addToCart, cartView, type CartOwner } from '@/modules/store/server/cart'

type ReorderLine = {
  sourceLineId: number
  productId: number
  variantId: number | null
  slug: string
  name: string
  variantName: string
  quantity: number
  currency: string
  currentUnitPrice: number | null
  priceChanged: boolean
  availableQuantity: number
  eligible: boolean
  needsReview: boolean
  issue: string
  productUrl: string
}

const orderWhere = (userId: number, orderId: number) => ({ id: orderId, userId, productId: { not: null } })

/** Reorder preview is always derived from the customer's owned order and today's catalogue. */
export async function previewReorder(userId: number, orderId: number) {
  const order = await db.order.findFirst({
    where: orderWhere(userId, orderId),
    include: {
      lines: { orderBy: { line: 'asc' }, include: { product: { include: { variants: true } } } },
      product: { include: { variants: true } },
    },
  })
  if (!order) throw new StoreError('سفارش پیدا نشد', 404, 'ORDER_NOT_FOUND')

  const rawLines = order.lines.length ? order.lines.map(line => ({
    sourceLineId: line.id, productId: line.productId, variantKey: line.variantId || 0, quantity: line.quantity,
    oldName: line.name, oldVariantName: line.variantName, savedInputs: line.inputs, oldUnitMinor: line.unitPriceMinor, product: line.product,
  })) : (() => {
    const meta = (() => { try { return JSON.parse(order.meta || '{}') as Record<string, unknown> } catch { return {} } })()
    const productId = Number(meta.productId || order.productId)
    return order.product ? [{ sourceLineId: 0, productId, variantKey: Number(meta.variantId) || 0, quantity: 1, oldName: order.product.name, oldVariantName: String(meta.variantName || ''), savedInputs: '', oldUnitMinor: null, product: order.product }] : []
  })()

  const member = await isMember(userId)
  const deals = await groupDeal(userId, [...new Set(rawLines.map(line => line.productId).filter((id): id is number => typeof id === 'number' && Number.isSafeInteger(id) && id > 0))])
  const lines: ReorderLine[] = []
  for (const line of rawLines) {
    const product = line.productId ? line.product : null
    const variant = product && line.variantKey ? product.variants.find(row => row.id === line.variantKey && row.active) || null : null
    const variantId = variant?.id ?? null
    const variantName = variant?.name || ''
    const needsReview = !!(line.savedInputs && line.savedInputs !== '[]') || !!product?.openAmount || product?.isService === true || readOrderFields(product?.orderFields || '').length > 0
    let issue = ''
    let availableQuantity = 0
    let currentUnitPrice: number | null = null
    let priceChanged = product?.currency !== order.currency
    let visible = false
    if (!product || !isPublishedProduct(product) || !await userOpensAudience(product.audienceGroups, 'product', userId)) issue = 'این کالا دیگر در فروشگاه در دسترس نیست'
    else if (product.access === 'MEMBERS' && !member) issue = 'این کالا مخصوص اعضای ویژه است'
    else if (await ruleRefusal(userId, [{ ownerType: 'product', ownerId: product.id }])) issue = 'این کالا برای سطح دسترسی شما باز نیست'
    else if ((line.variantKey && !variant) || (!line.variantKey && product.variants.some(row => row.active))) issue = 'نوع کالا تغییر کرده؛ گزینهٔ فعلی را در صفحهٔ کالا انتخاب کنید'
    else {
      visible = true
      const limit = lineLimit(product.stock, variant ? variant.stock : null, product.maxPerOrder)
      availableQuantity = Math.min(line.quantity, limit)
      if (limit < 1) issue = 'این کالا یا نوع انتخاب‌شده ناموجود است'
      else if (availableQuantity < line.quantity) issue = `فقط ${availableQuantity.toLocaleString('fa-IR')} عدد موجود است؛ تعداد سفارش تغییر کرده`
      else if (needsReview) issue = 'اطلاعات لازم برای این خدمت را دوباره در صفحهٔ کالا وارد کنید'
      const priced = unitPrice(product, variant, member, new Date(), deals)
      currentUnitPrice = minorToNumber(priced.unitMinor, priced.currency)
      priceChanged = priceChanged || (line.oldUnitMinor !== null && priced.unitMinor !== line.oldUnitMinor)
    }
    if (needsReview && !issue) issue = 'اطلاعات این خدمت را دوباره در صفحهٔ کالا وارد کنید'
    const eligible = !needsReview && availableQuantity > 0 && currentUnitPrice !== null
    lines.push({
      sourceLineId: line.sourceLineId, productId: line.productId || 0, variantId, slug: visible ? product!.slug : '',
      name: visible ? product!.name : line.oldName, variantName: visible ? variantName || line.oldVariantName : line.oldVariantName, quantity: line.quantity,
      currency: visible ? product!.currency : order.currency, currentUnitPrice, priceChanged: visible && priceChanged, availableQuantity, eligible, needsReview, issue,
      productUrl: visible ? `/products/${encodeURIComponent(product!.slug)}` : '/products',
    })
  }
  return { orderId, currency: order.currency, lines }
}

/** Add only still-eligible lines through the canonical cart writer; no order metadata is replayed. */
export async function addReorderToCart(owner: CartOwner, orderId: number, sourceLineIds: number[]) {
  if (!owner.userId) throw new StoreError('برای سفارش مجدد وارد حساب شوید', 401, 'LOGIN_REQUIRED')
  if (!Array.isArray(sourceLineIds) || sourceLineIds.length < 1 || sourceLineIds.length > 50) throw new StoreError('کالاهای انتخاب‌شده معتبر نیستند')
  const selected = new Set(sourceLineIds.map(Number))
  if ([...selected].some(id => !Number.isSafeInteger(id) || id < 0)) throw new StoreError('کالاهای انتخاب‌شده معتبر نیستند')
  const preview = await previewReorder(owner.userId, orderId)
  const chosen = preview.lines.filter(line => selected.has(line.sourceLineId))
  if (chosen.length !== selected.size) throw new StoreError('برخی ردیف‌ها دیگر در سفارش نیستند؛ پیش‌نمایش را تازه کنید', 409, 'REORDER_CHANGED')
  const added: number[] = []
  const skipped: { sourceLineId: number; reason: string }[] = []
  for (const line of chosen) {
    if (!line.eligible || line.variantId === undefined) {
      skipped.push({ sourceLineId: line.sourceLineId, reason: line.issue || 'این کالا برای افزودن دوباره آماده نیست' })
      continue
    }
    try {
      await addToCart(owner, { productId: line.productId, variantId: line.variantId, quantity: line.quantity })
      added.push(line.sourceLineId)
    } catch (error) {
      skipped.push({ sourceLineId: line.sourceLineId, reason: error instanceof StoreError ? error.message : 'افزودن کالا انجام نشد؛ دوباره بررسی کنید' })
    }
  }
  const cart = await cartView(owner)
  return { added, skipped, cart }
}
