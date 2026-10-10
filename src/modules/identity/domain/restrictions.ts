export type RestrictionScope = 'GLOBAL' | 'MODULE' | 'RESOURCE' | 'CAPABILITY'
export class RestrictionError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}
export type RestrictionFact = {
  id: number; effectKey: string; capabilities: string; source: string
  startsAt: Date; expiresAt: Date | null; revokedAt: Date | null
}
export function restrictionActive(row: Pick<RestrictionFact, 'startsAt' | 'expiresAt' | 'revokedAt'>, now = new Date()) {
  return !row.revokedAt && row.startsAt <= now && (!row.expiresAt || row.expiresAt > now)
}
export function deniedCapabilities(rows: readonly RestrictionFact[], now = new Date()): Set<string> {
  const denied = new Set<string>()
  for (const row of rows) {
    if (!restrictionActive(row, now)) continue
    let values: unknown
    try { values = JSON.parse(row.capabilities) } catch { throw new RestrictionError('اطلاعات محدودیت معتبر نیست', 503) }
    if (!Array.isArray(values) || !values.length || values.some(value => typeof value !== 'string' || !/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(value))) throw new RestrictionError('اطلاعات محدودیت معتبر نیست', 503)
    for (const value of values) denied.add(value)
  }
  return denied
}
