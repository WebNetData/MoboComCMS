/**
 * Discourse-parity rules (pure): polls in posts, watched words, the review
 * queue decision, slow mode, topic timers, personal-message recipients and
 * moving posts between topics.
 */

import type { ForumSettings, Viewer, WatchedWords } from '@/modules/forum/domain/community'

export class RuleError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

// ------------------------------------------------------------------ polls

export type PollType = 'regular' | 'multiple'
export type PollResults = 'always' | 'on_vote' | 'on_close'
export type PollSpec = {
  name: string; title: string; type: PollType; options: { id: string; label: string }[]
  min: number; max: number; results: PollResults; closesAt: string | null
}

export const POLL_BLOCK = /^\[poll([^\]\n]*)\]\n([\s\S]*?)\n\[\/poll\][ \t]*$/gm
const ATTR = /(\w+)=(?:"([^"]*)"|([^\s"]+))/g
export const MAX_POLLS = 5
export const MAX_POLL_OPTIONS = 20

/** A short stable id for an option label (so renaming another option does not move votes). */
export function optionId(label: string): string {
  let hash = 5381
  for (const char of label) hash = ((hash * 33) ^ char.codePointAt(0)!) >>> 0
  return hash.toString(36)
}

/**
 * Polls written as
 *   [poll name=lunch type=multiple max=2 results=on_vote title="…"]
 *   - option one
 *   - option two
 *   [/poll]
 */
export function parsePolls(source: string): PollSpec[] {
  const polls: PollSpec[] = []
  const names = new Set<string>()
  for (const match of String(source || '').replace(/\r\n?/g, '\n').matchAll(POLL_BLOCK)) {
    const attrs: Record<string, string> = {}
    for (const attr of match[1].matchAll(ATTR)) attrs[attr[1].toLowerCase()] = (attr[2] ?? attr[3] ?? '').trim()
    const name = (attrs.name || 'poll').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 20) || 'poll'
    if (names.has(name)) throw new RuleError(`نام نظرسنجی «${name}» تکراری است؛ برای هر نظرسنجی name متفاوت بگذارید`)
    names.add(name)
    const labels = [...new Set(match[2].split('\n').map((line) => /^\s*[-*•]\s+(.+)$/.exec(line)?.[1]?.trim().slice(0, 200)).filter((label): label is string => !!label))]
    if (labels.length < 2) throw new RuleError('هر نظرسنجی دست‌کم دو گزینه لازم دارد (هر گزینه در یک خط با - شروع شود)')
    if (labels.length > MAX_POLL_OPTIONS) throw new RuleError(`هر نظرسنجی حداکثر ${MAX_POLL_OPTIONS.toLocaleString('fa-IR')} گزینه دارد`)
    const options = labels.map((label) => ({ id: optionId(label), label }))
    if (new Set(options.map((option) => option.id)).size !== options.length) throw new RuleError('گزینه‌های نظرسنجی باید متفاوت باشند')
    const type: PollType = attrs.type === 'multiple' ? 'multiple' : 'regular'
    const max = type === 'multiple' ? Math.max(1, Math.min(options.length, Number(attrs.max) || options.length)) : 1
    const min = type === 'multiple' ? Math.max(1, Math.min(max, Number(attrs.min) || 1)) : 1
    const results: PollResults = attrs.results === 'always' || attrs.results === 'on_close' ? attrs.results : 'on_vote'
    const close = attrs.close ? new Date(attrs.close) : null
    polls.push({ name, title: (attrs.title || '').slice(0, 200), type, options, min, max, results, closesAt: close && !Number.isNaN(close.getTime()) ? close.toISOString() : null })
    if (polls.length > MAX_POLLS) throw new RuleError(`هر پیام حداکثر ${MAX_POLLS.toLocaleString('fa-IR')} نظرسنجی دارد`)
  }
  return polls
}

export function validateVote(poll: { type: string; min: number; max: number; options: { id: string }[]; closed: boolean; closesAt: Date | null }, choice: unknown, now = new Date()): string[] {
  if (poll.closed || (poll.closesAt && poll.closesAt <= now)) throw new RuleError('این نظرسنجی بسته شده است', 409)
  const picked = [...new Set((Array.isArray(choice) ? choice : [choice]).map(String))]
  if (!picked.length || picked.some((id) => !poll.options.some((option) => option.id === id))) throw new RuleError('گزینهٔ انتخاب‌شده معتبر نیست')
  if (poll.type !== 'multiple' && picked.length !== 1) throw new RuleError('فقط یک گزینه را انتخاب کنید')
  if (picked.length < poll.min || picked.length > poll.max) throw new RuleError(`بین ${poll.min.toLocaleString('fa-IR')} تا ${poll.max.toLocaleString('fa-IR')} گزینه انتخاب کنید`)
  return picked
}

/** Whether a viewer sees the tallies now. */
export const resultsVisible = (poll: { results: string; closed: boolean; closesAt: Date | null }, voted: boolean, staff: boolean, now = new Date()) =>
  staff || poll.results === 'always' || (poll.results === 'on_vote' && voted) || poll.closed || !!(poll.closesAt && poll.closesAt <= now)

// ------------------------------------------------------------------ watched words

const normalizeText = (value: string) => value.toLowerCase().replace(/[ي]/g, 'ی').replace(/[ك]/g, 'ک').replace(/‌/g, ' ')
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** A word matches on word boundaries (so "کار" does not hit "کارت"); `*` works as a wildcard. */
function wordPattern(word: string) {
  const body = escapeRegex(normalizeText(word)).replace(/\\\*/g, '[\\p{L}\\p{N}_]*')
  return new RegExp(`(^|[^\\p{L}\\p{N}_])(${body})(?=$|[^\\p{L}\\p{N}_])`, 'giu')
}

export function findWatched(text: string, words: string[]): string | null {
  const haystack = normalizeText(text)
  for (const word of words) {
    wordPatternCache(word).lastIndex = 0
    if (wordPatternCache(word).test(haystack)) return word
  }
  return null
}

const cacheMap = new Map<string, RegExp>()
function wordPatternCache(word: string) {
  let pattern = cacheMap.get(word)
  if (!pattern) { pattern = wordPattern(word); cacheMap.set(word, pattern); if (cacheMap.size > 2000) cacheMap.clear() }
  return pattern
}

/** Replaces censored words with ■ (same length), keeping everything else. */
export function censorText(text: string, words: string[]): string {
  if (!words.length || !text) return text
  let out = text
  for (const word of words) {
    const pattern = wordPattern(word)
    const normalized = normalizeText(out)
    let result = ''
    let last = 0
    for (const match of normalized.matchAll(pattern)) {
      const start = (match.index ?? 0) + match[1].length
      result += out.slice(last, start) + '■'.repeat(match[2].length)
      last = start + match[2].length
    }
    out = result + out.slice(last)
  }
  return out
}

export type ContentVerdict = { action: 'publish' } | { action: 'review'; reason: string } | { action: 'block'; word: string }

/**
 * What happens to new content: blocked words refuse it, "approve" words and
 * a new member's first posts go to the review queue, anything else publishes.
 * Staff content is never held.
 */
export function contentVerdict(input: { text: string; viewer: Pick<Viewer, 'moderator' | 'trustLevel'>; approvedPosts: number; settings: Pick<ForumSettings, 'approveNewUserPosts'> & { watchedWords: WatchedWords } }): ContentVerdict {
  if (input.viewer.moderator) return { action: 'publish' }
  const blocked = findWatched(input.text, input.settings.watchedWords.block)
  if (blocked) return { action: 'block', word: blocked }
  const flagged = findWatched(input.text, input.settings.watchedWords.approve)
  if (flagged) return { action: 'review', reason: `واژهٔ تحت نظر: ${flagged}` }
  if (input.viewer.trustLevel === 0 && input.approvedPosts < input.settings.approveNewUserPosts) return { action: 'review', reason: 'پیام‌های نخست کاربر تازه‌وارد' }
  return { action: 'publish' }
}

// ------------------------------------------------------------------ topic timers & slow mode

export const SLOW_MODE_CHOICES = [0, 60, 300, 600, 1800, 3600, 3 * 3600, 6 * 3600, 12 * 3600, 86400]

/** Seconds a member still has to wait in a slow-mode topic (0 = may post). */
export function slowModeWait(seconds: number, lastOwnPostAt: Date | null, now = new Date()): number {
  if (!seconds || !lastOwnPostAt) return 0
  return Math.max(0, Math.ceil((lastOwnPostAt.getTime() + seconds * 1000 - now.getTime()) / 1000))
}

export const timerDue = (closeAt: Date | null | undefined, now = new Date()) => !!closeAt && closeAt <= now

/** Timer from "hours from now" or an ISO date; null clears it. Must be in the future and within a year. */
export function parseCloseAt(input: { hours?: unknown; at?: unknown }, now = new Date()): Date | null {
  if (input.hours === null || input.at === null || input.hours === '' || input.at === '') return null
  let date: Date | null = null
  if (input.hours !== undefined) {
    const hours = Number(input.hours)
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24 * 365) throw new RuleError('مدت زمان‌بندی معتبر نیست')
    date = new Date(now.getTime() + hours * 3_600_000)
  } else if (input.at !== undefined) {
    date = new Date(String(input.at))
    if (Number.isNaN(date.getTime())) throw new RuleError('زمان بستن معتبر نیست')
  }
  if (!date) return null
  if (date <= now) throw new RuleError('زمان بستن باید در آینده باشد')
  if (date.getTime() - now.getTime() > 366 * 86_400_000) throw new RuleError('زمان بستن حداکثر یک سال بعد است')
  return date
}

export function formatWait(seconds: number): string {
  const fa = (n: number) => n.toLocaleString('fa-IR')
  if (seconds < 60) return `${fa(seconds)} ثانیه`
  if (seconds < 3600) return `${fa(Math.ceil(seconds / 60))} دقیقه`
  return `${fa(Math.ceil(seconds / 3600))} ساعت`
}

// ------------------------------------------------------------------ personal messages

export const MAX_RECIPIENTS = 10
export const MAX_GROUP_RECIPIENTS = 50

/** Usernames from "a, @b c" or an array; lowercase, unique, bounded. */
export function parseRecipients(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : String(value ?? '').split(/[\s,،]+/)
  const names = [...new Set(raw.map((name) => String(name).trim().replace(/^@/, '').toLowerCase()).filter((name) => /^[a-z0-9_]{3,20}$/.test(name)))]
  if (!names.length) throw new RuleError('دست‌کم یک گیرنده (نام کاربری) وارد کنید')
  if (names.length > MAX_RECIPIENTS) throw new RuleError(`حداکثر ${MAX_RECIPIENTS.toLocaleString('fa-IR')} گیرنده`)
  return names
}

export function canStartMessage(viewer: Pick<Viewer, 'userId' | 'moderator' | 'trustLevel' | 'silenced' | 'suspended'>, settings: Pick<ForumSettings, 'messagesEnabled' | 'messagesMinTrust'>): boolean {
  if (!viewer.userId || viewer.suspended || viewer.silenced) return false
  if (viewer.moderator) return true
  return settings.messagesEnabled && viewer.trustLevel >= settings.messagesMinTrust
}

// ------------------------------------------------------------------ moving posts

/** Post numbers to move: unique, positive, not the opening post, at most 200. */
export function normalizeMoveSelection(value: unknown): number[] {
  const numbers = [...new Set((Array.isArray(value) ? value : []).map(Number).filter((n) => Number.isSafeInteger(n) && n > 0))].sort((a, b) => a - b)
  if (!numbers.length) throw new RuleError('پیام‌هایی را که باید منتقل شوند انتخاب کنید')
  if (numbers.includes(1)) throw new RuleError('پیام اول را نمی‌توان جدا کرد؛ برای کل موضوع از «انتقال به دسته» یا «ادغام» استفاده کنید')
  if (numbers.length > 200) throw new RuleError('حداکثر ۲۰۰ پیام در هر انتقال')
  return numbers
}

// ------------------------------------------------------------------ reports

/** Last `days` Tehran-local days (oldest first) as YYYY-MM-DD keys. */
export function dayKeys(days: number, now = new Date()): string[] {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' })
  return Array.from({ length: days }, (_, i) => fmt.format(new Date(now.getTime() - (days - 1 - i) * 86_400_000)))
}

export const tehranDay = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
