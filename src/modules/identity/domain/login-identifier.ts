import { normalizeMobile } from '@/modules/sms/domain/sms'

/** One canonical throttle/lookup key for all supported spellings of a mobile or email. */
export function loginIdentifier(input: unknown): { kind: 'email' | 'phone'; value: string } | null {
  if (typeof input !== 'string' || input.length > 254) return null
  const value = input.trim().toLowerCase()
  if (value.includes('@')) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? { kind: 'email', value } : null
  const phone = normalizeMobile(value)
  return phone ? { kind: 'phone', value: phone } : null
}
