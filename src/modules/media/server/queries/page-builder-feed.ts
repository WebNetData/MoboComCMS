import { browseSoftware, type SoftwareCard } from './software'
import { db } from '@/platform/database/prisma'
import { type AlbumCard, type TrackCard, albumInclude, toAlbum, toTrack, trackInclude } from '@/modules/media/server/queries/music'
import { type TitleCard, titleInclude, toTitle } from '@/modules/media/server/queries/cinema'
import { type GameCard, toGame } from '@/modules/media/server/queries/games'
import { live, liveTrack } from '@/modules/media/server/queries/core'

export type BuilderMediaFeed =
  | { kind: 'tracks'; items: TrackCard[] }
  | { kind: 'albums'; items: AlbumCard[] }
  | { kind: 'titles'; items: TitleCard[] }
  | { kind: 'games'; items: GameCard[] }
  | { kind: 'software'; items: SoftwareCard[] }

/** Data for the page-builder `media` widget. */
export async function getBuilderMedia(source: string, limit: number): Promise<BuilderMediaFeed> {
  const take = Math.max(1, Math.min(16, Math.round(limit) || 6))
  try {
    switch (source) {
      case 'music-new':
      case 'music-top':
        return { kind: 'tracks', items: (await db.musicTrack.findMany({ where: liveTrack(), include: trackInclude, orderBy: source === 'music-top' ? [{ plays: 'desc' }, { publishedAt: 'desc' }] : { publishedAt: 'desc' }, take })).map(toTrack) }
      case 'music-albums':
        return { kind: 'albums', items: (await db.musicAlbum.findMany({ where: live(), include: albumInclude, orderBy: [{ featured: 'desc' }, { publishedAt: 'desc' }], take })).map(toAlbum) }
      case 'cinema-movies':
      case 'cinema-series':
      case 'cinema-top':
      case 'cinema-dubbed':
      case 'cinema-vip': {
        const where: any = { ...live() }
        if (source === 'cinema-movies') where.kind = 'MOVIE'
        if (source === 'cinema-series') where.kind = 'SERIES'
        if (source === 'cinema-dubbed') where.dubbed = true
        if (source === 'cinema-vip') where.access = 'MEMBERS'
        if (source === 'cinema-top') where.imdbRating = { not: null }
        return { kind: 'titles', items: (await db.cinemaTitle.findMany({ where, include: titleInclude, orderBy: source === 'cinema-top' ? { imdbRating: 'desc' } : { publishedAt: 'desc' }, take })).map(toTitle) }
      }
      case 'games-new':
      case 'games-top':
        return { kind: 'games', items: (await db.gameTitle.findMany({ where: source === 'games-top' ? { ...live(), score: { not: null } } : live(), orderBy: source === 'games-top' ? { score: 'desc' } : { publishedAt: 'desc' }, take })).map(toGame) }
      case 'software-new':
      case 'software-top':
        return { kind: 'software', items: (await browseSoftware({ sort: source === 'software-top' ? 'popular' : '', page: 1 })).items.slice(0, take) }
      default:
        return { kind: 'tracks', items: [] }
    }
  } catch {
    return { kind: 'tracks', items: [] }
  }
}
