import { env } from './env'

function positiveNumber(name: string, fallback: number) {
  const raw = env(name)
  if (!raw) return fallback
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive number`)
  return value
}

/** Deployment defaults only. DB settings can override them per currency. */
export function walletTopupDefaults() {
  return {
    min: positiveNumber('WALLET_TOPUP_DEFAULT_MIN', 1),
    max: positiveNumber('WALLET_TOPUP_DEFAULT_MAX', 5000),
  }
}
