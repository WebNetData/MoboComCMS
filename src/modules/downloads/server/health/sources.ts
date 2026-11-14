import { createHash } from 'node:crypto'
import { db } from '@/platform/database/prisma'
import { isModuleEnabled } from '@/extensions/server/modules'
import type { Prisma } from '@prisma/client'
export const healthSourceHash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export async function healthSource(sourceKey: string, client: Prisma.TransactionClient | typeof db = db) {
  const [kind, id, quality] = sourceKey.split(':'), number = Number(id)
  if (!Number.isSafeInteger(number) || number < 1) return null
  if (kind === 'track') {
    if (!await isModuleEnabled('music') || !['normal', 'hq'].includes(quality)) return null
    const row = await client.musicTrack.findFirst({ where: { id: number, status: 'PUBLISHED', publishedAt: { lte: new Date() } } })
    const url = quality === 'hq' ? row?.audioHqUrl : row?.audioUrl
    return row && url ? { url, hash: healthSourceHash([row.id, row.updatedAt, url]), title: row.title, admin: `/admin/music/library?edit=${row.id}`, linkId: null, trackId: row.id, quality } : null
  }
  if (kind !== 'link') return null
  const row = await client.mediaLink.findFirst({ where: { id: number, disabled: false } })
  if (!row) return null
  let title = '', admin = '', module = ''
  const now = new Date()
  if (row.ownerType === 'title') { const owner = await client.cinemaTitle.findUnique({ where: { id: row.ownerId } }); if (owner?.status === 'PUBLISHED' && owner.publishedAt <= now) { title = owner.title; admin = `/admin/cinema/titles?edit=${owner.id}`; module = 'cinema' } }
  if (row.ownerType === 'episode') { const owner = await client.cinemaEpisode.findUnique({ where: { id: row.ownerId }, include: { season: { include: { title: true } } } }); if (owner?.season.title.status === 'PUBLISHED' && owner.season.title.publishedAt <= now) { title = owner.season.title.title; admin = `/admin/cinema/episodes?edit=${owner.id}`; module = 'cinema' } }
  if (row.ownerType === 'game') { const owner = await client.gameTitle.findUnique({ where: { id: row.ownerId } }); if (owner?.status === 'PUBLISHED' && owner.publishedAt <= now) { title = owner.title; admin = `/admin/games/${owner.id}#download`; module = 'games' } }
  if (row.ownerType === 'gameupdate') { const owner = await client.gameUpdate.findUnique({ where: { id: row.ownerId }, include: { game: true } }); if (owner?.game.status === 'PUBLISHED' && owner.game.publishedAt <= now && owner.releasedAt <= now) { title = owner.game.title; admin = `/admin/games/${owner.gameId}#updates`; module = 'games' } }
  if (row.ownerType === 'software') { const owner = await client.softwareTitle.findUnique({ where: { id: row.ownerId } }); if (owner?.status === 'PUBLISHED' && owner.publishedAt <= now) { title = owner.title; admin = `/admin/software/titles?edit=${owner.id}`; module = 'software' } }
  if (row.ownerType === 'softwarerelease') { const owner = await client.softwareRelease.findUnique({ where: { id: row.ownerId }, include: { software: true } }); if (owner?.status === 'PUBLISHED' && owner.releasedAt <= now && owner.software.status === 'PUBLISHED' && owner.software.publishedAt <= now) { title = owner.software.title; admin = `/admin/software/releases?softwareId=${owner.softwareId}`; module = 'software' } }
  return title && module && await isModuleEnabled(module) ? { url: row.url, hash: healthSourceHash([row.ownerType, row.ownerId, row.url, row.disabled, row.kind]), title, admin, linkId: row.id, trackId: null, quality: '' } : null
}
