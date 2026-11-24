import { parseRoutingRules, type PayRoutingRule } from '@/modules/billing/domain/pay-routing'
import { PayError } from '@/modules/billing/domain/pay'
import { merchantFor, payAudit, payTransaction, type PayActor } from '../context'
import { integrationView } from './integrations'

export function storedRoutingRules(raw: string): PayRoutingRule[] {
  try { return parseRoutingRules(JSON.parse(raw)) }
  catch { throw new PayError('قواعد ذخیره‌شدهٔ مسیر پرداخت معتبر نیست؛ اتصال را بررسی کنید', 503) }
}

export async function saveBotRouting(actor: PayActor, input: Record<string, unknown>) {
  if (actor.machine) throw new PayError('قواعد فقط از حساب پذیرنده تغییر می‌کنند', 403)
  if (Object.keys(input).some(key => !['id', 'version', 'rules'].includes(key)) || typeof input.id !== 'string' || !Number.isSafeInteger(input.version)) throw new PayError('درخواست قواعد معتبر نیست')
  const rules = parseRoutingRules(input.rules)
  return payTransaction(async tx => {
    const merchant = await merchantFor(actor, tx, true)
    const row = await tx.payBotIntegration.findFirst({ where: { id: String(input.id), terminal: { merchantId: merchant.id } } })
    if (!row) throw new PayError('اتصال پیدا نشد', 404)
    if (row.routingVersion !== input.version) throw new PayError('اتصال تغییر کرده است؛ صفحه را تازه کنید', 409)
    const claim = await tx.payBotIntegration.updateMany({ where: { id: row.id, routingVersion: row.routingVersion }, data: { routingRules: JSON.stringify(rules), routingVersion: { increment: 1 } } })
    if (claim.count !== 1) throw new PayError('قواعد هم‌زمان تغییر کرده است', 409)
    await payAudit(tx, actor, 'bot.routing', row.id, { ruleIds: rules.map(rule => rule.id), routingVersion: row.routingVersion + 1 })
    return { integration: integrationView(await tx.payBotIntegration.findUniqueOrThrow({ where: { id: row.id } })) }
  })
}
