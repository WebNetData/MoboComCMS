import { createHash, timingSafeEqual } from 'node:crypto'
import { latinDigits } from '@/shared/text/digits'

/** A status-only paper capability derived from the existing random receipt, independent of handover. */
export function repairTrackingCode(id: number, receiptToken: string): string {
  if (!Number.isSafeInteger(id) || id <= 0 || !/^[A-Za-z0-9_-]{20,40}$/.test(receiptToken)) return ''
  const hash = createHash('sha256').update(`mobocom:repair-tracking:v1:${id}:${receiptToken}`).digest('hex').slice(0, 20).toUpperCase()
  return `${id}-${hash.match(/.{4}/g)!.join('-')}`
}

export function parseTrackingCode(value: unknown): { id: number; proof: string } | null {
  if (typeof value !== 'string' || value.length > 80) return null
  const match = /^([1-9]\d{0,9})-([A-F0-9-]+)$/.exec(latinDigits(value).toUpperCase().replace(/\s/g, ''))
  if (!match || Number(match[1]) > 2147483647) return null
  const proof = match[2].replace(/-/g, '')
  return /^[A-F0-9]{20}$/.test(proof) ? { id: Number(match[1]), proof } : null
}

export function matchesTrackingCode(input: { id: number; proof: string }, receiptToken: string): boolean {
  const expected = repairTrackingCode(input.id, receiptToken).split('-').slice(1).join('')
  return expected.length === 20 && input.proof.length === 20 && timingSafeEqual(Buffer.from(expected), Buffer.from(input.proof))
}
