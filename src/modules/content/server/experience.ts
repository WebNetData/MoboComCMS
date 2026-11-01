import { db } from '@/platform/database/prisma'
import type { ItemRef } from '@/modules/content/domain/items'

/**
 * Whether the site has its own record of a member using an item: a purchase, a download, or
 * watching/listening. Read from the records the owning modules already keep; nothing is
 * tracked here. Strongest evidence wins. Download logs are pruned after a while, so callers
 * that need a lasting answer store it when they get one.
 */
export type ItemExperience = 'PURCHASE' | 'DOWNLOAD' | 'WATCH' | 'LISTEN' | ''

/** A watch counts once it is finished or at least this far in, not on opening the player. */
const WATCHED_SECONDS = 300
const CHILD_LIMIT = 5000

type Owner = { ownerType: string; ownerId: number }

const anyOwner = (owners: Owner[]) => {
  const byType = new Map<string, number[]>()
  for (const owner of owners) byType.set(owner.ownerType, [...(byType.get(owner.ownerType) || []), owner.ownerId])
  return [...byType].map(([ownerType, ids]) => ({ ownerType, ownerId: { in: ids } }))
}

export async function memberItemExperience(userId: number, ref: ItemRef): Promise<ItemExperience> {
  if (!Number.isSafeInteger(userId) || userId <= 0 || !Number.isSafeInteger(ref.id) || ref.id <= 0) return ''
  const purchases: Owner[] = [{ ownerType: ref.type, ownerId: ref.id }]
  const downloads: Owner[] = []
  const watches: Owner[] = []
  let trackIds: number[] = []
  switch (ref.type) {
    case 'prompt': return ''
    case 'business': {
      const business = await db.businessProfile.findUnique({ where: { id: ref.id }, select: { kind: true } })
      if (business?.kind !== 'SITE') return ''
      const paid = await db.order.findFirst({ where: { userId, status: 'PAID', productDelivery: { is: { status: 'DELIVERED' } } }, select: { id: true } })
      return paid ? 'PURCHASE' : ''
    }
    case 'software': {
      const releases = await db.softwareRelease.findMany({ where: { softwareId: ref.id }, select: { id: true }, take: CHILD_LIMIT })
      downloads.push({ ownerType: 'software', ownerId: ref.id }, ...releases.map((row) => ({ ownerType: 'softwarerelease', ownerId: row.id })))
      break
    }
    case 'game': {
      const updates = await db.gameUpdate.findMany({ where: { gameId: ref.id }, select: { id: true }, take: CHILD_LIMIT })
      downloads.push({ ownerType: 'game', ownerId: ref.id }, ...updates.map((row) => ({ ownerType: 'gameupdate', ownerId: row.id })))
      break
    }
    case 'title': {
      const episodes = await db.cinemaEpisode.findMany({ where: { season: { titleId: ref.id } }, select: { id: true }, take: CHILD_LIMIT })
      const owners = [{ ownerType: 'title', ownerId: ref.id }, ...episodes.map((row) => ({ ownerType: 'episode', ownerId: row.id }))]
      downloads.push(...owners); watches.push(...owners)
      break
    }
    case 'album': {
      trackIds = (await db.musicTrack.findMany({ where: { albumId: ref.id }, select: { id: true }, take: CHILD_LIMIT })).map((row) => row.id)
      break
    }
    case 'track': {
      trackIds = [ref.id]
      const track = await db.musicTrack.findUnique({ where: { id: ref.id }, select: { albumId: true } })
      if (track?.albumId) purchases.push({ ownerType: 'album', ownerId: track.albumId })
      break
    }
    default: return ''
  }
  if (trackIds.length) downloads.push(...trackIds.map((id) => ({ ownerType: 'track', ownerId: id })))
  const [purchased, downloaded, watched, listened] = await Promise.all([
    db.contentPurchase.findFirst({ where: { userId, revokedAt: null, OR: anyOwner(purchases) }, select: { id: true } }),
    downloads.length ? db.downloadLog.findFirst({ where: { userId, OR: anyOwner(downloads) }, select: { id: true } }) : null,
    watches.length ? db.cinemaWatchProgress.findFirst({ where: { userId, AND: [{ OR: anyOwner(watches) }, { OR: [{ completedAt: { not: null } }, { positionSeconds: { gte: WATCHED_SECONDS } }] }] }, select: { userId: true } }) : null,
    trackIds.length ? db.musicListenHistory.findFirst({ where: { userId, trackId: { in: trackIds } }, select: { userId: true } }) : null,
  ])
  return purchased ? 'PURCHASE' : downloaded ? 'DOWNLOAD' : watched ? 'WATCH' : listened ? 'LISTEN' : ''
}
