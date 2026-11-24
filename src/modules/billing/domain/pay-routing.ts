import { PayError } from './pay'

type PaymentType = 'purchase' | 'renewal' | 'balance_increase'
export interface PayRoutingRule {
  id: string; name: string; enabled: boolean; minAmountToman: string; maxAmountToman: string
  types: PaymentType[]; minPayments: number; minMembershipDays: number; gateways: string[]
}
export interface RoutingSnapshot { version: 1; ruleId: string; ruleName: string; gateways: { ref: string; name: string }[] }

const types: PaymentType[] = ['purchase', 'renewal', 'balance_increase']
const maxAmount = 900000000000000n
const ruleKeys = ['id', 'name', 'enabled', 'minAmountToman', 'maxAmountToman', 'types', 'minPayments', 'minMembershipDays', 'gateways']
const invalid = (): never => { throw new PayError('تنظیم قواعد مسیر پرداخت معتبر نیست') }
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)
const keys = (v: Record<string, unknown>, expected: string[]) => Object.keys(v).length === expected.length && expected.every(k => Object.prototype.hasOwnProperty.call(v, k))
const idValid = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(v)
const nameValid = (v: unknown): v is string => typeof v === 'string' && v.length >= 1 && v.length <= 80 && v === v.trim() && !/[\x00-\x1f\x7f-\x9f]/.test(v)
export const validRoutingRef = (v: unknown): v is string => typeof v === 'string' && v.length <= 64 && (/^db:[1-9][0-9]*$/.test(v) || /^env:[A-Z][A-Z0-9_]*$/.test(v))
const amountValid = (v: unknown): v is string => typeof v === 'string' && (v === '' || (/^(0|[1-9][0-9]{0,14})$/.test(v) && BigInt(v) <= maxAmount))
const thresholdValid = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
const unique = (v: unknown[]) => new Set(v).size === v.length

export function parseRoutingRules(input: unknown): PayRoutingRule[] {
  if (!Array.isArray(input) || input.length > 12) return invalid()
  const ids = new Set<string>()
  return input.map((value): PayRoutingRule => {
    if (!object(value) || !keys(value, ruleKeys) || !idValid(value.id) || ids.has(value.id) || !nameValid(value.name)
      || typeof value.enabled !== 'boolean' || !amountValid(value.minAmountToman) || !amountValid(value.maxAmountToman)
      || (value.minAmountToman !== '' && value.maxAmountToman !== '' && BigInt(value.minAmountToman) > BigInt(value.maxAmountToman))
      || !thresholdValid(value.minPayments) || !thresholdValid(value.minMembershipDays)
      || !Array.isArray(value.types) || value.types.length > 3 || !unique(value.types) || !value.types.every(t => types.includes(t))
      || !Array.isArray(value.gateways) || value.gateways.length < 1 || value.gateways.length > 5 || !unique(value.gateways) || !value.gateways.every(validRoutingRef)) return invalid()
    ids.add(value.id)
    return { id: value.id, name: value.name, enabled: value.enabled, minAmountToman: value.minAmountToman, maxAmountToman: value.maxAmountToman, types: value.types, minPayments: value.minPayments, minMembershipDays: value.minMembershipDays, gateways: value.gateways }
  })
}

// History values are merchant claims for routing, not proof of payment or identity.
export function matchRoutingRule(rules: PayRoutingRule[], claims: { amountRial: string; type: PaymentType; paymentCount?: number; membershipDays?: number }): PayRoutingRule | null {
  if (typeof claims.amountRial !== 'string' || !/^(0|[1-9][0-9]{0,15})$/.test(claims.amountRial) || BigInt(claims.amountRial) > maxAmount * 10n || !types.includes(claims.type)) return invalid()
  const rial = BigInt(claims.amountRial)
  return rules.find(rule => rule.enabled
    && (rule.minAmountToman === '' || rial >= BigInt(rule.minAmountToman) * 10n)
    && (rule.maxAmountToman === '' || rial <= BigInt(rule.maxAmountToman) * 10n)
    && (!rule.types.length || rule.types.includes(claims.type))
    && (!rule.minPayments || (thresholdValid(claims.paymentCount) && claims.paymentCount >= rule.minPayments))
    && (!rule.minMembershipDays || (thresholdValid(claims.membershipDays) && claims.membershipDays >= rule.minMembershipDays))) || null
}

export function parseRoutingSnapshot(raw: string): RoutingSnapshot | null {
  if (raw === '') return null
  if (typeof raw !== 'string' || raw.length > 4096) return invalid()
  let value: unknown
  try { value = JSON.parse(raw) } catch { return invalid() }
  if (!object(value) || !keys(value, ['version', 'ruleId', 'ruleName', 'gateways']) || value.version !== 1 || !idValid(value.ruleId) || !nameValid(value.ruleName)
    || !Array.isArray(value.gateways) || value.gateways.length < 1 || value.gateways.length > 5) return invalid()
  const refs = new Set<string>()
  const gateways = value.gateways.map((row): { ref: string; name: string } => {
    if (!object(row) || !keys(row, ['ref', 'name']) || !validRoutingRef(row.ref) || !nameValid(row.name) || refs.has(row.ref)) return invalid()
    refs.add(row.ref)
    return { ref: row.ref, name: row.name }
  })
  return { version: 1, ruleId: value.ruleId, ruleName: value.ruleName, gateways }
}
