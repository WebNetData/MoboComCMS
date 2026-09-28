/**
 * Community (social network) rules: post and comment validation, safe text
 * rendering with links, @mentions and #hashtags, reports and feed merging.
 * Pure functions.
 */

import { toPublicPath } from '@/shared/routing/aliases'

export class CommunityError extends Error {
  constructor(message: string, readonly status = 400, readonly code = 'INVALID') { super(message) }
}

export type CommunitySettings = { postsEnabled: boolean; imagesEnabled: boolean; maxPostLength: number; minAccountDays: number; followersOnlyAllowed: boolean }
export const DEFAULT_COMMUNITY_SETTINGS: CommunitySettings = { postsEnabled: true, imagesEnabled: true, maxPostLength: 2000, minAccountDays: 0, followersOnlyAllowed: true }

export function normalizeCommunitySettings(raw: Record<string, unknown>): CommunitySettings {
  const n = (value: unknown, min: number, max: number, fallback: number) => { const v = Number(value); return Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback }
  return {
    postsEnabled: raw['posts.enabled'] !== false,
    imagesEnabled: raw['posts.images'] !== false,
    maxPostLength: n(raw['posts.max-length'], 140, 10000, DEFAULT_COMMUNITY_SETTINGS.maxPostLength),
    minAccountDays: n(raw['posts.min-account-days'], 0, 365, 0),
    followersOnlyAllowed: raw['posts.followers-only'] !== false,
  }
}

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f‪-‮⁦-⁩]/g

/** Post/comment text: control characters out, at most two blank lines in a row, bounded. */
export function cleanBody(value: unknown, max: number): string {
  return String(value ?? '').replace(CONTROL, '').replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, max)
}

export function validatePost(input: { content: unknown; images?: unknown; visibility?: unknown }, settings: CommunitySettings) {
  const content = cleanBody(input.content, settings.maxPostLength + 1)
  if (content.length > settings.maxPostLength) throw new CommunityError(`متن پست حداکثر ${settings.maxPostLength.toLocaleString('fa-IR')} نویسه است`)
  const images = normalizeImages(input.images)
  if (images.length && !settings.imagesEnabled) throw new CommunityError('ارسال تصویر در پست‌ها غیرفعال است')
  if (!content && !images.length) throw new CommunityError('متن یا تصویری برای پست بنویسید')
  const visibility = input.visibility === 'FOLLOWERS' ? 'FOLLOWERS' : 'PUBLIC'
  if (visibility === 'FOLLOWERS' && !settings.followersOnlyAllowed) throw new CommunityError('پست فقط برای دنبال‌کنندگان غیرفعال است')
  return { content, images, visibility }
}

export function validateComment(value: unknown): string {
  const content = cleanBody(value, 1001)
  if (!content) throw new CommunityError('متن دیدگاه را بنویسید')
  if (content.length > 1000) throw new CommunityError('دیدگاه حداکثر ۱۰۰۰ نویسه است')
  return content
}

/** Up to four images uploaded through the profile media endpoint. */
export function normalizeImages(input: unknown): string[] {
  const list = typeof input === 'string' ? (() => { try { return JSON.parse(input) } catch { return [] } })() : input
  if (!Array.isArray(list)) return []
  const out: string[] = []
  for (const raw of list) {
    const path = String(raw || '').trim()
    if (!path) continue
    if (!/^\/api\/profile\/media\/[0-9a-f-]{36}\.(png|jpg|webp)$/.test(path)) throw new CommunityError('تصویر پست معتبر نیست')
    if (!out.includes(path)) out.push(path)
  }
  if (out.length > 4) throw new CommunityError('حداکثر چهار تصویر برای هر پست')
  return out
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!))

const TOKEN = /(https?:\/\/[^\s<>"'`]+[^\s<>"'`.,;:!?)\]}،؛])|(^|[^\w@])@([a-z0-9_]{3,20})\b|(^|[^\p{L}\p{N}_&#])#([\p{L}\p{N}_]{2,40})/giu

/** Plain text → safe HTML: links (nofollow, new tab), @mentions to profiles, #hashtags to the feed, line breaks. */
export function renderBody(text: string): string {
  let html = ''
  let last = 0
  for (const match of text.matchAll(TOKEN)) {
    const index = match.index ?? 0
    html += escapeHtml(text.slice(last, index))
    if (match[1]) {
      const url = match[1]
      html += `<a href="${escapeHtml(url)}" rel="nofollow ugc noopener noreferrer" target="_blank">${escapeHtml(url.replace(/^https?:\/\//, '').slice(0, 60))}${url.length > 70 ? '…' : ''}</a>`
    } else if (match[3]) {
      html += `${escapeHtml(match[2])}<a href="${toPublicPath(`/u/${match[3].toLowerCase()}`)}" class="cm-mention">@${escapeHtml(match[3])}</a>`
    } else if (match[5]) {
      html += `${escapeHtml(match[4])}<a href="${toPublicPath(`/feed?tag=${encodeURIComponent(match[5].toLowerCase())}`)}" class="cm-tag">#${escapeHtml(match[5])}</a>`
    }
    last = index + match[0].length
  }
  html += escapeHtml(text.slice(last))
  return html.replace(/\n/g, '<br>')
}

export function mentionsIn(text: string): string[] {
  return [...new Set([...text.matchAll(/(^|[^\w@])@([a-z0-9_]{3,20})\b/gi)].map((m) => m[2].toLowerCase()))].slice(0, 10)
}

export function hashtagsIn(text: string): string[] {
  return [...new Set([...text.matchAll(/(^|[^\p{L}\p{N}_&#])#([\p{L}\p{N}_]{2,40})/gu)].map((m) => m[2].toLowerCase()))].slice(0, 10)
}

export function normalizeTag(value: unknown): string {
  const tag = String(value ?? '').trim().replace(/^#/, '').toLowerCase()
  return /^[\p{L}\p{N}_]{2,40}$/u.test(tag) ? tag : ''
}

export const REPORT_REASONS = { SPAM: 'هرزنامه یا تبلیغ', ABUSE: 'توهین یا آزار', INAPPROPRIATE: 'محتوای نامناسب', COPYRIGHT: 'نقض حق نشر', OTHER: 'دلیل دیگر' } as const
export type ReportReason = keyof typeof REPORT_REASONS

export function normalizeReason(value: unknown): ReportReason {
  const reason = String(value || '').toUpperCase()
  if (!(reason in REPORT_REASONS)) throw new CommunityError('دلیل گزارش را انتخاب کنید')
  return reason as ReportReason
}

/** Posts are editable for 30 minutes after publishing. */
export const EDIT_WINDOW_MS = 30 * 60_000
export function canEdit(createdAt: Date, now = new Date()): boolean {
  return now.getTime() - createdAt.getTime() <= EDIT_WINDOW_MS
}

export type ActivityEntry = { key: string; at: Date }

/** Newest first across sources, de-duplicated by key, cut at `limit`. */
export function mergeActivity<T extends ActivityEntry>(lists: T[][], limit: number): T[] {
  const seen = new Set<string>()
  return lists.flat().sort((a, b) => b.at.getTime() - a.at.getTime()).filter((entry) => (seen.has(entry.key) ? false : (seen.add(entry.key), true))).slice(0, limit)
}

/** Cursor for "older than" pagination: an ISO time, or null. */
export function parseCursor(value: unknown): Date | null {
  const raw = String(value || '')
  if (!raw) return null
  const at = new Date(raw)
  return Number.isNaN(at.getTime()) ? null : at
}
