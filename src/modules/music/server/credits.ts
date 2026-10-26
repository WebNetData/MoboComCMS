import type { Prisma } from '@prisma/client'
import { cleanCredits } from '@/modules/music/domain/vocabulary'
import { knownCodes } from '@/modules/vocabulary/server/vocabulary'

/**
 * Replaces a song's credits with what the form sent: roles the CREDIT_ROLE list knows (or the song already had), and
 * artist profiles that exist (a merged profile counts as the one it was merged into). Anything else is dropped.
 */
export async function saveMusicCredits(tx: Prisma.TransactionClient, trackId: number, input: unknown) {
  const wanted = cleanCredits(input)
  const had = await tx.musicCredit.findMany({ where: { trackId }, select: { role: true } })
  const roles = new Set(await knownCodes(tx, 'music', 'CREDIT_ROLE', wanted.map((credit) => credit.role), had.map((credit) => credit.role)))
  const artists = wanted.length ? await tx.musicArtist.findMany({ where: { id: { in: wanted.map((credit) => credit.artistId) } }, select: { id: true, mergedIntoId: true } }) : []
  const current = new Map(artists.map((artist) => [artist.id, artist.mergedIntoId ?? artist.id]))
  const rows: { role: string; artistId: number }[] = []
  for (const credit of wanted) {
    const artistId = current.get(credit.artistId)
    if (!artistId || !roles.has(credit.role) || rows.some((row) => row.role === credit.role && row.artistId === artistId)) continue
    rows.push({ role: credit.role, artistId })
  }
  await tx.musicCredit.deleteMany({ where: { trackId } })
  if (rows.length) await tx.musicCredit.createMany({ data: rows.map((row, sortOrder) => ({ trackId, ...row, sortOrder })) })
}
