export function renewalTarget(input: {
  now: number; localExpiresAt: number; panelExpiresAt: number | null
  localLimitGB: number; panelLimitGB: number; days: number; trafficGB: number
}) {
  if (![input.now, input.localExpiresAt, input.localLimitGB, input.panelLimitGB, input.days, input.trafficGB].every(Number.isFinite)
    || input.days <= 0 || input.trafficGB < 0 || input.localLimitGB < 0 || input.panelLimitGB < 0) throw new Error('invalid renewal allowance')
  const expiresAt = new Date(Math.max(input.now, input.localExpiresAt, input.panelExpiresAt || 0) + input.days * 86400_000)
  // Zero is the providers' unlimited sentinel, not an empty allowance.
  const trafficLimitGB = input.trafficGB === 0 || input.panelLimitGB === 0
    ? 0 : Math.max(input.localLimitGB, input.panelLimitGB) + input.trafficGB
  if (!Number.isFinite(expiresAt.getTime()) || !Number.isFinite(trafficLimitGB)) throw new Error('renewal allowance exceeds limits')
  return { expiresAt: expiresAt.toISOString(), trafficLimitGB }
}
