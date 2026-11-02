import { cache } from 'react'
import { getServerSession } from 'next-auth'
import { db } from '@/platform/database/prisma'
import { AUDIENCE_ITEMS, parseAudience, type AudienceItem } from '@/modules/account/domain/item-audience'
import type { ViewerAccount } from '@/modules/account/server/viewer-account'

const currentAccount = cache(async (): Promise<ViewerAccount | null> => {
  const { authOptions } = await import('@/modules/identity/auth')
  const session = await getServerSession(authOptions).catch(() => null)
  const userId = Number((session?.user as { id?: string | number } | undefined)?.id) || 0
  return userId ? (await import('@/modules/account/server/viewer-account')).accountOf(userId) : null
})

async function opens(raw: string, type: AudienceItem, account: ViewerAccount | null) {
  if (!raw) return true
  if (!account) return false
  if (account.permissions.includes(AUDIENCE_ITEMS[type].permission)) return true
  const keys = parseAudience(raw)
  return keys.length > 0 && (await (await import('@/modules/account/server/site-groups')).siteGroupsOf(account.id, keys)).length > 0
}

/** Whether the person viewing this page or calling this route may see an item with this audience. */
export const opensAudience = async (raw: string | null | undefined, type: AudienceItem) => !raw || opens(raw, type, await currentAccount())

/** The same for a known user, in commands that are not about the current request's session. */
export const userOpensAudience = async (raw: string | null | undefined, type: AudienceItem, userId: number | null | undefined) => !raw || opens(raw, type, userId ? await (await import('@/modules/account/server/viewer-account')).accountOf(userId) : null)

const reader = (type: AudienceItem) => db[AUDIENCE_ITEMS[type].model] as unknown as {
  findUnique(args: unknown): Promise<{ audienceGroups: string } | null>
  findMany(args: unknown): Promise<{ audienceGroups: string }[]>
}

/** The same for an item known only by its id. */
export async function opensItem(type: AudienceItem, id: number) {
  if (type === 'track') {
    const track = await db.musicTrack.findUnique({ where: { id }, select: { audienceGroups: true, album: { select: { audienceGroups: true } } } })
    return !!track && await opensAudience(track.audienceGroups, 'track') && await opensAudience(track.album?.audienceGroups, 'album')
  }
  const row = await reader(type).findUnique({ where: { id }, select: { audienceGroups: true } })
  return !!row && opensAudience(row.audienceGroups, type)
}

/**
 * A list's condition, spread after the shared publication filter: everything open to everyone plus what this viewer's
 * groups open. Used only by the main lists of a section; a shared rail stays on the filter, which leaves limited items out.
 */
type AudienceFilter = string | { in: string[] }
type AudienceClause = { audienceGroups: AudienceFilter; album?: { isNot: { NOT: { audienceGroups: AudienceFilter } } } }
export const audienceClause = cache(async (type: AudienceItem): Promise<AudienceClause> => {
  const account = await currentAccount()
  if (!account) return { audienceGroups: '', ...(type === 'track' ? { album: { isNot: { NOT: { audienceGroups: '' } } } } : {}) }
  const rows = await reader(type).findMany({ where: { audienceGroups: { not: '' } }, distinct: ['audienceGroups'], select: { audienceGroups: true } })
  const staff = account.permissions.includes(AUDIENCE_ITEMS[type].permission)
  const wanted = [...new Set(rows.flatMap(row => parseAudience(row.audienceGroups)))], mine = new Set(staff ? wanted : await (await import('@/modules/account/server/site-groups')).siteGroupsOf(account.id, wanted))
  const open = rows.filter(row => staff || parseAudience(row.audienceGroups).some(key => mine.has(key))).map(row => row.audienceGroups)
  const own = { audienceGroups: open.length ? { in: ['', ...open] } : '' }
  if (type !== 'track') return own
  const album = await audienceClause('album')
  return { ...own, album: { isNot: { NOT: { audienceGroups: album.audienceGroups } } } }
})
