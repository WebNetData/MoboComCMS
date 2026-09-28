// Section home-page layout helpers shared by content modules (rail order,
// hand-picked ids, bounded numbers). Pure and dependency-free.

export const clampInt = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(value))
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

export function normalizeRails<K extends string>(raw: unknown, labels: Record<K, string>): { key: K; enabled: boolean }[] {
  const seen = new Set<string>()
  const rails: { key: K; enabled: boolean }[] = []
  for (const row of Array.isArray(raw) ? raw : []) {
    const key = String((row as Record<string, unknown>)?.key || '')
    if (!Object.prototype.hasOwnProperty.call(labels, key) || seen.has(key)) continue
    seen.add(key)
    rails.push({ key: key as K, enabled: (row as Record<string, unknown>).enabled !== false })
  }
  for (const key of Object.keys(labels) as K[]) if (!seen.has(key)) rails.push({ key, enabled: true })
  return rails
}

export function normalizeIds(raw: unknown, max: number): number[] {
  const ids = Array.isArray(raw) ? raw.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0) : []
  return [...new Set(ids)].slice(0, max)
}

export function parseSettingsInput(input: unknown): Record<string, unknown> {
  if (typeof input === 'string') { try { const value = JSON.parse(input); return value && typeof value === 'object' ? value : {} } catch { return {} } }
  return input && typeof input === 'object' ? input as Record<string, unknown> : {}
}

/** Enabled rails in admin order — the public page renders exactly this list. */
export const railOrder = <K extends string>(rails: { key: K; enabled: boolean }[]) => rails.filter((rail) => rail.enabled).map((rail) => rail.key)

