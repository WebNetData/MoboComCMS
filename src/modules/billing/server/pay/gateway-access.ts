import type { Prisma } from '@prisma/client'
import { PayError } from '@/modules/billing/domain/pay'
import { gatewayPolicyInput, storedGatewayPolicy } from '@/modules/billing/domain/pay-gateway-access'
import { merchantFeeTerms, paymentAmounts } from '@/modules/billing/domain/pay-policy'
import { checkoutGatewayRef, listCheckoutGateways } from '@/modules/billing/server/gateways'
import { eligiblePayGateways } from './gateway-options'
import { assertPayTerminal, payAudit, payContext, payTransaction, type PayActor } from './context'
import { assertMerchantAdministration, merchantAdminNote } from './merchant-admin/access'
import { paySettings } from './settings'

function policyId(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(value)) {
    throw new PayError('شناسهٔ پذیرنده یا پایانه معتبر نیست', 422, 'PAY_GATEWAY_POLICY_INVALID')
  }
  return value
}

export function payCollectionBank(tx: Prisma.TransactionClient, bankAccountIds: number[]) {
  return tx.bankAccount.findFirst({
    where: { collectionUse: 'GENERAL', ...(bankAccountIds.length ? { id: { in: bankAccountIds } } : {}), active: true },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  })
}

export function terminalGatewayOptions(actor: PayActor, id: string, amountRial?: string) {
  assertPayTerminal(actor, id)
  const terminalId = policyId(id)
  return payTransaction(async tx => {
    const { settings } = await payContext(actor, tx)
    const merchant = await tx.payMerchant.findUnique({ where: { userId: actor.id } })
    if (!merchant || merchant.status !== 'ACTIVE') throw new PayError('پذیرندهٔ فعال لازم است', 403, 'PAY_MERCHANT_INACTIVE')
    const terminal = await tx.payTerminal.findFirst({ where: { id: terminalId, merchantId: merchant.id } })
    if (!terminal) throw new PayError('پایانه پیدا نشد', 404, 'PAY_TERMINAL_NOT_FOUND')
    const totalMinor = amountRial === undefined ? undefined : paymentAmounts(amountRial, settings, merchantFeeTerms(settings, merchant)).totalMinor
    const items = terminal.active && settings.incomingEnabled ? eligiblePayGateways(await listCheckoutGateways('IRR', tx),
      { merchant, terminal }, { totalMinor, creditCurrency: merchant.creditCurrency, hasBankAccount: Boolean(await payCollectionBank(tx, settings.bankAccountIds)) }) : []
    return { terminalId, currency: 'IRR' as const, items }
  })
}

async function adminMerchant(actor: PayActor, id: string, tx: Prisma.TransactionClient) {
  await payContext(actor, tx, 'mobocom-pay.manage')
  const merchant = await tx.payMerchant.findUnique({ where: { id } })
  if (!merchant) throw new PayError('پذیرنده پیدا نشد', 404)
  await assertMerchantAdministration(actor, merchant.userId, tx)
  return merchant
}

async function adminGatewayView(tx: Prisma.TransactionClient, merchant: Awaited<ReturnType<typeof adminMerchant>>,
  catalog: Awaited<ReturnType<typeof listCheckoutGateways>>) {
  const terminals = await tx.payTerminal.findMany({ where: { merchantId: merchant.id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })
  const settings = await paySettings.read(tx)
  const facts = { creditCurrency: merchant.creditCurrency, hasBankAccount: Boolean(await payCollectionBank(tx, settings.bankAccountIds)) }
  const names = new Map(catalog.map(gateway => [checkoutGatewayRef(gateway), gateway.name.trim()]))
  return {
    catalog: eligiblePayGateways(catalog).map(item => ({ ...item, name: names.get(item.ref) || item.name })),
    merchant: { id: merchant.id, name: merchant.name, policy: storedGatewayPolicy(merchant.gatewayPolicy) },
    terminals: terminals.map(terminal => ({
      id: terminal.id, name: terminal.name, active: terminal.active, policy: storedGatewayPolicy(terminal.gatewayPolicy),
      effectiveRefs: settings.incomingEnabled && merchant.status === 'ACTIVE' && terminal.active
        ? eligiblePayGateways(catalog, { merchant, terminal }, facts).map(item => item.ref) : [],
    })),
  }
}

export function adminGatewayAccess(actor: PayActor, id: unknown) {
  const merchantId = policyId(id)
  return payTransaction(async tx => adminGatewayView(tx, await adminMerchant(actor, merchantId, tx), await listCheckoutGateways('IRR', tx)))
}

export function saveGatewayAccess(actor: PayActor, input: Record<string, unknown>) {
  if (input.confirmed !== true || Object.keys(input).some(key => !['merchantId', 'terminalId', 'mode', 'refs', 'version', 'note', 'confirmed'].includes(key))) {
    throw new PayError('تأیید و دلیل تغییر درگاه لازم است', 422, 'PAY_GATEWAY_POLICY_INVALID')
  }
  const merchantId = policyId(input.merchantId)
  const terminalId = input.terminalId === undefined ? undefined : policyId(input.terminalId)
  const note = merchantAdminNote(input.note)
  const proposal = gatewayPolicyInput(input)
  return payTransaction(async tx => {
    const merchant = await adminMerchant(actor, merchantId, tx)
    const terminal = terminalId ? await tx.payTerminal.findFirst({ where: { id: terminalId, merchantId } }) : null
    if (terminalId && !terminal) throw new PayError('پایانه پیدا نشد', 404, 'PAY_TERMINAL_NOT_FOUND')
    const target = terminal ?? merchant
    const current = storedGatewayPolicy(target.gatewayPolicy)
    if (current.version !== proposal.version) throw new PayError('تنظیمات تغییر کرده است. دوباره بارگیری کنید.', 409, 'PAY_GATEWAY_POLICY_CONFLICT')
    const catalog = await listCheckoutGateways('IRR', tx)
    const active = new Set(eligiblePayGateways(catalog).map(item => item.ref))
    if (proposal.refs.some(ref => !active.has(ref) && !current.refs.includes(ref))) {
      throw new PayError('فقط درگاه آماده قابل افزودن است', 422, 'PAY_GATEWAY_NOT_AVAILABLE')
    }
    const merchantPolicy = storedGatewayPolicy(merchant.gatewayPolicy)
    if (terminal && proposal.refs.some(ref => !current.refs.includes(ref) &&
      (merchantPolicy.mode === 'DISABLED' || merchantPolicy.mode === 'ALLOWLIST' && !merchantPolicy.refs.includes(ref)))) {
      throw new PayError('این درگاه در فهرست مجاز پذیرنده نیست', 422, 'PAY_GATEWAY_NOT_AVAILABLE')
    }
    const next = { ...proposal, version: current.version + 1 }
    const gatewayPolicy = JSON.stringify(next)
    const where = { id: target.id, gatewayPolicy: target.gatewayPolicy }
    const changed = terminal ? await tx.payTerminal.updateMany({ where: { ...where, merchantId }, data: { gatewayPolicy } }) :
      await tx.payMerchant.updateMany({ where, data: { gatewayPolicy, version: { increment: 1 } } })
    if (changed.count !== 1) throw new PayError('تنظیمات هم‌زمان تغییر کرده است', 409, 'PAY_GATEWAY_POLICY_CONFLICT')
    await payAudit(tx, actor, 'gateway-access', target.id, { merchantId, terminalId, note, before: current, after: next })
    return adminGatewayView(tx, terminal ? merchant : { ...merchant, gatewayPolicy }, catalog)
  })
}
