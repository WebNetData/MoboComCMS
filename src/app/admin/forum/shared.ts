import type { UserLevel } from '@/modules/forum/domain/community'
import type { ForumTeam } from './TeamTab'

// What the forum admin reads from /api/admin/forum, shared by its tabs.

export type Level = 'SEE' | 'REPLY' | 'CREATE'
export type Category = { id: number; parentId: number | null; slug: string; title: string; description: string; icon: string; color: string; access: string; locked: boolean; sortOrder: number; threadCount: number; postCount: number; permissions: { groupId: number; level: Level }[]; moderators: string[]; club: { id: number; slug: string; name: string; memberCount: number } | null }
export type Group = { id: number; slug: string; name: string; description: string; icon: string; color: string; title: string; automatic: string | null; visibility: string; joinMode: string; moderator: boolean; mentionable: boolean; memberCount: number; clubCategoryId: number | null }
export type Badge = { id: number; slug: string; name: string; description: string; icon: string; tier: string; rule: string; enabled: boolean; grantCount: number }
export type Author = { id: number; name: string; username: string }
export type Flag = { post: { id: number; number: number; excerpt: string; status: string; createdAt: string; thread: { id: number; title: string } }; author: Author; weight: number; flags: { reason: string; note: string; weight: number; createdAt: string; by: Author }[] }
export type Trust = { daysVisited: number; topicsEntered: number; postCount: number; likesGiven: number; likesReceived: number }
export type Settings = {
  imagesMinTrust: number; linksMinTrust: number; newUserMaxLinks: number; newUserTopicsPerDay: number; editWindowHours: number; flagHideWeight: number; maxTagsPerTopic: number; membersCreateTags: boolean
  reactions: string[]; reactionWeights: Record<string, number>; clubsEnabled: boolean; clubsMinTrust: number; clubsMaxOwned: number; levels: UserLevel[]; approveNewUserPosts: number
  messagesEnabled: boolean; messagesMinTrust: number; pollsMinTrust: number; watchedWords: { block: string[]; approve: string[]; censor: string[] }; trust: Record<'1' | '2' | '3', Trust>
}
export type Member = { userId: number; username: string; email: string; name: string; trustLevel: number; trustLocked: boolean; title: string; postCount: number; likesReceived: number; lastSeenAt: string | null; silencedUntil: string | null; suspendedUntil: string | null; moderationNote: string; groups: string[] }
export type Data = {
  team: ForumTeam; categories: Category[]; groups: Group[]; badges: Badge[]; flags: Flag[]; settings: Settings; settingsRevision?: string; badgeRules: string[]; trustNames: string[]
  flagReasons: { id: string; label: string }[]; stats: { topics: number; posts: number; members: number; pendingFlags: number; pendingReview: number }
}
/** A write to the forum admin API; resolves true when it was saved (the page shows the notice and reloads). */
export type Call = (method: string, body?: Record<string, unknown>, success?: string, url?: string) => Promise<boolean>

export const LEVEL_LABEL: Record<Level, string> = { SEE: 'فقط دیدن', REPLY: 'دیدن و پاسخ', CREATE: 'دسترسی کامل' }
export const TIER_LABEL: Record<string, string> = { BRONZE: '🥉 برنزی', SILVER: '🥈 نقره‌ای', GOLD: '🥇 طلایی' }
export const fa = (n: number) => n.toLocaleString('fa-IR')
export const date = (value: string | null) => (value ? new Date(value).toLocaleDateString('fa-IR') : '')
