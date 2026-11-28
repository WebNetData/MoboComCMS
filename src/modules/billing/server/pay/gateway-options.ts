import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { isAutomaticTransfer } from '@/modules/billing/domain/auto-transfer'
import { applyGatewayPolicy, storedGatewayPolicy, type PayGatewayOption } from '@/modules/billing/domain/pay-gateway-access'
import { parseRoutingSnapshot } from '@/modules/billing/domain/pay-routing'
import { checkoutGatewayRef, customerGatewayLabel, listCheckoutGateways } from '@/modules/billing/server/gateways'

type Catalog = Awaited<ReturnType<typeof listCheckoutGateways>>
type GatewayAuthority = {
  merchant: { gatewayPolicy: string; baleAllowed: boolean }
  terminal: { gatewayPolicy: string; baleEnabled: boolean }
}
type PaymentFacts = { totalMinor?: bigint; creditCurrency?: string; requestedGatewayRef?: string; hasBankAccount?: boolean }

export function eligiblePayGateways(catalog: Catalog, authority?: GatewayAuthority, facts?: PaymentFacts): PayGatewayOption[] {
  const items = catalog.filter(gateway => {
    const automatic = isAutomaticTransfer(gateway)
    if (facts?.creditCurrency === 'USDT' && !['CARD_TRANSFER', 'MANUAL', 'MOBOCOM_PAY'].includes(gateway.provider)) return false
    if (automatic && authority && !(authority.merchant.baleAllowed && authority.terminal.baleEnabled)) return false
    if (!automatic && gateway.provider === 'CARD_TRANSFER' && facts?.hasBankAccount === false) return false
    if (facts?.requestedGatewayRef && facts.requestedGatewayRef !== checkoutGatewayRef(gateway)) return false
    if (facts?.totalMinor !== undefined) {
      if (facts.totalMinor <= 0n || facts.totalMinor > BigInt(Number.MAX_SAFE_INTEGER)) return false
      if (gateway.provider === 'FRENZYEX' && facts.totalMinor % 10n !== 0n) return false
      if (gateway.fiat === 'IRR' && gateway.minAmountMinor && facts.totalMinor < gateway.minAmountMinor) return false
    }
    return true
  }).map(gateway => {
    const automatic = isAutomaticTransfer(gateway)
    return { ref: checkoutGatewayRef(gateway), id: gateway.id, name: customerGatewayLabel(gateway), provider: gateway.provider,
      ...(automatic ? { automatic: true } : {}), manual: !automatic && ['CARD_TRANSFER', 'MANUAL'].includes(gateway.provider), isDefault: false }
  })
  const allowed = authority ? applyGatewayPolicy(applyGatewayPolicy(items, storedGatewayPolicy(authority.merchant.gatewayPolicy)),
    storedGatewayPolicy(authority.terminal.gatewayPolicy)) : items
  return withGatewayPriority(allowed)
}

export function withGatewayPriority(items: PayGatewayOption[]) {
  return items.map((item, index) => ({ ...item, isDefault: index === 0 }))
}

export async function payGatewayOptions(row?: { id?: string; totalMinor: bigint; creditCurrency?: string; requestedGatewayRef?: string },
  reader: Prisma.TransactionClient | typeof db = db, readyCatalog?: Catalog): Promise<PayGatewayOption[]> {
  const catalog = readyCatalog ?? await listCheckoutGateways('IRR', reader === db ? undefined : reader as Prisma.TransactionClient, undefined, 'pay')
  if (!row?.id) return eligiblePayGateways(catalog, undefined, row)
  const payment = await reader.payPayment.findUnique({
    where: { id: row.id }, select: {
      requestedGatewayRef: true, bankAccount: { select: { active: true } },
      merchant: { select: { gatewayPolicy: true, baleAllowed: true } },
      terminal: { select: { gatewayPolicy: true, baleEnabled: true } },
      botDelivery: { select: { routingSnapshot: true } },
    },
  })
  if (!payment) return []
  const snapshot = payment.botDelivery ? parseRoutingSnapshot(payment.botDelivery.routingSnapshot) : null
  const options = eligiblePayGateways(catalog, payment, { ...row, requestedGatewayRef: payment.requestedGatewayRef, hasBankAccount: Boolean(payment.bankAccount?.active) })
  if (!snapshot) return options
  const available = new Map(options.map(option => [option.ref, option]))
  return withGatewayPriority(snapshot.gateways.flatMap(method => available.get(method.ref) ?? []))
}
