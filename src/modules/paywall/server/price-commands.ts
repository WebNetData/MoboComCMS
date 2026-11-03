import type { NextRequest } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { requirePerm } from '@/modules/identity/server/access'
import { auditAdminStrict } from '@/platform/audit/server'
import { sectionSettingsRevision } from '@/modules/settings/server'
import { normalizeAudiencePrices, PriceAdjustmentError } from '@/modules/account/domain/price-adjustments'
import { normalizePaidInput, PaywallError, type OwnerType } from '@/modules/paywall/domain/paywall'

export type PriceWriteContext = { req: NextRequest; permissions: readonly string[] }
const TABLE = { post: 'Post', software: 'SoftwareTitle', game: 'GameTitle', title: 'CinemaTitle', album: 'MusicAlbum', track: 'MusicTrack', prompt: 'PromptTemplate', link: 'MediaLink' } as const
type StoredPrice = { id: number; priceMinor: bigint; currency: string; vipAccess: string; memberPriceMinor: bigint | null; pricingRules: string; active: boolean; updatedAt: Date }
export const paidRevision = (row: StoredPrice | null) => sectionSettingsRevision(row ? { id: row.id, price: row.priceMinor.toString(), currency: row.currency, vip: row.vipAccess, member: row.memberPriceMinor?.toString(), rules: row.pricingRules, active: row.active, at: row.updatedAt.toISOString() } : {})

async function locked<T>(type: OwnerType, id: number, context: PriceWriteContext | undefined, work: (tx: Prisma.TransactionClient) => Promise<{ result: T; action: string; metadata: Record<string, unknown> }>) {
  return db.$transaction(async tx => {
    let actor = null
    if (context) {
      for (const permission of context.permissions) { actor = await requirePerm(context.req, permission, tx); if (actor) break }
      if (!actor) throw new PaywallError('دسترسی فعلی کافی نیست', 403)
    }
    const rows = await tx.$queryRawUnsafe<{ id: number }[]>(`SELECT "id" FROM "${TABLE[type]}" WHERE "id" = $1 FOR UPDATE`, id)
    if (!rows.length) throw new PaywallError('این مورد یافت نشد', 404)
    const { result, action, metadata } = await work(tx)
    if (context && actor) await auditAdminStrict({ req: context.req, actor, action, targetType: type, targetId: id, metadata }, tx)
    return result
  })
}

export function writePaidPrice(type: OwnerType, id: number, input: Record<string, unknown>, context?: PriceWriteContext) {
  return locked(type, id, context, async tx => {
    const where = { ownerType_ownerId: { ownerType: type, ownerId: id } }
    const before = await tx.paidItem.findUnique({ where })
    if (input.revision !== undefined && input.revision !== paidRevision(before) || input.pricingRules !== undefined && typeof input.revision !== 'string') throw new PaywallError('قیمت هم‌زمان تغییر کرده است؛ فرم را تازه کنید', 409, 'PRICE_CONFLICT')
    const data = normalizePaidInput(input)
    let pricingRules: string | undefined
    if (input.pricingRules !== undefined) {
      let rules
      try { rules = normalizeAudiencePrices(input.pricingRules, data.currency) } catch (error) { if (error instanceof PriceAdjustmentError) throw new PaywallError(error.message); throw error }
      const ids = rules.filter(row => row.audience !== 'vip').map(row => Number(row.audience.slice(6)))
      if (await tx.userGroup.count({ where: { id: { in: ids } } }) !== ids.length) throw new PaywallError('یکی از گروه‌ها حذف شده است؛ فرم را تازه کنید', 409)
      if (rules.some(row => row.audience === 'vip')) { data.vipAccess = 'NONE'; data.memberPriceMinor = null }
      pricingRules = JSON.stringify(rules)
    } else if (before?.pricingRules && before.pricingRules !== '[]' && before.currency !== data.currency) throw new PaywallError('با تغییر واحد پول، قوانین اختصاصی را هم دوباره تعیین کنید', 409)
    const row = await tx.paidItem.upsert({ where, create: { ownerType: type, ownerId: id, ...data, ...(pricingRules !== undefined ? { pricingRules } : {}) }, update: { ...data, ...(pricingRules !== undefined ? { pricingRules } : {}) } })
    return { result: row, action: 'paywall.price', metadata: { price: row.priceMinor.toString(), currency: row.currency, vipAccess: row.vipAccess, active: row.active, pricingRules } }
  })
}

export function deletePaidPrice(type: OwnerType, id: number, revision?: unknown, context?: PriceWriteContext) {
  return locked(type, id, context, async tx => {
    const where = { ownerType: type, ownerId: id }, before = await tx.paidItem.findFirst({ where })
    if (revision !== undefined && revision !== paidRevision(before) || before?.pricingRules && before.pricingRules !== '[]' && typeof revision !== 'string') throw new PaywallError('قیمت تغییر کرده است؛ فرم را تازه کنید', 409, 'PRICE_CONFLICT')
    await tx.paidItem.deleteMany({ where })
    return { result: undefined, action: 'paywall.remove', metadata: {} }
  })
}
