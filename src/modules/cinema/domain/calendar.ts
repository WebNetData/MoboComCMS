// Episode calendar of the series section: what airs next and what aired last, by day.

export type CalendarWhen = 'upcoming' | 'recent'
export const CALENDAR_PAGE = 30

export const normalizeWhen = (value: unknown): CalendarWhen => (value === 'recent' ? 'recent' : 'upcoming')
export const calendarPage = (value: unknown) => { const page = Math.trunc(Number(value)); return page >= 1 && page <= 500 ? page : 1 }

export interface CalendarEpisode {
  id: number
  /** Air time, ISO. */
  at: string
  season: number
  number: number
  title: string
  titleEn: string
  /** The episode or its series is for members. */
  members: boolean
  series: { slug: string; title: string; titleEn: string; poster: string }
}

/** The calendar day of an air time where the site's audience lives. */
export const tehranDay = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))

/** S02E07 — the usual short name of an episode. */
export const episodeCode = (season: number, number: number) => `S${String(season).padStart(2, '0')}E${String(number).padStart(2, '0')}`

/** Consecutive episodes of one day become one group; the order they came in is kept. */
export function groupByDay(episodes: readonly CalendarEpisode[]): { day: string; episodes: CalendarEpisode[] }[] {
  const groups: { day: string; episodes: CalendarEpisode[] }[] = []
  for (const episode of episodes) {
    const day = tehranDay(episode.at)
    const last = groups[groups.length - 1]
    if (last && last.day === day) last.episodes.push(episode)
    else groups.push({ day, episodes: [episode] })
  }
  return groups
}

/** Whole days from today's calendar day to the day of `iso`: 0 today, 1 tomorrow, -1 yesterday. */
export function daysAway(iso: string, now: Date): number {
  const utc = (day: string) => Date.parse(`${day}T00:00:00Z`)
  return Math.round((utc(tehranDay(iso)) - utc(tehranDay(now.toISOString()))) / 86_400_000)
}

// ---- the other side of the calendar: the day a film opens

export type CalendarKind = 'episodes' | 'films'
export const normalizeKind = (value: unknown): CalendarKind => (value === 'films' ? 'films' : 'episodes')

export interface CalendarFilm {
  id: number
  /** Release day, ISO. */
  at: string
  slug: string
  title: string
  titleEn: string
  poster: string
  year: number | null
  members: boolean
}

/** Consecutive items of one day become one group, whatever they are; the order they came in is kept. */
export function groupDays<T extends { at: string }>(items: readonly T[]): { day: string; items: T[] }[] {
  const groups: { day: string; items: T[] }[] = []
  for (const item of items) {
    const day = tehranDay(item.at)
    const last = groups[groups.length - 1]
    if (last && last.day === day) last.items.push(item)
    else groups.push({ day, items: [item] })
  }
  return groups
}
