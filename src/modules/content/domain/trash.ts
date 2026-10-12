// A delete asked by a section author. The item is not removed: its status becomes TRASHED and the status it had
// is kept, so every public reader (which asks for PUBLISHED) stops showing it at once and a manager can put it
// back exactly as it was. Only a manager deletes for good. The database holds the same rule (migration
// 20261224120000_section_authors): a trashed row always says what it was and when it was asked.

export const TRASHED = 'TRASHED'

export type Trashable = { status: string; trashedStatus?: string | null }

export const isTrashed = (row: { status: string }) => row.status === TRASHED

/** The fields that send an item to the trash. Never call for a row that is already there. */
export function trashData(row: Trashable, userId: number, now = new Date()) {
  if (isTrashed(row)) throw new Error('already in the trash')
  return { status: TRASHED, trashedStatus: row.status, trashedAt: now, trashedById: userId }
}

/** The fields that put a trashed item back as it was; a draft if what it was is unknown. */
export function restoreData(row: Trashable) {
  if (!isTrashed(row)) throw new Error('not in the trash')
  return { status: row.trashedStatus && row.trashedStatus !== TRASHED ? row.trashedStatus : 'DRAFT', trashedStatus: '', trashedAt: null, trashedById: null }
}

/** A status a form may send: the trash is entered and left only through its own actions. */
export const formStatus = <T,>(value: T): T => { if (value === TRASHED) throw new Error('این وضعیت از فرم قابل انتخاب نیست'); return value }
