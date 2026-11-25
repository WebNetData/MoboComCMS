import { randomUUID } from 'node:crypto'
import { PayError, type PayRailId } from '@/modules/billing/domain/pay'
import { text } from '@/modules/billing/domain/pay-policy'
import { MAX_SETTLEMENT_SCHEDULE_DAYS, type PaySettlementDestinationView } from '@/modules/billing/domain/pay-settlement-center'
import { assetBalances } from '../balances'
import { merchantFor, payAudit, payContext, payTransaction, type PayActor } from '../context'
import { normalizeSettlementDestination } from '../settlements'

const view = (r: { id: string; label: string; railId: string; asset: string; network: string; destination: string; active: boolean; version: number; createdAt: Date }): PaySettlementDestinationView => ({ ...r, railId: r.railId as PayRailId, createdAt: r.createdAt.toISOString() })
export function settlementCenter(actor: PayActor) {
  return payTransaction(async tx => {
    const { settings } = await payContext(actor, tx)
    const merchant = await tx.payMerchant.findUnique({ where: { userId: actor.id } })
    if (!merchant || merchant.status !== 'ACTIVE') throw new PayError('پذیرندهٔ فعال لازم است', 403)
    const destinations = await tx.paySettlementDestination.findMany({ where: { merchantId: merchant.id }, orderBy: [{ active: 'desc' }, { createdAt: 'desc' }], take: 100 })
    return { destinations: destinations.map(view), balances: await assetBalances(tx, actor.id, merchant.id, settings.usdtRateMaxAgeMinutes), approvalThresholdRial: settings.settlementApprovalThresholdRial, maxScheduleDays: MAX_SETTLEMENT_SCHEDULE_DAYS }
  })
}
export function saveSettlementDestination(actor: PayActor, input: Record<string, unknown>) {
  const editing = input.id !== undefined
  const allowed = editing ? ['id','version','label','active'] : ['label','railId','destination']
  if (Object.keys(input).some(k => !allowed.includes(k))) throw new PayError('فیلد مقصد پشتیبانی نمی‌شود')
  return payTransaction(async tx => {
    const merchant = await merchantFor(actor, tx), { settings } = await payContext(actor, tx)
    if (editing) {
      const id = text(input.id, 60)
      if (!Number.isSafeInteger(input.version) || Number(input.version) < 0 || input.active !== undefined && typeof input.active !== 'boolean' || input.label === undefined && input.active === undefined) throw new PayError('نسخه و تغییر مقصد معتبر لازم است')
      const changed = await tx.paySettlementDestination.updateMany({ where: { id, merchantId: merchant.id, version: Number(input.version) }, data: { ...(input.label !== undefined ? { label: text(input.label, 80) } : {}), ...(typeof input.active === 'boolean' ? { active: input.active } : {}), version: { increment: 1 } } })
      if (changed.count !== 1) throw new PayError('مقصد تغییر کرده یا متعلق به شما نیست', 409, 'PAY_DESTINATION_CHANGED')
      await payAudit(tx, actor, 'destination.update', id, { active: input.active })
      return view(await tx.paySettlementDestination.findUniqueOrThrow({ where: { id } }))
    }
    const label = text(input.label, 80), rail = settings.rails.find(r => r.id === input.railId)
    if (!rail?.enabled) throw new PayError('مسیر تسویه فعال لازم است', 409)
    if (await tx.paySettlementDestination.count({ where: { merchantId: merchant.id } }) >= 100) throw new PayError('حداکثر ۱۰۰ مقصد قابل ثبت است', 409)
    const destination = normalizeSettlementDestination(rail.asset, rail.network, input.destination)
    const row = await tx.paySettlementDestination.create({ data: { id: randomUUID(), merchantId: merchant.id, label, railId: rail.id, asset: rail.asset, network: rail.network, destination } })
    await payAudit(tx, actor, 'destination.create', row.id, { railId: rail.id })
    return view(row)
  })
}
