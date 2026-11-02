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

/** A plan's perk line; `code` names an entry of the owner's PERK list, whose current text the site shows. */
export type Perk = { icon: string; fa: string; en: string; code?: string }

export function parsePerks(raw: string | null | undefined): Perk[] {
  try {
    const parsed = JSON.parse(raw || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.slice(0, 20).flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return []
      const e = entry as Record<string, unknown>
      const fa = String(e.fa || e.text || '').slice(0, 200)
      const code = String(e.code || '').trim().toUpperCase()
      const listed = /^[A-Z0-9_]{1,40}$/.test(code)
      // A listed perk may arrive without text (the list supplies it); a free line needs its own.
      if (!fa && !listed) return []
      return [{ icon: String(e.icon || '★').slice(0, 8), fa, en: String(e.en || '').slice(0, 200), ...(listed ? { code } : {}) }]
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

// ------------------------------------------------------------------ admin summary

export type PeriodRow = { userId: number; source: string; startsAt: Date; endsAt: Date; revokedAt: Date | null; planId: number | null; orderId: number | null; createdAt: Date }

/**
 * VIP health over a window: who is active, who joined (first ever period),
 * who renewed (a paid period on top of an earlier one), who is about to
 * expire and who lapsed without renewing. Pure — the dashboard and tests share it.
 */
export function summarizeMemberships(periods: PeriodRow[], now = new Date(), windowDays = 30, soonDays = 7) {
  const DAY = 86_400_000
  const since = now.getTime() - windowDays * DAY
  const soon = now.getTime() + soonDays * DAY
  const byUser = new Map<number, PeriodRow[]>()
  for (const period of periods) byUser.set(period.userId, [...(byUser.get(period.userId) || []), period])
  let active = 0, joined = 0, renewed = 0, expiring = 0, lapsed = 0
  const expiringUsers: { userId: number; endsAt: Date }[] = []
  const bySource: Record<string, number> = {}
  const byPlan = new Map<number, number>()
  for (const [userId, rows] of byUser) {
    const valid = rows.filter((row) => !row.revokedAt).sort((a, b) => +a.createdAt - +b.createdAt)
    if (!valid.length) continue
    const end = Math.max(...valid.map((row) => +row.endsAt))
    const isActive = valid.some((row) => +row.startsAt <= +now && +row.endsAt > +now) || end > +now
    if (isActive) {
      active++
      if (end <= soon) { expiring++; expiringUsers.push({ userId, endsAt: new Date(end) }) }
      const current = valid.filter((row) => +row.endsAt > +now).sort((a, b) => +b.endsAt - +a.endsAt)[0]
      if (current?.planId) byPlan.set(current.planId, (byPlan.get(current.planId) || 0) + 1)
    } else if (end >= since) lapsed++
    const first = valid[0]
    if (+first.createdAt >= since) joined++
    if (valid.some((row, index) => index > 0 && row.source === 'PURCHASE' && +row.createdAt >= since)) renewed++
    for (const row of valid) if (+row.createdAt >= since) bySource[row.source] = (bySource[row.source] || 0) + 1
  }
  expiringUsers.sort((a, b) => +a.endsAt - +b.endsAt)
  return { active, joined, renewed, expiring, lapsed, expiringUsers, bySource, byPlan: [...byPlan].map(([planId, count]) => ({ planId, count })).sort((a, b) => b.count - a.count) }
}

type HealthRow = PeriodRow & { kind: string; amountMinor: bigint; currency: string }

/**
 * The numbers a membership business runs on, over a window. Recurring value is what running paid periods are worth per 30
 * days; churn is the members who lapsed against those at the start of the window; conversion is trials followed by a paid period.
 */
export function membershipHealth(periods: HealthRow[], now = new Date(), windowDays = 30) {
  const DAY = 86_400_000
  const since = new Date(now.getTime() - windowDays * DAY)
  const recurring = new Map<string, bigint>()
  for (const row of periods) {
    if (row.revokedAt || row.kind !== 'PERIOD' || row.amountMinor <= 0n || row.startsAt > now || row.endsAt <= now || !row.currency) continue
    const days = BigInt(Math.max(1, Math.round((+row.endsAt - +row.startsAt) / DAY)))
    if (days > 3650n) continue
    recurring.set(row.currency, (recurring.get(row.currency) || 0n) + (row.amountMinor * 30n) / days)
  }
  const valid = periods.filter((row) => !row.revokedAt)
  const heldAt = (date: Date) => new Set(valid.filter((row) => row.startsAt <= date && row.endsAt > date).map((row) => row.userId))
  const startOfWindow = heldAt(since), nowHolding = heldAt(now)
  const lost = [...startOfWindow].filter((userId) => !nowHolding.has(userId)).length
  const trials = valid.filter((row) => row.kind === 'TRIAL' && row.createdAt >= since)
  const converted = trials.filter((trial) => valid.some((row) => row.userId === trial.userId && row.kind === 'PERIOD' && row.source === 'PURCHASE' && row.createdAt > trial.createdAt)).length
  return {
    recurring: [...recurring].map(([currency, amountMinor]) => ({ currency, amountMinor })),
    churnPercent: startOfWindow.size ? Math.round((lost / startOfWindow.size) * 100) : 0,
    trials: trials.length, converted, conversionPercent: trials.length ? Math.round((converted / trials.length) * 100) : 0,
  }
}
