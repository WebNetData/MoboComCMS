import { PayError } from './pay'
import { validRoutingRef } from './pay-routing'

export type GatewayPolicy = { mode: 'INHERIT' | 'ALLOWLIST' | 'DISABLED'; refs: string[]; version: number }
export type PayGatewayOption = { ref: string; id: number | null; name: string; provider: string; manual: boolean; isDefault: boolean; automatic?: boolean }

export function gatewayPolicyInput(input: Record<string, unknown>): GatewayPolicy {
  const { mode, refs, version } = input
  if ((mode !== 'INHERIT' && mode !== 'ALLOWLIST' && mode !== 'DISABLED') ||
    typeof version !== 'number' || !Number.isSafeInteger(version) || version < 0 ||
    !Array.isArray(refs) || refs.length > 60 || !refs.every(validRoutingRef) || new Set(refs).size !== refs.length ||
    (mode === 'ALLOWLIST' ? refs.length === 0 : refs.length !== 0)) {
    throw new PayError('حالت، ترتیب یا نسخهٔ تنظیمات درگاه معتبر نیست', 422, 'PAY_GATEWAY_POLICY_INVALID')
  }
  return { mode, refs, version }
}

export function storedGatewayPolicy(raw: string): GatewayPolicy {
  if (!raw) return { mode: 'INHERIT', refs: [], version: 0 }
  try {
    return gatewayPolicyInput(JSON.parse(raw))
  } catch {
    throw new PayError('تنظیمات درگاه قابل خواندن نیست', 503, 'PAY_GATEWAY_POLICY_UNAVAILABLE')
  }
}

export function applyGatewayPolicy<T extends { ref: string }>(catalog: T[], policy: GatewayPolicy) {
  if (policy.mode === 'DISABLED') return []
  if (policy.mode === 'INHERIT') return catalog
  const available = new Map(catalog.map(item => [item.ref, item]))
  return policy.refs.flatMap(ref => available.get(ref) ?? [])
}
