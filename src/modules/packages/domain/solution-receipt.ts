/** One-time provisioning receipt; complete history stays in canonical strict Audit. */
export interface SolutionApplyReceipt {
  fingerprint: string
  appliedAt: string
  actorId: number
  modules: string[]
  defaultKeys: string[]
}

export function isSolutionApplyReceipt(value: unknown): value is SolutionApplyReceipt {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as Record<string, unknown>
  return Object.keys(item).every(key => ['fingerprint', 'appliedAt', 'actorId', 'modules', 'defaultKeys'].includes(key))
    && typeof item.fingerprint === 'string' && /^[0-9a-f]{64}$/.test(item.fingerprint)
    && typeof item.appliedAt === 'string' && Number.isFinite(Date.parse(item.appliedAt))
    && Number.isSafeInteger(item.actorId) && (item.actorId as number) > 0
    && Array.isArray(item.modules) && item.modules.length <= 30 && item.modules.every(id => typeof id === 'string' && /^[a-z][a-z0-9-]{1,49}$/.test(id))
    && Array.isArray(item.defaultKeys) && item.defaultKeys.length <= 900 && item.defaultKeys.every(key => typeof key === 'string' && /^[a-z][a-z0-9-]{1,49}\.[a-zA-Z0-9._-]{1,80}$/.test(key))
}
