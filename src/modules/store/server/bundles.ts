import { db } from '@/platform/database/prisma'
import { isPublicProduct } from '@/modules/catalog/domain/product-publication'
import { productBundleDefinition, productBundleDefinitions } from '@/modules/catalog/server/product-bundles'
import { isStoreEnabled } from '@/modules/catalog/server/storefront'
import { isMember, opensMembersOnly } from '@/modules/membership/server/membership'
import { lineLimit, StoreError } from '@/modules/store/domain/store'
import { getStoreSettings } from '@/modules/store/server/catalog'
import { addCartComponents, type CartOwner } from '@/modules/store/server/cart'
import { unitPrice } from '@/modules/store/server/pricing'
import { minorToNumber } from '@/shared/money'
import { groupDeal } from '@/modules/account/server/user-groups'
import type { GroupDeal } from '@/modules/account/domain/user-groups'

type Definition = NonNullable<Awaited<ReturnType<typeof productBundleDefinition>>>
export type ProductBundleCard = {
  id: number; name: string; nameEn: string; currency: string; total: number; buyable: boolean; issue: string
  components: { productId: number; variantId: number | null; slug: string; name: string; nameEn: string; image: string; variantName: string; quantity: number; unitPrice: number; total: number }[]
}

function bundleCard(definition: Definition, member: boolean, opens: boolean, deal?: GroupDeal | null): ProductBundleCard | null {
  if (!definition.active || !isPublicProduct(definition.product) || definition.components.length < 2 || definition.components.length > 12 || !definition.components.some(component => component.productId === definition.productId)) return null
  const components: ProductBundleCard['components'] = [], totals = new Map<number, number>()
  let currency = '', totalMinor = 0n, issue = ''
  for (const component of definition.components) {
    const product = component.product
    if (!product || !isPublicProduct(product)) return null
    const variant = component.variantKey ? product.variants.find(item => item.id === component.variantKey && item.active) || null : null
    if ((component.variantKey && !variant) || (!component.variantKey && product.variants.some(item => item.active))) return null
    const price = unitPrice(product, variant, member, undefined, deal)
    if (currency && currency !== price.currency) return null
    currency = price.currency
    const quantity = component.quantity
    totals.set(product.id, (totals.get(product.id) || 0) + quantity)
    if (product.access === 'MEMBERS' && !opens) issue = 'MEMBERS_ONLY'
    else if (!issue && (quantity > lineLimit(product.stock, variant?.stock ?? null, product.maxPerOrder) || totals.get(product.id)! > lineLimit(product.stock, null, product.maxPerOrder))) issue = 'QUANTITY_LIMIT'
    const minor = price.unitMinor * BigInt(quantity); totalMinor += minor
    components.push({ productId: product.id, variantId: variant?.id ?? null, slug: product.slug, name: product.name, nameEn: product.nameEn, image: product.image, variantName: variant?.name || '', quantity, unitPrice: minorToNumber(price.unitMinor, currency), total: minorToNumber(minor, currency) })
  }
  return { id: definition.id, name: definition.name, nameEn: definition.nameEn, components, currency, total: minorToNumber(totalMinor, currency), buyable: !issue, issue }
}

async function enabled() {
  return await isStoreEnabled() && (await getStoreSettings()).showProductBundles
}

export async function readProductBundles(productId: number, userId: number | null) {
  if (!await enabled()) return null
  const source = await db.product.findUnique({ where: { id: productId }, select: { active: true, approval: true, audienceGroups: true } })
  if (!source || !isPublicProduct(source)) return null
  const member = userId ? await isMember(userId) : false
  const opens = await opensMembersOnly(userId, member)
  const definitions = await productBundleDefinitions(productId)
  const deal = await groupDeal(userId, [...new Set(definitions.flatMap(definition => definition.components.flatMap(component => (component.product ? [component.product.id] : []))))])
  return { items: definitions.flatMap(definition => { const card = bundleCard(definition, member, opens, deal); return card ? [card] : [] }) }
}

export async function addProductBundle(owner: CartOwner, bundleId: unknown) {
  if (!Number.isSafeInteger(bundleId) || Number(bundleId) <= 0) throw new StoreError('بسته نامعتبر است')
  if (!await enabled()) throw new StoreError('بسته در دسترس نیست', 404, 'BUNDLE_NOT_FOUND')
  const definition = await productBundleDefinition(Number(bundleId))
  const member = owner.userId ? await isMember(owner.userId) : false
  const card = definition ? bundleCard(definition, member, await opensMembersOnly(owner.userId, member)) : null
  if (!card) throw new StoreError('بسته در دسترس نیست', 404, 'BUNDLE_NOT_FOUND')
  if (!card.buyable) throw new StoreError(card.issue === 'MEMBERS_ONLY' ? 'این بسته مخصوص اعضای ویژه است' : 'تعداد کامل بسته موجود نیست', card.issue === 'MEMBERS_ONLY' ? 403 : 409, card.issue)
  return addCartComponents(owner, card.components.map(component => ({ productId: component.productId, variantId: component.variantId, quantity: component.quantity })))
}
