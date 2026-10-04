import { randomBytes } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { isMember } from '@/modules/membership/server/membership'
import { MAX_CART_LINES, StoreError, lineLimit, normalizeQuantity } from '@/modules/store/domain/store'
import { unitPrice } from '@/modules/store/server/pricing'
import { getDeliverySettings } from '@/modules/shipping/server/shipping'
import { shippingFeeMinor } from '@/modules/shipping/domain/shipping'
import { getCarrierSettings } from '@/modules/shipping/server/carriers'
import { minorToNumber } from '@/shared/money'
import { isPublicProduct } from '@/modules/catalog/domain/product-publication'

// A cart belongs to a signed-in customer (userId) or to a browser (token
// cookie). Guests only ever reach carts without an owner; on sign-in the
// browser's guest cart is merged into the customer's cart.

export const CART_COOKIE = 'mc_cart'
export type CartOwner = { userId: number | null; token: string | null }

const validToken = (token: string | null | undefined) => (token && /^[A-Za-z0-9_-]{20,64}$/.test(token) ? token : null)
const newToken = () => randomBytes(24).toString('base64url')

async function mergeInto(tx: Prisma.TransactionClient, targetId: number, sourceId: number) {
  const lines = await tx.cartLine.findMany({ where: { cartId: sourceId } })
  for (const line of lines) {
    await tx.cartLine.upsert({
      where: { cartId_productId_variantKey: { cartId: targetId, productId: line.productId, variantKey: line.variantKey } },
      create: { cartId: targetId, productId: line.productId, variantKey: line.variantKey, quantity: line.quantity },
      update: {},
    })
  }
  await tx.cart.delete({ where: { id: sourceId } })
}

/** The owner's cart, or null. Claims/merges a guest cart after sign-in. */
export async function findCart(owner: CartOwner) {
  const token = validToken(owner.token)
  for (let attempt = 0; ; attempt++) {
    const guest = token ? await db.cart.findFirst({ where: { token, userId: null } }) : null
    if (!owner.userId) return guest
    const userId = owner.userId
    if (!guest) return db.cart.findUnique({ where: { userId } })
    try {
      return await db.$transaction(async tx => {
        // Lock only a still-guest source. Competing claimers cannot overwrite its owner.
        const held = await tx.cart.updateMany({ where: { id: guest.id, token: token!, userId: null }, data: { updatedAt: new Date() } })
        const mine = await tx.cart.findUnique({ where: { userId } })
        if (!held.count) return mine
        if (!mine) return tx.cart.update({ where: { id: guest.id }, data: { userId } })
        await lockCart(tx, mine.id, owner)
        await mergeInto(tx, mine.id, guest.id)
        return tx.cart.findUnique({ where: { id: mine.id } })
      })
    } catch (error) {
      // Another first request may have created this user's owned cart meanwhile.
      if (attempt === 0 && error && typeof error === 'object' && 'code' in error && error.code === 'P2002') continue
      throw error
    }
  }
}

/** Finds or creates the owner's cart; returns the token the browser should keep. */
export async function ensureCart(owner: CartOwner) {
  const found = await findCart(owner)
  if (found) return found
  const token = validToken(owner.token)
  const reusable = !owner.userId && token && !(await db.cart.findUnique({ where: { token }, select: { id: true } }))
  try {
    return await db.cart.create({ data: { token: reusable ? token : newToken(), userId: owner.userId } })
  } catch (error) {
    // Concurrent first additions can create the same owner's cart. Reuse only
    // the cart resolved through the existing ownership rules.
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      const concurrent = await findCart(owner)
      if (concurrent) return concurrent
      // A browser token may now belong to the account that claimed it. Start a
      // fresh guest cart rather than colliding with or reaching that owned cart.
      if (!owner.userId && validToken(owner.token)) return db.cart.create({ data: { token: newToken(), userId: null } })
    }
    throw error
  }
}

/** The parent write serializes line mutations on PostgreSQL and SQLite. */
async function lockCart(tx: Prisma.TransactionClient, cartId: number, owner: CartOwner) {
  const binding = owner.userId ? { userId: owner.userId } : { userId: null, token: validToken(owner.token) || '' }
  const held = await tx.cart.updateMany({ where: { id: cartId, ...binding }, data: { updatedAt: new Date(), reminderCount: 0 } })
  if (!held.count) throw new StoreError('سبد خرید تغییر کرده است؛ دوباره تلاش کنید', 409, 'CART_CHANGED')
}

export type CartLineView = {
  id: number
  productId: number
  variantId: number | null
  slug: string
  name: string
  variantName: string
  attributes: Record<string, string>
  image: string
  brand: string
  kind: string
  quantity: number
  maxQuantity: number
  unitPrice: number
  listPrice: number
  lineTotal: number
  currency: string
  /** Why the line cannot be bought right now (empty = fine). */
  issue: string
}

export type CartView = {
  token: string
  lines: CartLineView[]
  count: number
  currency: string
  itemsTotal: number
  listTotal: number
  saving: number
  shipping: number
  total: number
  hasPhysical: boolean
  /** Shipping is priced per carrier and address at checkout. */
  shippingByAddress?: boolean
  /** Lines that block checkout (stock, availability, mixed currency). */
  blocked: boolean
}

const EMPTY = (token: string): CartView => ({ token, lines: [], count: 0, currency: 'IRT', itemsTotal: 0, listTotal: 0, saving: 0, shipping: 0, total: 0, hasPhysical: false, blocked: false })

/** Prices and availability of every line, recomputed from the catalogue. */
export async function cartView(owner: CartOwner): Promise<CartView> {
  const cart = await findCart(owner)
  if (!cart) return EMPTY(validToken(owner.token) || '')
  const rows = await db.cartLine.findMany({
    where: { cartId: cart.id },
    orderBy: { createdAt: 'asc' },
    include: { product: { include: { brand: { select: { name: true } }, variants: true } } },
  })
  const member = owner.userId ? await isMember(owner.userId) : false
  const currency = rows[0]?.product.currency || 'IRT'
  let itemsMinor = 0n
  let listMinor = 0n
  let physicalMinor = 0n
  let blocked = false
  const lines: CartLineView[] = rows.map((row) => {
    const product = row.product
    const variant = row.variantKey ? product.variants.find((v) => v.id === row.variantKey) || null : null
    const price = unitPrice(product, variant, member)
    const limit = lineLimit(product.stock, variant ? variant.stock : null, product.maxPerOrder)
    let issue = ''
    if (!isPublicProduct(product) || (row.variantKey && (!variant || !variant.active))) issue = 'این کالا دیگر فروخته نمی‌شود'
    else if (!row.variantKey && product.variants.some((v) => v.active)) issue = 'نوع کالا را دوباره انتخاب کنید'
    else if (product.access === 'MEMBERS' && !member) issue = 'مخصوص اعضای ویژه'
    else if (limit === 0) issue = 'ناموجود'
    else if (row.quantity > limit) issue = `حداکثر ${limit.toLocaleString('fa-IR')} عدد قابل سفارش است`
    else if (price.currency !== currency) issue = 'واحد پول این کالا با بقیهٔ سبد یکسان نیست'
    if (issue) blocked = true
    const quantity = row.quantity
    const lineMinor = price.unitMinor * BigInt(quantity)
    if (!issue) {
      itemsMinor += lineMinor
      listMinor += (price.listMinor || price.unitMinor) * BigInt(quantity)
      if (product.kind === 'PHYSICAL') physicalMinor += lineMinor
    }
    let attributes: Record<string, string> = {}
    try { attributes = variant ? JSON.parse(variant.attributes || '{}') : {} } catch { attributes = {} }
    return {
      id: row.id, productId: product.id, variantId: variant?.id ?? null, slug: product.slug, name: product.name,
      variantName: variant?.name || '', attributes, image: product.image, brand: product.brand?.name || '', kind: product.kind,
      quantity, maxQuantity: limit,
      unitPrice: minorToNumber(price.unitMinor, price.currency), listPrice: price.listMinor ? minorToNumber(price.listMinor, price.currency) : 0,
      lineTotal: minorToNumber(lineMinor, price.currency), currency: price.currency, issue,
    }
  })
  // With carriers on, the fee depends on the address and carrier chosen at checkout.
  const byAddress = physicalMinor > 0n && (await getCarrierSettings()).enabled
  const shippingMinor = physicalMinor > 0n && !byAddress ? shippingFeeMinor(await getDeliverySettings(), currency, physicalMinor) : 0n
  return {
    token: cart.token,
    lines,
    count: lines.reduce((sum, line) => sum + line.quantity, 0),
    currency,
    itemsTotal: minorToNumber(itemsMinor, currency),
    listTotal: minorToNumber(listMinor, currency),
    saving: minorToNumber(listMinor - itemsMinor, currency),
    shipping: minorToNumber(shippingMinor, currency),
    total: minorToNumber(itemsMinor + shippingMinor, currency),
    hasPhysical: lines.some((line) => line.kind === 'PHYSICAL' && !line.issue),
    shippingByAddress: byAddress,
    blocked,
  }
}

/** Number of items for the header badge (no pricing work). */
export async function cartCount(owner: CartOwner): Promise<number> {
  const token = validToken(owner.token)
  const where = owner.userId ? { cart: { userId: owner.userId } } : token ? { cart: { token, userId: null } } : null
  if (!where) return 0
  const sum = await db.cartLine.aggregate({ where, _sum: { quantity: true } })
  return sum._sum.quantity || 0
}

async function purchasable(productId: number, variantId: number | null, client: Pick<Prisma.TransactionClient, 'product'> = db) {
  const product = await client.product.findUnique({ where: { id: productId }, include: { variants: { where: { active: true }, select: { id: true, stock: true } } } })
  if (!product || !isPublicProduct(product)) throw new StoreError('کالا پیدا نشد', 404, 'PRODUCT_NOT_FOUND')
  if (product.variants.length && !variantId) throw new StoreError('نوع کالا را انتخاب کنید', 400, 'VARIANT_REQUIRED')
  const variant = variantId ? product.variants.find((v) => v.id === variantId) : null
  if (variantId && !variant) throw new StoreError('نوع انتخاب‌شده موجود نیست', 404, 'VARIANT_NOT_FOUND')
  return { product, limit: lineLimit(product.stock, variant ? variant.stock : null, product.maxPerOrder) }
}

type CartAddition = { productId: number; variantId: number | null; quantity: number }

/** One canonical mutation path for ordinary capped additions and complete bundles. */
async function writeCartAdditions(tx: Prisma.TransactionClient, cartId: number, owner: CartOwner, requests: CartAddition[], strict: boolean, member = false) {
  await lockCart(tx, cartId, owner)
  const lines = await tx.cartLine.findMany({ where: { cartId }, include: { product: { select: { currency: true } } } })
  const currencies = new Set(lines.map(line => line.product.currency))
  const additions = []
  const productTotals = new Map<number, number>()
  for (const line of lines) productTotals.set(line.productId, (productTotals.get(line.productId) || 0) + line.quantity)
  for (const request of requests) {
    const { product, limit } = await purchasable(request.productId, request.variantId, tx)
    if (limit === 0) throw new StoreError('این کالا ناموجود است', 409, 'OUT_OF_STOCK')
    if (strict && product.access === 'MEMBERS' && !member) throw new StoreError('این بسته مخصوص اعضای ویژه است', 403, 'MEMBERS_ONLY')
    currencies.add(product.currency)
    if (currencies.size > 1) throw new StoreError('کالاهای سبد باید با یک واحد پول قیمت‌گذاری شده باشند', 409, 'MIXED_CURRENCY')
    const existing = lines.find(line => line.productId === request.productId && line.variantKey === (request.variantId || 0))
    const wanted = (existing?.quantity || 0) + request.quantity
    const quantity = Math.min(limit, wanted)
    if (strict && quantity < wanted) throw new StoreError('تعداد کامل بسته قابل خرید نیست', 409, 'QUANTITY_LIMIT')
    productTotals.set(product.id, (productTotals.get(product.id) || 0) + quantity - (existing?.quantity || 0))
    if (strict && productTotals.get(product.id)! > lineLimit(product.stock, null, product.maxPerOrder)) throw new StoreError('موجودی یا سقف خرید محصول برای کل بسته کافی نیست', 409, 'QUANTITY_LIMIT')
    additions.push({ request, existing, quantity, limited: quantity < wanted })
  }
  if (lines.length + additions.filter(item => !item.existing).length > MAX_CART_LINES) throw new StoreError('سبد خرید پر است', 409, 'CART_FULL')
  for (const { request, existing, quantity } of additions) {
    if (existing) await tx.cartLine.update({ where: { id: existing.id }, data: { quantity } })
    else await tx.cartLine.create({ data: { cartId, productId: request.productId, variantKey: request.variantId || 0, quantity } })
  }
  return additions
}

/** Adds an entire fixed selection or nothing; normal pricing/checkout stay unchanged. */
export async function addCartComponents(owner: CartOwner, requests: CartAddition[]) {
  if (!Array.isArray(requests) || requests.length < 2 || requests.length > 12) throw new StoreError('بسته نامعتبر است')
  const seen = new Set<string>()
  for (const request of requests) {
    if (!Number.isSafeInteger(request.productId) || request.productId <= 0 || (request.variantId !== null && (!Number.isSafeInteger(request.variantId) || request.variantId <= 0)) || !Number.isSafeInteger(request.quantity) || normalizeQuantity(request.quantity) < 1) throw new StoreError('بسته نامعتبر است')
    const key = `${request.productId}:${request.variantId || 0}`
    if (seen.has(key)) throw new StoreError('بسته دارای کالای تکراری است')
    seen.add(key)
    await purchasable(request.productId, request.variantId)
  }
  const member = owner.userId ? await isMember(owner.userId) : false
  const cart = await ensureCart(owner)
  await db.$transaction(tx => writeCartAdditions(tx, cart.id, { ...owner, token: cart.token }, requests, true, member))
  return { token: cart.token, limited: false }
}

/** Adds (or increases) a line. Returns the cart token. */
export async function addToCart(owner: CartOwner, input: { productId: unknown; variantId?: unknown; quantity?: unknown }) {
  const productId = Number(input.productId)
  const variantId = Number(input.variantId) || null
  if (!Number.isSafeInteger(productId) || productId <= 0) throw new StoreError('کالا مشخص نیست')
  const quantity = Math.max(1, normalizeQuantity(input.quantity ?? 1))
  // Keep the existing pre-creation validation; recheck after taking the cart lock.
  const available = await purchasable(productId, variantId)
  if (available.limit === 0) throw new StoreError('این کالا ناموجود است', 409, 'OUT_OF_STOCK')
  const cart = await ensureCart(owner)
  return db.$transaction(async tx => {
    const [added] = await writeCartAdditions(tx, cart.id, { ...owner, token: cart.token }, [{ productId, variantId, quantity }], false)
    return { token: cart.token, quantity: added.quantity, limited: added.limited }
  })
}

/** Sets a line's quantity (0 removes it). */
export async function updateCartLine(owner: CartOwner, lineId: number, quantityInput: unknown) {
  const cart = await findCart(owner)
  if (!cart) throw new StoreError('این ردیف در سبد شما نیست', 404, 'LINE_NOT_FOUND')
  return db.$transaction(async tx => {
    await lockCart(tx, cart.id, owner)
    const line = await tx.cartLine.findFirst({ where: { id: lineId, cartId: cart.id } })
    if (!line) throw new StoreError('این ردیف در سبد شما نیست', 404, 'LINE_NOT_FOUND')
    const quantity = normalizeQuantity(quantityInput)
    if (quantity === 0) {
      await tx.cartLine.delete({ where: { id: line.id } })
      return { removed: true }
    }
    const { limit } = await purchasable(line.productId, line.variantKey || null, tx).catch(() => ({ limit: 0 }))
    if (limit === 0) throw new StoreError('این کالا ناموجود است', 409, 'OUT_OF_STOCK')
    await tx.cartLine.update({ where: { id: line.id }, data: { quantity: Math.min(limit, quantity) } })
    return { removed: false, quantity: Math.min(limit, quantity) }
  })
}

export async function clearCart(owner: CartOwner) {
  const cart = await findCart(owner)
  if (cart) await db.$transaction(async tx => {
    await lockCart(tx, cart.id, owner)
    await tx.cartLine.deleteMany({ where: { cartId: cart.id } })
  })
}

/** Removes the purchased lines once an order was placed from the cart. */
export async function removePurchasedLines(owner: CartOwner, lineIds: number[]) {
  const cart = await findCart(owner)
  if (cart && lineIds.length) await db.$transaction(async tx => {
    await lockCart(tx, cart.id, owner)
    await tx.cartLine.deleteMany({ where: { cartId: cart.id, id: { in: lineIds } } })
  })
}

/** The lines checkout will buy (only lines without issues). */
export async function cartCheckoutLines(owner: CartOwner) {
  const view = await cartView(owner)
  if (!view.lines.length) throw new StoreError('سبد خرید شما خالی است', 409, 'CART_EMPTY')
  if (view.blocked) throw new StoreError('بعضی کالاهای سبد قابل خرید نیستند؛ سبد را بررسی کنید', 409, 'CART_BLOCKED')
  return { view, lines: view.lines.map((line) => ({ lineId: line.id, productId: line.productId, variantId: line.variantId, quantity: line.quantity })) }
}

/** Old guest carts are deleted after 60 days, owned carts after 180 days of inactivity. */
export async function pruneCarts(now = new Date()) {
  const day = 86_400_000
  const guests = await db.cart.deleteMany({ where: { userId: null, updatedAt: { lt: new Date(now.getTime() - 60 * day) } } })
  const owned = await db.cart.deleteMany({ where: { userId: { not: null }, updatedAt: { lt: new Date(now.getTime() - 180 * day) } } })
  return guests.count + owned.count
}
