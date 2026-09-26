/**
 * Forum rules shared by pages, APIs and tests. Posts are stored as plain text
 * and rendered through `renderPostText`, so users can never inject markup:
 * only line breaks, `> quotes` and http(s) links become HTML.
 */

export const FORUM_PAGE_SIZE = 20
export const THREAD_PAGE_SIZE = 25
export const TITLE_MIN = 5
export const TITLE_MAX = 150
export const POST_MIN = 2
export const POST_MAX = 20_000
/** Authors may edit their own post for this long; moderators always. */
export const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000

export class ForumError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

// Control characters (except tab/newline) and bidi overrides are stripped: they
// are invisible and can be used to disguise links or impersonate text.
const INVISIBLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/g

export function cleanTitle(value: unknown): string {
  const title = String(value ?? '').replace(INVISIBLE, '').replace(/\s+/g, ' ').trim()
  if (title.length < TITLE_MIN) throw new ForumError(`عنوان باید دست‌کم ${TITLE_MIN} حرف باشد`)
  if (title.length > TITLE_MAX) throw new ForumError(`عنوان حداکثر ${TITLE_MAX} حرف است`)
  return title
}

export function cleanContent(value: unknown): string {
  const text = String(value ?? '').replace(/\r\n?/g, '\n').replace(INVISIBLE, '').replace(/\n{4,}/g, '\n\n\n').trim()
  if (text.length < POST_MIN) throw new ForumError('متن پیام خیلی کوتاه است')
  if (text.length > POST_MAX) throw new ForumError(`متن پیام حداکثر ${POST_MAX.toLocaleString('fa-IR')} حرف است`)
  return text
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!))
const URL_PATTERN = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]}،؛]/gi

function linkify(escaped: string): string {
  return escaped.replace(URL_PATTERN, (url) => `<a href="${url}" target="_blank" rel="nofollow ugc noopener noreferrer">${url}</a>`)
}

/** Plain post text → safe HTML (paragraph-free; the container uses pre-wrap). */
export function renderPostText(text: string): string {
  const lines = String(text || '').split('\n')
  const out: string[] = []
  let quote: string[] = []
  const flush = () => { if (quote.length) { out.push(`<blockquote>${quote.join('\n')}</blockquote>`); quote = [] } }
  for (const line of lines) {
    const match = /^>\s?(.*)$/.exec(line)
    if (match) { quote.push(linkify(escapeHtml(match[1]))); continue }
    flush()
    out.push(linkify(escapeHtml(line)))
  }
  flush()
  return out.join('\n').replace(/\n?(<blockquote>)/g, '$1').replace(/(<\/blockquote>)\n?/g, '$1')
}

/** Short plain excerpt for listings and meta descriptions. */
export function excerpt(text: string, max = 160): string {
  const flat = String(text || '').replace(/^>.*$/gm, '').replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

export type BoardAccess = 'PUBLIC' | 'MEMBERS'
export type ForumActor = { userId: number | null; member: boolean; moderator: boolean }

export const canRead = (access: string, actor: ForumActor) => access !== 'MEMBERS' || actor.member || actor.moderator
export const canStartThread = (board: { access: string; locked: boolean }, actor: ForumActor) => !!actor.userId && canRead(board.access, actor) && (!board.locked || actor.moderator)
export const canReply = (thread: { locked: boolean; status: string }, board: { access: string }, actor: ForumActor) => !!actor.userId && canRead(board.access, actor) && thread.status === 'VISIBLE' && (!thread.locked || actor.moderator)
export const canEdit = (post: { userId: number; createdAt: Date }, actor: ForumActor, now = Date.now()) => actor.moderator || (!!actor.userId && post.userId === actor.userId && now - new Date(post.createdAt).getTime() < EDIT_WINDOW_MS)

export function boardSlug(value: unknown): string {
  const slug = String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(slug)) throw new ForumError('نشانی انجمن فقط حروف انگلیسی کوچک، عدد و خط تیره')
  return slug
}

export function pageCount(total: number, size: number) {
  return Math.max(1, Math.ceil(total / size))
}
