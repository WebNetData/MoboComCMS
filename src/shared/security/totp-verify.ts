import crypto from 'node:crypto'
import { base32Decode, hotpFromDigest, totpCounter } from '@/shared/security/totp'

/** The 6-digit code for a base32 secret at a moment in time (server only). */
export function totpCode(secret: string, now = Date.now()): string {
  const digest = crypto.createHmac('sha1', Buffer.from(base32Decode(secret))).update(Buffer.from(totpCounter(now))).digest()
  return hotpFromDigest(new Uint8Array(digest))
}

/** The 30-second step a code matched (current step ±1 for clock drift), or null. */
export function matchTotp(secret: string, code: unknown, now = Date.now()): number | null {
  const given = String(code || '').replace(/\s/g, '')
  if (!/^\d{6}$/.test(given)) return null
  for (const drift of [0, -1, 1]) {
    const at = now + drift * 30_000
    if (crypto.timingSafeEqual(Buffer.from(totpCode(secret, at)), Buffer.from(given))) return Math.floor(at / 30_000)
  }
  return null
}

export const verifyTotp = (secret: string, code: unknown, now = Date.now()) => matchTotp(secret, code, now) !== null
