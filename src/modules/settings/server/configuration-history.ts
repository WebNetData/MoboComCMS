import { RevisionError } from '@/modules/content/server/revisions'
import type { Snapshot } from '@/modules/content/domain/revisions'

/** Only owner-projected, validated non-secret configuration goes here. Same ContentRevision store. */
export function configurationSnapshot(value: object): Snapshot {
  const raw = JSON.stringify(value)
  if (Buffer.byteLength(raw) > 2_100_000) throw new RevisionError('حجم تنظیمات برای تاریخچه بیش از حد مجاز است.', 422)
  return { configurationDocument: raw }
}
export function configurationValue(snapshot: Snapshot): unknown {
  const raw = snapshot.configurationDocument
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > 2_100_000) throw new RevisionError('نسخهٔ تنظیمات معتبر نیست.', 422)
  try { const value = JSON.parse(raw); if (value && typeof value === 'object' && !Array.isArray(value)) return value } catch { /* fail closed */ }
  throw new RevisionError('نسخهٔ تنظیمات معتبر نیست.', 422)
}

/** Restore only fields known to this owner; retain newer metadata by stable list identity. */
export function restoreKnownConfiguration(current: unknown, known: unknown, past: unknown): unknown {
  const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
  if (Array.isArray(past)) return past.map((item, index) => {
    const at = (list: unknown) => Array.isArray(list) ? object(item) && typeof item.id === 'string' ? list.find(row => object(row) && row.id === item.id) : list[index] : undefined
    return restoreKnownConfiguration(at(current), at(known), item)
  })
  if (!object(past)) return past
  const result = object(current) ? { ...current } : {}, prior = object(known) ? known : {}
  for (const key of Object.keys(prior)) if (!Object.hasOwn(past, key)) delete result[key]
  for (const [key, value] of Object.entries(past)) result[key] = restoreKnownConfiguration(result[key], prior[key], value)
  return result
}
