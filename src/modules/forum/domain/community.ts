/**
 * Community rules (pure): forum settings, group-based category permissions,
 * trust levels, badge rules, usernames, tags, reactions and flags.
 */

// ------------------------------------------------------------------ settings

export interface TrustRequirement { daysVisited: number; topicsEntered: number; postCount: number; likesGiven: number; likesReceived: number }

export interface ForumSettings {
  /** Minimum trust level to embed images / post more than `newUserMaxLinks` links. */
  imagesMinTrust: number
  linksMinTrust: number
  newUserMaxLinks: number
  /** Topics a trust level 0 user may start per day. */
  newUserTopicsPerDay: number
  editWindowHours: number
  /** Flag weight that hides a post until staff review it. */
  flagHideWeight: number
  maxTagsPerTopic: number
  /** Only staff may create new tags when false. */
  membersCreateTags: boolean
  reactions: string[]
  trust: { 1: TrustRequirement; 2: TrustRequirement; 3: TrustRequirement }
}

export const DEFAULT_FORUM_SETTINGS: ForumSettings = {
  imagesMinTrust: 1,
  linksMinTrust: 1,
  newUserMaxLinks: 2,
  newUserTopicsPerDay: 3,
  editWindowHours: 24,
  flagHideWeight: 3,
  maxTagsPerTopic: 5,
  membersCreateTags: true,
  reactions: ['heart', '+1', 'laughing', 'open_mouth', 'cry', 'clap'],
  trust: {
    1: { daysVisited: 1, topicsEntered: 5, postCount: 0, likesGiven: 0, likesReceived: 0 },
    2: { daysVisited: 10, topicsEntered: 20, postCount: 3, likesGiven: 1, likesReceived: 1 },
    3: { daysVisited: 40, topicsEntered: 60, postCount: 10, likesGiven: 30, likesReceived: 20 },
  },
}

export const REACTION_EMOJI: Record<string, string> = { heart: '❤️', '+1': '👍', laughing: '😆', open_mouth: '😮', cry: '😢', clap: '👏', fire: '🔥', tada: '🎉', thinking: '🤔', eyes: '👀' }

const int = (value: unknown, min: number, max: number, fallback: number) => {
  const number = Number(value)
  return Number.isInteger(number) ? Math.min(max, Math.max(min, number)) : fallback
}

export function normalizeForumSettings(input: Record<string, any> = {}): ForumSettings {
  const d = DEFAULT_FORUM_SETTINGS
  const trust = (level: 1 | 2 | 3): TrustRequirement => {
    const raw = input.trust?.[level] || {}
    const base = d.trust[level]
    return {
      daysVisited: int(raw.daysVisited, 0, 3650, base.daysVisited), topicsEntered: int(raw.topicsEntered, 0, 100000, base.topicsEntered),
      postCount: int(raw.postCount, 0, 100000, base.postCount), likesGiven: int(raw.likesGiven, 0, 100000, base.likesGiven), likesReceived: int(raw.likesReceived, 0, 100000, base.likesReceived),
    }
  }
  const reactions = Array.isArray(input.reactions) ? [...new Set(input.reactions.map(String).filter((name) => name in REACTION_EMOJI))].slice(0, 8) : d.reactions
  return {
    imagesMinTrust: int(input.imagesMinTrust, 0, 4, d.imagesMinTrust),
    linksMinTrust: int(input.linksMinTrust, 0, 4, d.linksMinTrust),
    newUserMaxLinks: int(input.newUserMaxLinks, 0, 50, d.newUserMaxLinks),
    newUserTopicsPerDay: int(input.newUserTopicsPerDay, 0, 100, d.newUserTopicsPerDay),
    editWindowHours: int(input.editWindowHours, 0, 24 * 365, d.editWindowHours),
    flagHideWeight: int(input.flagHideWeight, 1, 50, d.flagHideWeight),
    maxTagsPerTopic: int(input.maxTagsPerTopic, 0, 10, d.maxTagsPerTopic),
    membersCreateTags: input.membersCreateTags === undefined ? d.membersCreateTags : input.membersCreateTags === true,
    reactions: reactions.includes('heart') ? reactions : ['heart', ...reactions].slice(0, 8),
    trust: { 1: trust(1), 2: trust(2), 3: trust(3) },
  }
}

// ------------------------------------------------------------------ viewer & permissions

export type PermissionLevel = 'SEE' | 'REPLY' | 'CREATE'
const RANK: Record<PermissionLevel, number> = { SEE: 1, REPLY: 2, CREATE: 3 }
export const PERMISSION_LEVELS: PermissionLevel[] = ['SEE', 'REPLY', 'CREATE']
export const normalizeLevel = (value: unknown): PermissionLevel => (value === 'SEE' || value === 'REPLY' ? value : 'CREATE')

export interface Viewer {
  userId: number | null
  /** Group ids the viewer belongs to, including automatic ones (everyone, vip, staff, trust levels). */
  groupIds: number[]
  trustLevel: number
  moderator: boolean
  member: boolean
  silenced: boolean
  suspended: boolean
}

export const GUEST: Viewer = { userId: null, groupIds: [], trustLevel: 0, moderator: false, member: false, silenced: false, suspended: false }

export interface CategoryAccess { see: boolean; reply: boolean; create: boolean }

/**
 * Category access. A category with permission rows is restricted to those
 * groups; without rows the legacy rules apply (MEMBERS = VIP only, locked =
 * staff start topics). Staff see and do everything; silenced or suspended
 * users can read but not post.
 */
export function categoryAccess(category: { access: string; locked: boolean; permissions?: { groupId: number; level: string }[] }, viewer: Viewer): CategoryAccess {
  if (viewer.moderator) return { see: true, reply: true, create: true }
  let see: boolean
  let reply: boolean
  let create: boolean
  if (category.permissions && category.permissions.length) {
    const rank = Math.max(0, ...category.permissions.filter((row) => viewer.groupIds.includes(row.groupId)).map((row) => RANK[normalizeLevel(row.level)]))
    see = rank >= 1
    reply = rank >= 2
    create = rank >= 3 && !category.locked
  } else {
    see = category.access !== 'MEMBERS' || viewer.member
    reply = see
    create = see && !category.locked
  }
  const canPost = !!viewer.userId && !viewer.silenced && !viewer.suspended
  return { see, reply: reply && canPost, create: create && canPost }
}

/** Automatic group keys a user belongs to. */
export function automaticGroups(input: { loggedIn: boolean; trustLevel: number; member: boolean; staff: boolean }): string[] {
  const keys = ['everyone']
  if (!input.loggedIn) return keys
  for (let level = 0; level <= Math.min(4, input.trustLevel); level++) keys.push(`trust_level_${level}`)
  if (input.member) keys.push('vip')
  if (input.staff) keys.push('staff')
  return keys
}

export const canEditPost = (post: { userId: number; createdAt: Date }, viewer: Viewer, editWindowHours: number, now = Date.now()) =>
  viewer.moderator || (!!viewer.userId && !viewer.silenced && !viewer.suspended && post.userId === viewer.userId && now - new Date(post.createdAt).getTime() < editWindowHours * 3_600_000)

// ------------------------------------------------------------------ trust levels

export interface CommunityStats { daysVisited: number; topicsEntered: number; postCount: number; topicCount: number; likesGiven: number; likesReceived: number; solvedCount: number }

const meets = (stats: CommunityStats, need: TrustRequirement) =>
  stats.daysVisited >= need.daysVisited && stats.topicsEntered >= need.topicsEntered && stats.postCount >= need.postCount && stats.likesGiven >= need.likesGiven && stats.likesReceived >= need.likesReceived

/** Automatic promotion only (never demotes); level 4 is granted by staff. */
export function computeTrustLevel(current: number, stats: CommunityStats, settings: ForumSettings, locked = false): number {
  if (locked || current >= 3) return current
  let level = current
  for (const next of [1, 2, 3] as const) if (level === next - 1 && meets(stats, settings.trust[next])) level = next
  return level
}

export const TRUST_NAMES = ['تازه‌وارد', 'کاربر پایه', 'عضو فعال', 'کاربر همیشگی', 'رهبر جامعه']

export interface PostLimits { images: boolean; links: boolean; maxLinks: number }
export function postLimits(trustLevel: number, settings: ForumSettings, moderator = false): PostLimits {
  if (moderator) return { images: true, links: true, maxLinks: Infinity }
  return {
    images: trustLevel >= settings.imagesMinTrust,
    links: true,
    maxLinks: trustLevel >= settings.linksMinTrust ? Infinity : settings.newUserMaxLinks,
  }
}

// ------------------------------------------------------------------ badges

export interface BadgeFacts extends CommunityStats { trustLevel: number; bestPostLikes: number; hasAvatar: boolean; hasBio: boolean; memberDays: number }

/** Automatic badge rules satisfied by these facts. */
export function earnedBadgeRules(facts: BadgeFacts): string[] {
  const rules: [string, boolean][] = [
    ['first_topic', facts.topicCount >= 1],
    ['first_reply', facts.postCount - facts.topicCount >= 1],
    ['first_like', facts.likesGiven >= 1],
    ['first_like_received', facts.likesReceived >= 1],
    ['autobiographer', facts.hasAvatar && facts.hasBio],
    ['nice_post', facts.bestPostLikes >= 10],
    ['good_post', facts.bestPostLikes >= 25],
    ['great_post', facts.bestPostLikes >= 50],
    ['first_solution', facts.solvedCount >= 1],
    ['solver', facts.solvedCount >= 10],
    ['trust_level_1', facts.trustLevel >= 1],
    ['trust_level_2', facts.trustLevel >= 2],
    ['trust_level_3', facts.trustLevel >= 3],
    ['trust_level_4', facts.trustLevel >= 4],
    ['anniversary', facts.memberDays >= 365 && facts.postCount >= 1],
  ]
  return rules.filter(([, ok]) => ok).map(([rule]) => rule)
}

export const BADGE_RULES = ['first_topic', 'first_reply', 'first_like', 'first_like_received', 'autobiographer', 'nice_post', 'good_post', 'great_post', 'first_solution', 'solver', 'trust_level_1', 'trust_level_2', 'trust_level_3', 'trust_level_4', 'anniversary']

// ------------------------------------------------------------------ usernames, tags, flags

export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/
export class CommunityError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

export function normalizeUsername(value: unknown): string {
  const name = String(value ?? '').trim().replace(/^@/, '').toLowerCase()
  if (!USERNAME_PATTERN.test(name)) throw new CommunityError('نام کاربری ۳ تا ۲۰ حرف انگلیسی کوچک، عدد یا _ است')
  if (['admin', 'administrator', 'moderator', 'system', 'mobocom', 'support', 'staff', 'everyone', 'me'].includes(name)) throw new CommunityError('این نام کاربری رزرو شده است')
  return name
}

/** A starting username from the email or display name (callers add a numeric suffix on collision). */
export function usernameSeed(input: { email: string; name?: string }): string {
  const local = String(input.email || '').split('@')[0].toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '')
  const fromName = String(input.name || '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '')
  const base = (/^98\d{10}$/.test(local) ? '' : local) || fromName || 'user'
  const trimmed = base.slice(0, 16)
  return trimmed.length >= 3 ? trimmed : `${trimmed}user`.slice(0, 16)
}

/** Tags: lowercase words (Persian allowed), dashes for spaces, unique, bounded. */
export function normalizeTags(value: unknown, max: number): string[] {
  const raw = Array.isArray(value) ? value : String(value ?? '').split(/[,،\s]+/)
  const tags = raw.map((tag) => String(tag).trim().toLowerCase().replace(/^#/, '').replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 30)).filter((tag) => tag.length >= 2)
  return [...new Set(tags)].slice(0, max)
}

export const FLAG_REASONS = [
  { id: 'SPAM', label: 'هرزنامه یا تبلیغ' },
  { id: 'INAPPROPRIATE', label: 'توهین‌آمیز یا نامناسب' },
  { id: 'OFF_TOPIC', label: 'خارج از موضوع' },
  { id: 'OTHER', label: 'دلیل دیگر (توضیح دهید)' },
] as const
export const normalizeFlagReason = (value: unknown) => (FLAG_REASONS.some((reason) => reason.id === value) ? String(value) : 'OTHER')
/** Trusted members' flags count more (Discourse-style). */
export const flagWeight = (trustLevel: number, moderator: boolean) => (moderator ? 10 : trustLevel >= 3 ? 2 : 1)

export const NOTIFICATION_LEVELS = ['WATCHING', 'TRACKING', 'NORMAL', 'MUTED'] as const
export type NotificationLevel = typeof NOTIFICATION_LEVELS[number]
export const normalizeNotificationLevel = (value: unknown): NotificationLevel => (NOTIFICATION_LEVELS as readonly string[]).includes(String(value)) ? value as NotificationLevel : 'NORMAL'

export function groupSlug(value: unknown): string {
  const slug = String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(slug)) throw new CommunityError('نشانی گروه فقط حروف انگلیسی کوچک، عدد و خط تیره')
  return slug
}

/** "۵ دقیقه پیش" style relative time (Persian). */
export function relativeTime(date: Date | string, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - new Date(date).getTime()) / 1000))
  const fa = (n: number) => n.toLocaleString('fa-IR')
  if (seconds < 60) return 'همین حالا'
  if (seconds < 3600) return `${fa(Math.floor(seconds / 60))} دقیقه`
  if (seconds < 86400) return `${fa(Math.floor(seconds / 3600))} ساعت`
  if (seconds < 30 * 86400) return `${fa(Math.floor(seconds / 86400))} روز`
  if (seconds < 365 * 86400) return `${fa(Math.floor(seconds / (30 * 86400)))} ماه`
  return `${fa(Math.floor(seconds / (365 * 86400)))} سال`
}
