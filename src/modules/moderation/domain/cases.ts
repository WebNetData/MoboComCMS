import type { QueueSourceKey } from '@/modules/moderation/domain/queue'

// A case is what staff do about one waiting item, whatever module the item belongs to: who has taken it,
// what they noted for each other, and what was decided from the overview. The item and its decision stay
// with the owning module; a case only records the work around it.
//
//   OPEN      noted, taken by nobody
//   CLAIMED   one staff member is looking at it
//   DECIDED   a decision was sent from the overview and the owner accepted it
//   CLOSED    left behind: the item was dealt with somewhere else, or the claim was never finished

export type CaseStatus = 'OPEN' | 'CLAIMED' | 'DECIDED' | 'CLOSED'
export const CASE_ACTIONS = ['claim', 'release', 'note', 'decided'] as const
export type CaseAction = (typeof CASE_ACTIONS)[number]

/** A claim nobody finished frees itself: after this long anybody may take the item. */
export const CLAIM_HOURS = 12
/** Claims left this long are closed by the sweep. */
export const ABANDONED_DAYS = 7
export const MAX_CASE_NOTE = 1000

export const claimIsFresh = (claimedAt: Date | null, now: Date) => !!claimedAt && now.getTime() - claimedAt.getTime() < CLAIM_HOURS * 3_600_000

/** Plain text of a staff note: no markup, no control characters, one length. */
export const cleanCaseNote = (value: unknown) => String(value ?? '').replace(/[<>]/g, '').replace(/[\u0000-\u0008\u000b-\u001f]/g, ' ').trim().slice(0, MAX_CASE_NOTE)

export type CaseRow = { status: string; assigneeId: number | null; claimedAt: Date | null }

/**
 * Whether a staff member may take an item now. Free when nobody holds it, when the holder is the same
 * person, or when the claim has gone stale; someone else's fresh claim is taken over only on purpose.
 */
export function claimRefusal(row: CaseRow | null, staffId: number, now: Date, takeOver = false): string | null {
  if (!row) return null
  if (row.status === 'DECIDED') return 'این مورد تصمیم‌گیری شده است'
  if (row.status !== 'CLAIMED' || row.assigneeId === staffId || !claimIsFresh(row.claimedAt, now) || takeOver) return null
  return 'همکار دیگری همین حالا روی این مورد کار می‌کند'
}

export interface CaseView {
  round: number
  status: CaseStatus
  /** Who holds it now (a stale claim holds nothing). */
  assignee: { id: number; name: string } | null
  mine: boolean
  note: string
}

export const isQueueSource = (value: unknown, known: readonly QueueSourceKey[]): value is QueueSourceKey => typeof value === 'string' && (known as readonly string[]).includes(value)
