// Versions of what staff edit: after every save the item's own fields are kept as a version, so the history
// of an item can be read and an earlier state put back. A version holds the item's own columns only (not
// its links, seasons or categories, which have their own tables) and never a secret.

export const KEEP_REVISIONS = 50
/** Columns that are not content: identity, clocks and counters the site moves by itself. */
const SKIP = /^(id|createdAt|updatedAt|views|downloads|clicks|plays|sales|soldCount|likeCount|replyCount|postCount|threadCount|commentCount|ratingSum|ratingCount)$/
const SECRET = /password|secret|token|authorization|cookie|api[_-]?key|private[_-]?key/i
const MAX_TEXT = 200_000

export type Snapshot = Record<string, string | number | boolean | null>
export type RevisionSource = 'baseline' | 'edit' | 'restore' | 'import'

/** The item's own columns as plain values: dates as ISO text, big numbers as text, nothing nested, nothing secret. */
export function snapshotOf(row: Record<string, unknown>): Snapshot {
  const out: Snapshot = {}
  for (const [key, value] of Object.entries(row)) {
    if (SKIP.test(key) || SECRET.test(key)) continue
    if (value === null) out[key] = null
    else if (value instanceof Date) out[key] = value.toISOString()
    else if (typeof value === 'bigint') out[key] = value.toString()
    else if (typeof value === 'string') out[key] = value.length > MAX_TEXT ? value.slice(0, MAX_TEXT) : value
    else if (typeof value === 'number' || typeof value === 'boolean') out[key] = value
    // relations and anything else that is not a column of the item are left out
  }
  return out
}

/** The columns whose value differs between two versions, in a stable order. */
export function changedFields(before: Snapshot | null, after: Snapshot): string[] {
  if (!before) return Object.keys(after).sort()
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((key) => before[key] !== after[key]).sort()
}

const brief = (value: Snapshot[string] | undefined) => { const text = value === null || value === undefined ? '' : String(value); return text.length > 400 ? `${text.slice(0, 400)}…` : text }

/** What changed between two versions, short enough to read in a list. */
export function diffOf(before: Snapshot | null, after: Snapshot): { field: string; before: string; after: string }[] {
  return changedFields(before, after).map((field) => ({ field, before: brief(before?.[field]), after: brief(after[field]) }))
}

/**
 * The values to write when a version is put back: the version's columns that the item still has, each in
 * the kind of value the column holds now (a date, a big number), so a column added or dropped since
 * does not break the restore.
 */
export function restoreValues(snapshot: Snapshot, current: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(snapshot)) {
    if (!(key in current) || SKIP.test(key) || SECRET.test(key)) continue
    const now = current[key]
    if (value !== null && (now instanceof Date || (now === null && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value) && /(At|Date)$/.test(key)))) out[key] = new Date(String(value))
    else if (value !== null && typeof now === 'bigint') out[key] = BigInt(String(value))
    else out[key] = value
  }
  return out
}

export const parseSnapshot = (raw: string): Snapshot => { try { const value = JSON.parse(raw || '{}'); return value && typeof value === 'object' ? value as Snapshot : {} } catch { return {} } }
