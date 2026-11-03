import type { NextRequest } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { requirePerm } from '@/modules/identity/server/access'
import { auditAdminStrict } from '@/platform/audit/server'
import { sectionSettingsRevision } from '@/modules/settings/server'
import { normalizeCurrency, toMinor } from '@/shared/money'
import { AUDIENCE_ITEMS, storedAudience, parseAudience, type AudienceItem } from '@/modules/account/domain/item-audience'
import { GroupError } from '@/modules/account/domain/user-groups'
import { adjustedPrice, adjustmentInput, normalizeAudiencePrices, readAdjustment, PriceAdjustmentError } from '@/modules/account/domain/price-adjustments'

const TABLE = { product: 'Product', post: 'Post', title: 'CinemaTitle', game: 'GameTitle', software: 'SoftwareTitle', track: 'MusicTrack', album: 'MusicAlbum', prompt: 'PromptTemplate' } as const
type Row = { audienceGroups: string; currency?: string; vipPricing?: string; priceMinor?: bigint; price?: number; memberPriceMinor?: bigint; digitalMode?: string; kind?: string; openAmount?: boolean }
const itemReader = (client: Prisma.TransactionClient, type: AudienceItem) => client[AUDIENCE_ITEMS[type].model] as unknown as {
  findUnique(args: unknown): Promise<Row | null>
  updateMany(args: unknown): Promise<{ count: number }>
}

export async function audienceSnapshot(type: AudienceItem, id: number, client: Prisma.TransactionClient = db) {
  const item = await itemReader(client, type).findUnique({ where: { id }, select: { audienceGroups: true, ...(type === 'product' ? { currency: true, vipPricing: true, priceMinor: true, price: true, memberPriceMinor: true, digitalMode: true, kind: true, openAmount: true } : {}) } })
  if (!item) throw new GroupError('مورد پیدا نشد', 404)
  const prices = type === 'product' ? await client.productGroupPrice.findMany({ where: { productId: id, variantId: 0 }, orderBy: { groupId: 'asc' } }) : []
  const currency = normalizeCurrency(item.currency), vip = readAdjustment(item.vipPricing) || (!item.vipPricing && item.memberPriceMinor && item.memberPriceMinor > 0n ? { mode: 'PRICE' as const, value: item.memberPriceMinor.toString() } : null)
  const pricingRules = [...(vip ? [{ audience: 'vip', ...adjustmentInput(vip, currency) }] : []), ...prices.flatMap(row => { const rule = readAdjustment({ mode: row.mode || 'PRICE', value: row.priceMinor.toString() }); return rule ? [{ audience: `group:${row.groupId}`, ...adjustmentInput(rule, currency) }] : [] })]
  return { item, prices, pricingRules, revision: sectionSettingsRevision({ groups: item.audienceGroups, currency: item.currency, base: item.priceMinor?.toString(), vip: item.vipPricing, legacyVip: item.memberPriceMinor?.toString(), delivery: item.digitalMode, prices: prices.map(row => [row.groupId, row.mode || 'PRICE', row.priceMinor.toString()]) }) }
}

/** Audience, prices and strict audit commit together; malformed input never opens an item. */
export async function saveItemAudience(req: NextRequest, type: AudienceItem, id: number, input: Record<string, unknown>) {
  const audienceGroups = storedAudience(input.groups)
  return db.$transaction(async tx => {
    const actor = await requirePerm(req, AUDIENCE_ITEMS[type].permission, tx)
    if (!actor) throw new GroupError('دسترسی کافی ندارید', 403)
    // Table names come exclusively from the closed owner map, never from the request.
    await tx.$queryRawUnsafe(`SELECT "id" FROM "${TABLE[type]}" WHERE "id" = $1 FOR UPDATE`, id)
    const before = await audienceSnapshot(type, id, tx)
    if (input.pricingRules !== undefined && input.revision === undefined) throw new GroupError('برای ذخیرهٔ قیمت، فرم را دوباره بارگذاری کنید', 409)
    if (input.revision !== undefined && input.revision !== before.revision) throw new GroupError('مخاطبان یا قیمت‌ها هم‌زمان تغییر کرده‌اند؛ صفحه را تازه کنید', 409)
    const prices: { groupId: number; priceMinor: bigint | null }[] = []
    if (type === 'product' && input.pricingRules !== undefined) {
      let rules
      try { rules = normalizeAudiencePrices(input.pricingRules, normalizeCurrency(before.item.currency)) } catch (error) { if (error instanceof PriceAdjustmentError) throw new GroupError(error.message); throw error }
      const groupIds = rules.filter(row => row.audience !== 'vip').map(row => Number(row.audience.slice(6)))
      if (await tx.userGroup.count({ where: { id: { in: groupIds } } }) !== groupIds.length) throw new GroupError('یکی از گروه‌ها حذف شده است', 409)
      const base = before.item.priceMinor || toMinor(before.item.price || 0, normalizeCurrency(before.item.currency))
      if (rules.some(row => adjustedPrice(base, row) === 0n) && (before.item.kind !== 'VIRTUAL' || before.item.digitalMode !== 'FILES' || before.item.openAmount)) throw new GroupError('دسترسی رایگان فقط برای محصول دانلودی با تحویل فایل فعال است')
      await tx.product.update({ where: { id }, data: { vipPricing: JSON.stringify(rules.find(row => row.audience === 'vip') || null) } })
      await tx.productGroupPrice.deleteMany({ where: { productId: id, variantId: 0 } })
      for (const row of rules) if (row.audience !== 'vip') await tx.productGroupPrice.create({ data: { productId: id, variantId: 0, groupId: Number(row.audience.slice(6)), mode: row.mode, priceMinor: BigInt(row.value) } })
    }
    if (type === 'product' && input.prices !== undefined) {
      if (input.pricingRules !== undefined) throw new GroupError('قیمت قدیمی و جدید را هم‌زمان ارسال نکنید')
      if (before.prices.some(row => (row.mode || 'PRICE') !== 'PRICE')) throw new GroupError('قیمت‌گذاری پیشرفته فعال است؛ فرم را تازه کنید', 409)
      if (!input.prices || typeof input.prices !== 'object' || Array.isArray(input.prices)) throw new GroupError('قیمت‌های گروهی معتبر نیستند')
      const currency = normalizeCurrency(before.item.currency)
      for (const [key, raw] of Object.entries(input.prices)) {
        const groupId = Number(key), text = typeof raw === 'string' || typeof raw === 'number' ? String(raw).trim() : ''
        if (!Number.isSafeInteger(groupId) || groupId <= 0 || typeof raw !== 'string' && typeof raw !== 'number') throw new GroupError('قیمت گروه معتبر نیست')
        let priceMinor: bigint | null = null
        if (text && text !== '0') {
          try { priceMinor = toMinor(text, currency) } catch { throw new GroupError('قیمت گروه معتبر نیست') }
          if (priceMinor <= 0n) throw new GroupError('قیمت گروه باید مثبت باشد')
        }
        prices.push({ groupId, priceMinor })
      }
      if (await tx.userGroup.count({ where: { id: { in: prices.map(row => row.groupId) } } }) !== prices.length) throw new GroupError('یکی از گروه‌ها دیگر وجود ندارد', 409)
    }
    if ((await itemReader(tx, type).updateMany({ where: { id }, data: { audienceGroups } })).count !== 1) throw new GroupError('مورد پیدا نشد', 404)
    for (const { groupId, priceMinor } of prices) {
      if (priceMinor === null) await tx.productGroupPrice.deleteMany({ where: { productId: id, variantId: 0, groupId } })
      else await tx.productGroupPrice.upsert({ where: { productId_variantId_groupId: { productId: id, variantId: 0, groupId } }, create: { productId: id, variantId: 0, groupId, priceMinor }, update: { priceMinor, mode: 'PRICE' } })
    }
    await auditAdminStrict({ req, actor, action: 'item.audience', targetType: type, targetId: id, metadata: { groups: parseAudience(audienceGroups), groupPrices: prices.length, ...(input.pricingRules !== undefined ? { pricingRules: input.pricingRules } : {}) } }, tx)
    return audienceSnapshot(type, id, tx)
  })
}
