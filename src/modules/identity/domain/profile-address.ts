// A member has one public address: /u/<username>. What the forum knows about them is a part of that page.
// The older forum address answers by pointing there, so no link written before stops working.

export const FORUM_PART = 'forum'
/** The pieces of the forum part of a profile, the first being what opens by default. */
export const FORUM_PIECES = ['summary', 'activity', 'topics', 'badges'] as const
export type ForumPiece = (typeof FORUM_PIECES)[number]
/** Tabs the social profile already had under the same names the forum profile used for them. */
const SHARED_TABS = ['posts', 'followers', 'following']

export const normalizeForumPiece = (value: unknown): ForumPiece => ((FORUM_PIECES as readonly string[]).includes(String(value)) ? String(value) as ForumPiece : 'summary')

/** The member's address, optionally at the forum part and one of its pieces. */
export function profileAddress(username: string, piece?: ForumPiece | null): string {
  const base = `/u/${encodeURIComponent(username)}`
  if (piece === undefined || piece === null) return base
  return `${base}?tab=${FORUM_PART}${piece === 'summary' ? '' : `&f=${piece}`}`
}

/**
 * Where the member's address leads while social profiles are off (or the member has no social profile yet): the
 * forum's own page, at the piece asked for. Links name the one address; this keeps them working either way.
 */
export function forumStandInAddress(username: string, tab?: unknown, piece?: unknown): string {
  const base = `/forum/u/${encodeURIComponent(username)}`
  const wanted = String(tab ?? '') === FORUM_PART ? normalizeForumPiece(piece) : 'summary'
  return wanted === 'summary' ? base : `${base}?tab=${wanted}`
}

/** Where the old forum address (`/forum/u/<username>?tab=…`) leads now. */
export function forumAddressTarget(username: string, tab?: unknown): string {
  const wanted = String(tab ?? '')
  if (SHARED_TABS.includes(wanted)) return `/u/${encodeURIComponent(username)}?tab=${wanted}`
  return profileAddress(username, normalizeForumPiece(wanted))
}
