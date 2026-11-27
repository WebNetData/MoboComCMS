import { randomUUID } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { parseBotPayment } from '@/modules/billing/domain/pay-bot'
import { PayError } from '@/modules/billing/domain/pay'
import { userOpensSection } from '@/modules/account/server/section-access'
import { createPayPayment, fingerprint } from '../payments'
import { payTransaction, payContext } from '../context'
import { botKeyHash, resolveBotIntegration } from './integrations'
import { matchRoutingRule, parseRoutingSnapshot, type RoutingSnapshot } from '@/modules/billing/domain/pay-routing'
import { storedRoutingRules } from './routing'
import { payGatewayOptions } from '../gateway-options'

export async function createBotPayment(req: NextRequest, id: string, input: Record<string, unknown>) {
  let origin: URL
  try { origin = new URL(process.env.NEXTAUTH_URL || '') } catch { throw new PayError('نشانی عمومی درگاه آماده نیست', 503) }
  const localHttp = process.env.NODE_ENV !== 'production' && origin.protocol === 'http:' && ['localhost','127.0.0.1'].includes(origin.hostname)
  if (origin.username || origin.password || (origin.protocol !== 'https:' && !localHttp)) throw new PayError('نشانی عمومی امن درگاه آماده نیست', 503)
  const parsed = parseBotPayment(input), integration = await resolveBotIntegration(id, input.api_key)
  const merchant = integration.terminal.merchant
  if (!await userOpensSection('mobocom-pay', merchant.userId, true)) throw new PayError('دسترسی درگاه محدود است', 403)
  const actor = { id: merchant.userId, email: merchant.user.email, req, machine: true, botIntegrationId: integration.id, botKeyHash: integration.keyHash }
  // Stable across key rotation; changed customer/type is rejected below as well.
  const key = botKeyHash(integration.id + ':' + parsed.orderId)
  const customerRefHash = fingerprint({ userId: parsed.userId, type: parsed.type })
  const result = await payTransaction(async tx => {
    await payContext(actor, tx)
    const current = await tx.payBotIntegration.findUniqueOrThrow({ where: { id } })
    if (current.version !== integration.version) throw new PayError('اتصال تغییر کرده است؛ همان سفارش را دوباره بفرستید', 409)
    const row = await createPayPayment(actor, { terminalId: integration.terminalId, externalId: parsed.orderId, amountRial: parsed.amountRial }, key, tx)
    const prior = await tx.payBotDelivery.findUnique({ where: { paymentId: row.id } })
    if (prior && (prior.integrationId !== integration.id || prior.customerRefHash !== customerRefHash || prior.orderType !== parsed.type)) throw new PayError('شناسهٔ سفارش با اطلاعات دیگری ثبت شده است', 409)
    let snapshot = prior ? parseRoutingSnapshot(prior.routingSnapshot) : null
    if (!prior) {
      const rule = matchRoutingRule(storedRoutingRules(current.routingRules), parsed)
      if (rule) {
        const options = await payGatewayOptions(row, tx)
        const gateways = rule.gateways.flatMap(ref => { const option = options.find(item => item.ref === ref); return option ? [{ ref, name: option.name.trim().slice(0, 80) || 'پرداخت' }] : [] })
        if (!gateways.length) throw new PayError('روش‌های مجاز این سفارش موقتاً در دسترس نیستند', 503)
        snapshot = { version: 1, ruleId: rule.id, ruleName: rule.name, gateways } satisfies RoutingSnapshot
      }
      await tx.payBotDelivery.create({ data: {
      id: randomUUID(), integrationId: integration.id, paymentId: row.id,
      configVersion: current.version, callbackUrl: current.callbackUrl, callbackTokenCiphertext: current.callbackTokenCiphertext,
      ackPolicy: current.ackPolicy, customerRefHash, orderType: parsed.type, routingSnapshot: snapshot ? JSON.stringify(snapshot) : '',
    } }) }
    return { row, mode: current.responseMode, snapshot }
  })
  const url = new URL('/pay/' + result.row.id, origin).toString()
  if (result.mode === 'LINKS' && result.snapshot && result.row.status === 'PENDING') {
    const options = await payGatewayOptions(result.row)
    const links = result.snapshot.gateways.filter(method => options.some(option => option.ref === method.ref)).map(method => {
      const target = new URL(url); target.searchParams.set('method', method.ref)
      return { text: method.name, url: target.toString() }
    })
    if (!links.length) throw new PayError('روش‌های مجاز این سفارش موقتاً در دسترس نیستند', 503)
    return { links }
  }
  return result.mode === 'LINKS' ? { links: [{ text: 'پرداخت امن با موبوکام', url }] } : { url }
}
