/**
 * The unified public profile of a member: username rules, social links,
 * privacy choices and who may see or message whom. Pure functions.
 */

export class ProfileError extends Error {
  constructor(message: string, readonly status = 400, readonly code = 'INVALID') { super(message) }
}

export const USERNAME = /^[a-z0-9_]{3,20}$/
const RESERVED_USERNAMES = new Set(['admin', 'administrator', 'moderator', 'system', 'mobocom', 'support', 'staff', 'everyone', 'me', 'edit', 'settings', 'null', 'undefined'])

export function normalizeUsername(value: unknown): string {
  const name = String(value ?? '').trim().replace(/^@/, '').toLowerCase()
  if (!USERNAME.test(name)) throw new ProfileError('نام کاربری ۳ تا ۲۰ حرف انگلیسی کوچک، عدد یا _ است')
  if (RESERVED_USERNAMES.has(name)) throw new ProfileError('این نام کاربری رزرو شده است')
  return name
}

/** A starting username from the email or display name (callers add a numeric suffix on collision). */
export function usernameSeed(input: { email: string; name?: string }): string {
  const local = String(input.email || '').split('@')[0].toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '')
  const fromName = String(input.name || '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '')
  const base = (/^98\d{10}$/.test(local) ? '' : local) || fromName || 'user'
  const trimmed = base.slice(0, 16)
  const seed = trimmed.length >= 3 ? trimmed : `${trimmed}user`.slice(0, 16)
  return RESERVED_USERNAMES.has(seed) ? `${seed}_1` : seed
}

/** Strips control and bidi-override characters, trims and bounds a text field. */
export function cleanText(value: unknown, max: number): string {
  return String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f‪-‮⁦-⁩]/g, '').trim().slice(0, max)
}

// ------------------------------------------------------------------ social links

export const LINK_KINDS = {
  telegram: { label: 'تلگرام', hosts: ['t.me', 'telegram.me'] },
  instagram: { label: 'اینستاگرام', hosts: ['instagram.com', 'www.instagram.com'] },
  x: { label: 'ایکس (توییتر)', hosts: ['x.com', 'twitter.com', 'www.x.com', 'www.twitter.com'] },
  youtube: { label: 'یوتیوب', hosts: ['youtube.com', 'www.youtube.com', 'youtu.be'] },
  aparat: { label: 'آپارات', hosts: ['aparat.com', 'www.aparat.com'] },
  github: { label: 'گیت‌هاب', hosts: ['github.com', 'www.github.com'] },
  linkedin: { label: 'لینکدین', hosts: ['linkedin.com', 'www.linkedin.com'] },
  twitch: { label: 'توییچ', hosts: ['twitch.tv', 'www.twitch.tv'] },
  steam: { label: 'استیم', hosts: ['steamcommunity.com'] },
} as const
export type LinkKind = keyof typeof LINK_KINDS
export type ProfileLink = { kind: LinkKind; url: string }

/** Social accounts: one per network, https only, host must belong to the network. */
export function normalizeLinks(input: unknown): ProfileLink[] {
  const list = Array.isArray(input) ? input : []
  const out: ProfileLink[] = []
  for (const raw of list.slice(0, 12)) {
    if (!raw || typeof raw !== 'object') continue
    const kind = String((raw as Record<string, unknown>).kind || '') as LinkKind
    const value = cleanText((raw as Record<string, unknown>).url, 300)
    if (!value) continue
    if (!(kind in LINK_KINDS)) throw new ProfileError('شبکهٔ اجتماعی نامعتبر است')
    if (out.some((link) => link.kind === kind)) continue
    let url: URL
    try { url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`) } catch { throw new ProfileError(`نشانی ${LINK_KINDS[kind].label} معتبر نیست`) }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new ProfileError(`نشانی ${LINK_KINDS[kind].label} معتبر نیست`)
    if (!(LINK_KINDS[kind].hosts as readonly string[]).includes(url.hostname.toLowerCase())) throw new ProfileError(`نشانی ${LINK_KINDS[kind].label} باید از دامنهٔ ${LINK_KINDS[kind].hosts[0]} باشد`)
    url.protocol = 'https:'
    out.push({ kind, url: url.toString() })
  }
  return out
}

export function normalizeWebsite(value: unknown): string {
  const website = cleanText(value, 200)
  if (!website) return ''
  let url: URL
  try { url = new URL(website) } catch { throw new ProfileError('نشانی وب‌سایت معتبر نیست') }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new ProfileError('نشانی وب‌سایت باید با http یا https شروع شود')
  return url.toString()
}

/** Profile images are uploaded through the profile (or legacy forum) media endpoint. */
export function mediaPath(value: unknown): string {
  const path = String(value ?? '').trim()
  if (!path) return ''
  if (/^\/api\/(profile|forum)\/media\/[0-9a-f-]{36}\.(png|jpg|webp)$/.test(path)) return path
  throw new ProfileError('تصویر معتبر نیست')
}

// ------------------------------------------------------------------ privacy

export const PROFILE_VISIBILITY = { PUBLIC: 'همه', MEMBERS: 'فقط کاربران واردشده', FOLLOWERS: 'فقط دنبال‌کنندگان', PRIVATE: 'فقط خودم' } as const
export const MESSAGE_POLICY = { EVERYONE: 'همه', FOLLOWING: 'کسانی که دنبالشان می‌کنم', NOBODY: 'هیچ‌کس' } as const
export type Privacy = {
  profile: keyof typeof PROFILE_VISIBILITY
  messages: keyof typeof MESSAGE_POLICY
  showActivity: boolean
  showLibrary: boolean
  showFavorites: boolean
  showFollows: boolean
  showOnline: boolean
}
export const DEFAULT_PRIVACY: Privacy = { profile: 'PUBLIC', messages: 'EVERYONE', showActivity: true, showLibrary: true, showFavorites: false, showFollows: true, showOnline: true }

export function normalizePrivacy(input: unknown): Privacy {
  let raw: Record<string, unknown> = {}
  if (typeof input === 'string') { try { raw = JSON.parse(input) || {} } catch { raw = {} } } else if (input && typeof input === 'object') raw = input as Record<string, unknown>
  const pick = <T extends string>(value: unknown, allowed: Record<T, string>, fallback: T): T => (typeof value === 'string' && value in allowed ? value as T : fallback)
  const flag = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback)
  return {
    profile: pick(raw.profile, PROFILE_VISIBILITY, DEFAULT_PRIVACY.profile),
    messages: pick(raw.messages, MESSAGE_POLICY, DEFAULT_PRIVACY.messages),
    showActivity: flag(raw.showActivity, DEFAULT_PRIVACY.showActivity),
    showLibrary: flag(raw.showLibrary, DEFAULT_PRIVACY.showLibrary),
    showFavorites: flag(raw.showFavorites, DEFAULT_PRIVACY.showFavorites),
    showFollows: flag(raw.showFollows, DEFAULT_PRIVACY.showFollows),
    showOnline: flag(raw.showOnline, DEFAULT_PRIVACY.showOnline),
  }
}

export type Relation = { self: boolean; staff: boolean; signedIn: boolean; following: boolean; followedBy: boolean; blocked: boolean; blockedBy: boolean }

/** Whether the viewer may see the profile's content (the header card is always shown, like other networks). */
export function canViewProfile(privacy: Privacy, relation: Relation): boolean {
  if (relation.self || relation.staff) return true
  if (relation.blockedBy) return false
  if (privacy.profile === 'PUBLIC') return true
  if (privacy.profile === 'MEMBERS') return relation.signedIn
  if (privacy.profile === 'FOLLOWERS') return relation.following
  return false
}

/** Whether the viewer may start a private conversation with the profile owner. */
export function canMessage(privacy: Privacy, relation: Relation): boolean {
  if (relation.self || !relation.signedIn) return false
  if (relation.staff) return true
  if (relation.blocked || relation.blockedBy) return false
  if (privacy.messages === 'EVERYONE') return true
  if (privacy.messages === 'FOLLOWING') return relation.followedBy
  return false
}

export function canFollow(relation: Relation): boolean {
  return relation.signedIn && !relation.self && !relation.blocked && !relation.blockedBy
}
