/**
 * Client-safe idempotency key generator. Uses crypto.randomUUID when present
 * and falls back to crypto.getRandomValues; it never downgrades to a
 * pseudo-random timestamp-based fallback, so keys stay unpredictable in every
 * supported browser.
 */
export function newIdempotencyKey(prefix: string): string {
  if (typeof crypto !== 'undefined') {
    if (typeof crypto.randomUUID === 'function') return `${prefix}-${crypto.randomUUID()}`
    if (typeof crypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(16)
      crypto.getRandomValues(bytes)
      return `${prefix}-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`
    }
  }
  throw new Error('Secure random generation is not available in this browser')
}
