/** Same-process Admin contract; private storage metadata is not part of the UI API. */
export type ForumRestrictionView = {
  id: number; effectKey: string; reason: string; source: string
  issuedAt: string; startsAt: string; expiresAt: string | null
  issuedByUserId: number | null; revokedAt: string | null
  revokedByUserId: number | null; revocationReason: string
}
export type ForumRestrictionHistory = { rows: ForumRestrictionView[]; next: number | null }
export function forumRestrictionStatus(row: ForumRestrictionView, now = Date.now()) {
  if (row.revokedAt) return 'revoked'
  if (row.expiresAt && new Date(row.expiresAt).getTime() <= now) return 'expired'
  if (new Date(row.startsAt).getTime() > now) return 'scheduled'
  return 'active'
}
