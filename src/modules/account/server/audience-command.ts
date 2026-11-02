import type { NextRequest } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { requirePerm } from '@/modules/identity/server/access'
import { auditAdminStrict } from '@/platform/audit/server'
import { sectionSettingsRevision } from '@/modules/settings/server'
import { normalizeCurrency, toMinor } from '@/shared/money'
import { AUDIENCE_ITEMS, storedAudience, parseAudience, type AudienceItem } from '@/modules/account/domain/item-audience'
import { GroupError } from '@/modules/account/domain/user-groups'

const TABLE = { product: 'Product', post: 'Post', title: 'CinemaTitle', game: 'GameTitle', software: 'SoftwareTitle', track: 'MusicTrack', album: 'MusicAlbum', prompt: 'PromptTemplate' } as const
type Row = { audienceGroups: string; currency?: string }
const itemReader = (client: Prisma.TransactionClient, type: AudienceItem) => client[AUDIENCE_ITEMS[type].model] as unknown as {
  findUnique(args: unknown): Promise<Row | null>
  updateMany(args: unknown): Promise<{ count: number }>
}

export async function audienceSnapshot(type: AudienceItem, id: number, client: Prisma.TransactionClient = db) {
  const item = await itemReader(client, type).findUnique({ where: { id }, select: { audienceGroups: true, ...(type === 'product' ? { currency: true } : {}) } })
  if (!item) throw new GroupError('مورد پیدا نشد', 404)
  const prices = type === 'product' ? await client.productGroupPrice.findMany({ where: { productId: id, variantId: 0 }, orderBy: { groupId: 'asc' } }) : []
  return { item, prices, revision: sectionSettingsRevision({ groups: item.audienceGroups, prices: prices.map(row => [row.groupId, row.priceMinor.toString()]) }) }
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
    if (input.revision !== undefined && input.revision !== before.revision) throw new GroupError('مخاطبان یا قیمت‌ها هم‌زمان تغییر کرده‌اند؛ صفحه را تازه کنید', 409)
    const prices: { groupId: number; priceMinor: bigint | null }[] = []
    if (type === 'product' && input.prices !== undefined) {
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
      else await tx.productGroupPrice.upsert({ where: { productId_variantId_groupId: { productId: id, variantId: 0, groupId } }, create: { productId: id, variantId: 0, groupId, priceMinor }, update: { priceMinor } })
    }
    await auditAdminStrict({ req, actor, action: 'item.audience', targetType: type, targetId: id, metadata: { groups: parseAudience(audienceGroups), groupPrices: prices.length } }, tx)
    return audienceSnapshot(type, id, tx)
  })
}
