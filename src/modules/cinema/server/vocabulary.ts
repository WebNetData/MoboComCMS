import type { Prisma } from '@prisma/client'
import { splitList } from '@/modules/media/domain/media'

/** Counts how many films and series use each genre, country and language. */
export async function cinemaUsage(client: Pick<Prisma.TransactionClient, 'cinemaTitle'>) {
  const rows = await client.cinemaTitle.findMany({ select: { genres: true, countries: true, languages: true } })
  const counts: Record<string, Map<string, number>> = { GENRE: new Map(), COUNTRY: new Map(), LANGUAGE: new Map() }
  const add = (list: string, value: string) => { for (const name of new Set(splitList(value, 20))) counts[list].set(name, (counts[list].get(name) ?? 0) + 1) }
  for (const row of rows) { add('GENRE', row.genres); add('COUNTRY', row.countries); add('LANGUAGE', row.languages) }
  return (list: string, code: string) => counts[list]?.get(code) ?? 0
}
