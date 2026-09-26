/** VIP membership rules shared by server code and UI (no I/O here). */

export const ACCESS_LEVELS = ['PUBLIC', 'MEMBERS'] as const
export type AccessLevel = typeof ACCESS_LEVELS[number]

export function normalizeAccess(value: unknown): AccessLevel {
  return value === 'MEMBERS' ? 'MEMBERS' : 'PUBLIC'
}

/** Can a viewer open something with this access level? */
export function canAccess(access: string | null | undefined, member: boolean): boolean {
  return access !== 'MEMBERS' || member
}

const DAY = 86_400_000

/** New period end: stacks on top of an active membership, otherwise starts now. */
export function extendMembership(currentEnd: Date | null | undefined, days: number, now = new Date()): { startsAt: Date; endsAt: Date } {
  const safeDays = Math.max(1, Math.min(3650, Math.round(days)))
  const startsAt = currentEnd && currentEnd > now ? currentEnd : now
  return { startsAt, endsAt: new Date(startsAt.getTime() + safeDays * DAY) }
}

export function daysLeft(endsAt: Date | string | null | undefined, now = new Date()): number {
  if (!endsAt) return 0
  const end = new Date(endsAt).getTime()
  return Math.max(0, Math.ceil((end - now.getTime()) / DAY))
}

/** Price a member pays: the member price when set and lower, otherwise the regular price. */
export function memberPrice(regularMinor: bigint, memberMinor: bigint | null | undefined, member: boolean): { amountMinor: bigint; memberDiscount: boolean } {
  if (member && memberMinor && memberMinor > 0n && memberMinor < regularMinor) return { amountMinor: memberMinor, memberDiscount: true }
  return { amountMinor: regularMinor, memberDiscount: false }
}

export type Perk = { icon: string; fa: string; en: string }

export function parsePerks(raw: string | null | undefined): Perk[] {
  try {
    const parsed = JSON.parse(raw || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.slice(0, 20).flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return []
      const e = entry as Record<string, unknown>
      const fa = String(e.fa || e.text || '').slice(0, 200)
      if (!fa) return []
      return [{ icon: String(e.icon || '★').slice(0, 8), fa, en: String(e.en || '').slice(0, 200) }]
    })
  } catch { return [] }
}

export const MEMBERSHIP_SLUG = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/

/**
 * Preview of members-only rich text: the first few top-level paragraphs (the caller
 * re-sanitizes the result, which also closes any tag the cut left open).
 */
export function teaserHtml(html: string, paragraphs = 2, maxChars = 900): string {
  const source = String(html || '')
  let cut = -1
  let from = 0
  for (let i = 0; i < paragraphs; i += 1) {
    const at = source.indexOf('</p>', from)
    if (at < 0) break
    cut = at + 4
    from = cut
  }
  if (cut > 0 && cut <= maxChars * 2) return source.slice(0, cut)
  const plain = source.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxChars)
  return plain ? `<p>${plain.replace(/&(?![a-z#0-9]+;)/gi, '&amp;').replace(/</g, '&lt;')}…</p>` : ''
}
