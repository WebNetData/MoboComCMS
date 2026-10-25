import type { Prisma } from '@prisma/client'

/** Counts how many download and stream links of any section use each entry of the link lists (audio, quality). */
export async function linkUsage(client: Pick<Prisma.TransactionClient, 'mediaLink'>) {
  const [audio, quality] = await Promise.all([
    client.mediaLink.groupBy({ by: ['audio'], _count: { _all: true } }),
    client.mediaLink.groupBy({ by: ['quality'], _count: { _all: true } }),
  ])
  const counts = { AUDIO: new Map(audio.map((row) => [row.audio, row._count._all])), QUALITY: new Map(quality.map((row) => [row.quality, row._count._all])) }
  return (list: string, code: string) => (list === 'AUDIO' || list === 'QUALITY' ? counts[list].get(code) ?? 0 : 0)
}
