import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { cleanLinks, type LinkOwner } from '@/modules/media/domain/media'
import { assignTerms } from '@/modules/taxonomy/server/taxonomy'
import type { Taxonomy } from '@/modules/taxonomy/domain/taxonomy'
import { scheduleEpisodeAirings } from '@/modules/cinema/server/episode-notifications'

type Tx = Prisma.TransactionClient
const owners: Record<string, LinkOwner> = { 'cinema-titles': 'title', games: 'game', software: 'software' }
const taxonomies: Record<string, Taxonomy> = { 'cinema-titles': 'cinema', games: 'games', software: 'software', 'music-albums': 'music' }
const linkSelect = { url: true, label: true, kind: true, quality: true, size: true, platform: true, architecture: true, checksum: true, audio: true, subtitle: true, language: true, access: true, disabled: true, sortOrder: true } as const

/** Only editorial relationships; never paid entitlements, counters or member history. */
export async function mediaRevisionState(type: string, row: Record<string, unknown> | null, tx: Tx = db): Promise<Record<string, unknown> | null> {
  if (!row) return null
  const id = Number(row.id), relations: Record<string, unknown> = { version: 1 }
  const links = (ownerType: string, ownerId: number) => tx.mediaLink.findMany({ where: { ownerType, ownerId }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], select: linkSelect })
  if (owners[type]) relations.links = await links(owners[type], id)
  if (taxonomies[type]) {
    const terms = await tx.taxonomyAssignment.findMany({ where: { taxonomy: taxonomies[type], ownerId: id }, orderBy: { termId: 'asc' }, select: { termId: true, primary: true } })
    relations.terms = { ids: terms.map(term => term.termId), primary: terms.find(term => term.primary)?.termId || null }
  }
  if (type === 'cinema-titles') {
    const seasons = await tx.cinemaSeason.findMany({ where: { titleId: id }, orderBy: { number: 'asc' }, include: { episodes: { orderBy: { number: 'asc' } } } })
    relations.seasons = await Promise.all(seasons.map(async season => ({ number: season.number, name: season.name, poster: season.poster, episodes: await Promise.all(season.episodes.map(async ({ id: episodeId, seasonId: _seasonId, ...episode }) => ({ ...episode, links: await links('episode', episodeId) }))) })))
  }
  const raw = JSON.stringify(relations)
  if (raw.length > 1_000_000) throw Error('Revision relationships exceed the supported size')
  return { ...row, __relations: raw }
}

/** URL reconciliation retains live IDs, reports, counters and purchased link grants. Missing links are hidden. */
async function restoreLinks(tx: Tx, ownerType: LinkOwner, ownerId: number, input: unknown) {
  if (!Array.isArray(input)) throw Error('Invalid revision links')
  const current = await tx.mediaLink.findMany({ where: { ownerType, ownerId } }), keep: number[] = []
  for (const link of cleanLinks(input)) {
    const found = current.find(row => row.url === link.url && !keep.includes(row.id))
    if (found) { await tx.mediaLink.update({ where: { id: found.id }, data: { ...link, disabled: found.disabled || link.disabled } }); keep.push(found.id) }
    else keep.push((await tx.mediaLink.create({ data: { ...link, ownerType, ownerId } })).id)
  }
  await tx.mediaLink.updateMany({ where: { ownerType, ownerId, id: { notIn: keep } }, data: { disabled: true } })
}

/** Trusted stored envelope, still validated before writing; historical scalar-only versions leave relations alone. */
export async function restoreMediaRelations(tx: Tx, type: string, id: number, raw: unknown) {
  if (raw === undefined) return
  if (typeof raw !== 'string' || raw.length > 1_000_000) throw Error('Invalid revision relationships')
  const data = JSON.parse(raw)
  if (!data || data.version !== 1) throw Error('Unsupported revision relationship version')
  if (taxonomies[type] && data.terms) {
    const ids: number[] = data.terms.ids
    if (!Array.isArray(ids) || ids.length > 500 || ids.some(id => !Number.isSafeInteger(id) || id <= 0)) throw Error('Invalid revision categories')
    if (await tx.taxonomyTerm.count({ where: { taxonomy: taxonomies[type], id: { in: ids } } }) !== new Set(ids).size) throw Error('A category of this version no longer exists')
    await assignTerms(tx, taxonomies[type], id, data.terms)
  }
  if (owners[type] && data.links) await restoreLinks(tx, owners[type], id, data.links)
  if (type !== 'cinema-titles' || !data.seasons) return
  if (!Array.isArray(data.seasons) || data.seasons.length > 60) throw Error('Invalid revision seasons')
  const old = await tx.cinemaSeason.findMany({ where: { titleId: id }, include: { episodes: true } }), keptSeasons: number[] = [], airings: { season: number; number: number; airDate: Date | null }[] = []
  for (const season of data.seasons) {
    if (!Number.isSafeInteger(season.number) || season.number < 0 || !Array.isArray(season.episodes) || season.episodes.length > 400) throw Error('Invalid revision season')
    const row = await tx.cinemaSeason.upsert({ where: { titleId_number: { titleId: id, number: season.number } }, create: { titleId: id, number: season.number, name: season.name, poster: season.poster }, update: { name: season.name, poster: season.poster } })
    keptSeasons.push(row.id)
    const keptEpisodes: number[] = []
    for (const episode of season.episodes) {
      const { links, ...input } = episode
      if (!Number.isSafeInteger(input.number) || input.number < 0) throw Error('Invalid revision episode')
      const values = { number: input.number, title: String(input.title || ''), titleEn: String(input.titleEn || ''), summary: String(input.summary || ''), still: String(input.still || ''), runtime: Number(input.runtime) || 0, airDate: input.airDate ? new Date(input.airDate) : null, access: String(input.access || 'PUBLIC') }
      const saved = await tx.cinemaEpisode.upsert({ where: { seasonId_number: { seasonId: row.id, number: input.number } }, create: { ...values, seasonId: row.id }, update: values })
      keptEpisodes.push(saved.id); await restoreLinks(tx, 'episode', saved.id, links || [])
      airings.push({ season: season.number, number: input.number, airDate: values.airDate })
    }
    const removed = old.find(season => season.id === row.id)?.episodes.filter(episode => !keptEpisodes.includes(episode.id)).map(episode => episode.id) || []
    if (removed.length) await tx.mediaLink.updateMany({ where: { ownerType: 'episode', ownerId: { in: removed } }, data: { disabled: true } })
    await tx.cinemaEpisode.deleteMany({ where: { seasonId: row.id, id: { notIn: keptEpisodes } } })
  }
  const removedEpisodes = old.filter(season => !keptSeasons.includes(season.id)).flatMap(season => season.episodes.map(episode => episode.id))
  if (removedEpisodes.length) await tx.mediaLink.updateMany({ where: { ownerType: 'episode', ownerId: { in: removedEpisodes } }, data: { disabled: true } })
  await tx.cinemaSeason.deleteMany({ where: { titleId: id, id: { notIn: keptSeasons } } })
  await scheduleEpisodeAirings(tx, id, airings)
}
