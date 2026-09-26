/** Return a positive integer rate or null without accepting floats/signs. */
export function positiveIntegerRate(value: unknown): bigint | null {
  const raw = String(value ?? '').trim()
  if (!/^\d+$/.test(raw)) return null
  try {
    const rate = BigInt(raw)
    return rate > 0n ? rate : null
  } catch {
    return null
  }
}

/** DB setting wins only when it is a valid positive rate; otherwise env can recover it. */
export function resolveUsdTomanRate(settingValue: unknown, envValue: unknown): bigint | null {
  return positiveIntegerRate(settingValue) ?? positiveIntegerRate(envValue)
}

export function resolveUsdTomanRateNumber(settingValue: unknown, envValue: unknown): number {
  const rate = resolveUsdTomanRate(settingValue, envValue)
  if (rate == null || rate > BigInt(Number.MAX_SAFE_INTEGER)) return 0
  return Number(rate)
}
