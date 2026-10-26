import type { Prisma } from '@prisma/client'
import { splitList } from '@/modules/media/domain/media'

/** Counts how many songs and albums use each entry of the music lists: genres, release types and credit roles. */
export async function musicUsage(client: Pick<Prisma.TransactionClient, 'musicTrack' | 'musicAlbum' | 'musicCredit'>) {
  const [tracks, albums, roles] = await Promise.all([
    client.musicTrack.findMany({ select: { genre: true } }),
    client.musicAlbum.findMany({ select: { genre: true, albumType: true } }),
    client.musicCredit.groupBy({ by: ['role'], _count: { _all: true } }),
  ])
  const counts: Record<string, Map<string, number>> = { GENRE: new Map(), ALBUM_TYPE: new Map(), CREDIT_ROLE: new Map(roles.map((row) => [row.role, row._count._all])) }
  const add = (list: string, code: string) => counts[list].set(code, (counts[list].get(code) ?? 0) + 1)
  for (const row of [...tracks, ...albums]) for (const name of new Set(splitList(row.genre, 20))) add('GENRE', name)
  for (const row of albums) add('ALBUM_TYPE', row.albumType)
  return (list: string, code: string) => counts[list]?.get(code) ?? 0
}
