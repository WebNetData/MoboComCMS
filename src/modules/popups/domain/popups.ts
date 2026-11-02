// Announcement popups: what a popup says and looks like, who sees it, and how often. Pure, shared by the server and the browser.
import { isSiteGroupKey } from '@/modules/account/domain/site-groups'

export const POPUP_KINDS = [
  { id: 'NOTICE', label: 'اطلاعیه', icon: 'bell' },
  { id: 'NEWS', label: 'خبر مهم', icon: 'megaphone' },
  { id: 'WARNING', label: 'هشدار', icon: 'flag' },
  { id: 'OFFER', label: 'پیشنهاد ویژه', icon: 'gift' },
] as const
export const POPUP_DESIGNS = [
  { id: 'seal', label: 'مهر', hint: 'نشان بزرگ بالای متن' },
  { id: 'cover', label: 'تصویر بالا', hint: 'تصویر تمام‌عرض بالای متن' },
  { id: 'split', label: 'دو ستونه', hint: 'تصویر کنار متن' },
  { id: 'spotlight', label: 'زمینهٔ رنگی', hint: 'پنجرهٔ تمام‌رنگ با متن روشن' },
] as const
export const POPUP_EFFECTS = [
  { id: 'rise', label: 'بالا آمدن' },
  { id: 'zoom', label: 'بزرگ‌شدن' },
  { id: 'drop', label: 'پایین آمدن' },
  { id: 'slide', label: 'ورود از کنار' },
  { id: 'flip', label: 'چرخش سه‌بعدی' },
] as const
export const POPUP_POSITIONS = [
  { id: 'center', label: 'وسط صفحه' },
  { id: 'bottom', label: 'پایین صفحه' },
  { id: 'corner', label: 'گوشهٔ صفحه، بدون توقف کار کاربر' },
] as const
export const POPUP_AUDIENCES = [
  { id: 'ALL', label: 'همه' },
  { id: 'GUESTS', label: 'فقط مهمان‌ها' },
  { id: 'MEMBERS', label: 'همهٔ کاربران عضو' },
  { id: 'GROUPS', label: 'گروه‌های کاربری انتخابی' },
  { id: 'SECTION_MANAGERS', label: 'مدیران بخش‌های انتخابی' },
  { id: 'ALL_MANAGERS', label: 'همهٔ مدیران' },
] as const
export const POPUP_REPEATS = [
  { hours: 0, label: 'فقط یک بار' },
  { hours: 24, label: 'هر ۲۴ ساعت' },
  { hours: 48, label: 'هر ۴۸ ساعت' },
  { hours: 72, label: 'هر ۳ روز' },
  { hours: 168, label: 'هر هفته' },
] as const
export const POPUP_STATUSES = ['DRAFT', 'ACTIVE', 'PAUSED'] as const
export const POPUP_STATUS_LABEL: Record<string, string> = { DRAFT: 'پیش‌نویس', ACTIVE: 'فعال', PAUSED: 'متوقف' }

export type PopupStatus = (typeof POPUP_STATUSES)[number]
export type PopupAudience = (typeof POPUP_AUDIENCES)[number]['id']

export type PopupInput = {
  title: string; body: string; kind: string; design: string; effect: string; position: string; image: string
  actionLabel: string; actionUrl: string; closeLabel: string; mustConfirm: boolean
  status: PopupStatus; startsAt: Date | null; endsAt: Date | null
  audience: PopupAudience; groupIds: string[]; sections: string[]
  repeatHours: number; maxViews: number; delaySeconds: number; pages: string; priority: number
}

/** The face of a popup, as the visitor's browser receives it. */
export type PopupFace = Pick<PopupInput, 'title' | 'body' | 'kind' | 'design' | 'effect' | 'position' | 'image' | 'actionLabel' | 'actionUrl' | 'closeLabel' | 'mustConfirm'>

/** What the browser needs to place and repeat a popup. Audience is decided on the server and never sent. */
export type ServedPopup = PopupFace & { id: number; revision: number; repeatHours: number; maxViews: number; delaySeconds: number; pages: string; audience: PopupAudience }

export type PopupViewer = { signedIn: boolean; staff: boolean; sections: readonly string[]; groupIds: readonly string[] }
export type PopupRule = { audience: string; groupIds: readonly string[]; sections: readonly string[] }
export type PopupSeen = { views: number; lastAt: number }

export class PopupError extends Error {}

const line = (value: unknown, max: number) => String(value ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max)
const count = (value: unknown, min: number, max: number) => { const n = Math.trunc(Number(value)); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : min }
const oneOf = (value: unknown, list: readonly { id: string }[], fallback: string) => (list.some((item) => item.id === value) ? String(value) : fallback)
const date = (value: unknown) => { if (!value) return null; const parsed = new Date(String(value)); if (Number.isNaN(parsed.getTime())) throw new PopupError('تاریخ معتبر نیست'); return parsed }

/** A link is an address on this site or an https page; nothing a browser would run. */
export function safeLink(value: unknown) {
  const link = line(value, 500)
  if (!link) return ''
  if (/^\/(?![/\\])/.test(link)) return link
  try { if (new URL(link).protocol === 'https:') return link } catch { /* refused below */ }
  throw new PopupError('نشانی باید با / یا https شروع شود')
}

const safeImage = (value: unknown) => {
  const image = line(value, 500)
  if (!image) return ''
  if (/^\/(?![/\\])/.test(image) || /^https:\/\//.test(image)) return image
  throw new PopupError('نشانی تصویر معتبر نیست')
}

export function normalizePopup(raw: Record<string, unknown>, sectionIds: readonly string[]): PopupInput {
  const title = line(raw.title, 120)
  if (title.length < 2) throw new PopupError('عنوان را بنویسید')
  const body = String(raw.body ?? '').replace(/\r\n/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f]/g, ' ').trim().slice(0, 1200)
  const audience = oneOf(raw.audience, POPUP_AUDIENCES, 'ALL') as PopupAudience
  const groupIds = audience === 'GROUPS' ? [...new Set((Array.isArray(raw.groupIds) ? raw.groupIds : []).filter(isSiteGroupKey))] : []
  const sections = audience === 'SECTION_MANAGERS' ? [...new Set((Array.isArray(raw.sections) ? raw.sections : []).map(String).filter((id) => sectionIds.includes(id)))] : []
  if (audience === 'GROUPS' && !groupIds.length) throw new PopupError('دست‌کم یک گروه کاربری انتخاب کنید')
  if (audience === 'SECTION_MANAGERS' && !sections.length) throw new PopupError('دست‌کم یک بخش انتخاب کنید')
  const startsAt = date(raw.startsAt), endsAt = date(raw.endsAt)
  if (startsAt && endsAt && endsAt <= startsAt) throw new PopupError('پایان باید بعد از شروع باشد')
  const actionUrl = safeLink(raw.actionUrl), actionLabel = line(raw.actionLabel, 40)
  if (Boolean(actionUrl) !== Boolean(actionLabel)) throw new PopupError('برای دکمه هم متن و هم نشانی لازم است')
  const design = oneOf(raw.design, POPUP_DESIGNS, 'seal'), image = safeImage(raw.image)
  if ((design === 'cover' || design === 'split') && !image) throw new PopupError('این طرح به تصویر نیاز دارد')
  return {
    title, body, kind: oneOf(raw.kind, POPUP_KINDS, 'NOTICE'), design, effect: oneOf(raw.effect, POPUP_EFFECTS, 'rise'), position: oneOf(raw.position, POPUP_POSITIONS, 'center'),
    image, actionLabel, actionUrl, closeLabel: line(raw.closeLabel, 40), mustConfirm: raw.mustConfirm === true,
    status: (POPUP_STATUSES as readonly string[]).includes(String(raw.status)) ? raw.status as PopupStatus : 'DRAFT',
    startsAt, endsAt, audience, groupIds, sections,
    repeatHours: count(raw.repeatHours, 0, 8760), maxViews: count(raw.maxViews, 0, 100000), delaySeconds: count(raw.delaySeconds, 0, 120),
    pages: String(raw.pages ?? '').split(/\r?\n/).map((path) => line(path, 200)).filter((path) => path.startsWith('/')).slice(0, 30).join('\n'), priority: count(raw.priority, 0, 1000),
  }
}

export function parseIds<T>(raw: string): T[] {
  try { const list = JSON.parse(raw); return Array.isArray(list) ? list : [] } catch { return [] }
}

export function isLive(popup: { status: string; startsAt: Date | null; endsAt: Date | null }, now: Date) {
  return popup.status === 'ACTIVE' && (!popup.startsAt || popup.startsAt <= now) && (!popup.endsAt || popup.endsAt > now)
}

/** Whether this viewer is someone the popup was written for. */
export function matchesAudience(rule: PopupRule, viewer: PopupViewer) {
  switch (rule.audience) {
    case 'ALL': return true
    case 'GUESTS': return !viewer.signedIn
    case 'MEMBERS': return viewer.signedIn
    case 'GROUPS': return rule.groupIds.some((id) => viewer.groupIds.includes(id))
    case 'SECTION_MANAGERS': return viewer.staff && rule.sections.some((id) => viewer.sections.includes(id))
    case 'ALL_MANAGERS': return viewer.staff
    default: return false
  }
}

/** Whether the popup may appear again: never past its total, and only once its waiting time has passed. */
export function isDue(rule: { repeatHours: number; maxViews: number }, seen: PopupSeen | null | undefined, now: number) {
  if (!seen || seen.views <= 0) return true
  if (rule.maxViews > 0 && seen.views >= rule.maxViews) return false
  if (rule.repeatHours <= 0) return false
  return now - seen.lastAt >= rule.repeatHours * 3_600_000
}

// A popup must not stand between someone and finishing a payment, signing in or setting up the site.
const NEVER = [/^\/checkout/, /^\/cart/, /^\/payment/, /^\/invoice/, /^\/login/, /^\/register/, /^\/forgot-password/, /^\/reset-password/, /^\/welcome/, /^\/install/, /^\/builder-preview/, /^\/miniapp/, /^\/telegram/]

/** Managers read their popups in the panel; everyone else's popups stay on the site. */
export function fitsPage(popup: { pages: string; audience: string }, path: string) {
  if (NEVER.some((pattern) => pattern.test(path))) return false
  if (/^\/admin(\/|$)/.test(path) && popup.audience !== 'SECTION_MANAGERS' && popup.audience !== 'ALL_MANAGERS') return false
  const pages = popup.pages.split('\n').filter(Boolean)
  return !pages.length || pages.some((page) => (page === '/' ? path === '/' : path === page || path.startsWith(page.endsWith('/') ? page : `${page}/`)))
}

export function frequencyLabel(rule: { repeatHours: number; maxViews: number }) {
  const fa = (n: number) => n.toLocaleString('fa-IR')
  const every = POPUP_REPEATS.find((item) => item.hours === rule.repeatHours)?.label || `هر ${fa(rule.repeatHours)} ساعت`
  if (rule.repeatHours <= 0 || rule.maxViews === 1) return 'فقط یک بار'
  return rule.maxViews > 0 ? `${every}، در کل ${fa(rule.maxViews)} بار` : every
}
