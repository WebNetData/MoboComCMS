/**
 * The comparison list lives in the visitor's browser (a per-viewer
 * convenience): up to four items of one type, e.g. "software:12".
 */
export type CompareEntry = { key: string; title: string; image: string }

const STORAGE_KEY = 'mobocom.compare.v1'
export const COMPARE_EVENT = 'mobocom:compare'
export const COMPARE_LIMIT = 4

const typeOf = (key: string) => key.split(':')[0]

export function readCompare(): CompareEntry[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(raw) ? raw.filter((entry) => entry && typeof entry.key === 'string' && /^[a-z]+:\d+$/.test(entry.key)).slice(0, COMPARE_LIMIT) : []
  } catch { return [] }
}

function write(entries: CompareEntry[]) {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)) } catch { /* storage unavailable: the list just is not kept */ }
  window.dispatchEvent(new Event(COMPARE_EVENT))
}

/** Adds or removes an item. Returns what happened so the UI can explain it. */
export function toggleCompare(entry: CompareEntry): 'added' | 'removed' | 'full' | 'type' {
  const current = readCompare()
  if (current.some((item) => item.key === entry.key)) { write(current.filter((item) => item.key !== entry.key)); return 'removed' }
  if (current.length && typeOf(current[0].key) !== typeOf(entry.key)) { write([entry]); return 'type' }
  if (current.length >= COMPARE_LIMIT) return 'full'
  write([...current, entry])
  return 'added'
}

export function removeCompare(key: string) { write(readCompare().filter((item) => item.key !== key)) }
export function clearCompare() { write([]) }
