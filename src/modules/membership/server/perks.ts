import type { Prisma } from '@prisma/client'
import { parsePerks, type Perk } from '@/modules/membership/domain/membership'

type Entry = { code: string; name: string; nameEn: string; icon: string }

/** A perk line as the site shows it: a listed perk takes its entry's current text and icon; a free line stays as written. */
export function resolvePerks(perks: Perk[], entries: Entry[]): Perk[] {
  const byCode = new Map(entries.map((entry) => [entry.code, entry]))
  return perks.flatMap((perk) => {
    const entry = perk.code ? byCode.get(perk.code) : undefined
    const line = entry ? { icon: entry.icon || perk.icon || '★', fa: entry.name, en: entry.nameEn } : { icon: perk.icon, fa: perk.fa, en: perk.en }
    return line.fa ? [line] : []
  })
}

/**
 * A plan's perk lines as saved: a code the PERK list knows (or the plan already had) keeps its code with a snapshot of
 * its text (shown if the entry ever goes away); an unknown code becomes a free line if it has text, else is dropped.
 */
export async function listedPerks(tx: Pick<Prisma.TransactionClient, 'vocabulary'>, perks: Perk[], had: Perk[]): Promise<Perk[]> {
  const codes = [...new Set(perks.flatMap((perk) => (perk.code ? [perk.code] : [])))]
  if (!codes.length) return perks
  const kept = new Set(had.flatMap((perk) => (perk.code ? [perk.code] : [])))
  const rows = await tx.vocabulary.findMany({ where: { section: 'membership', list: 'PERK', code: { in: codes } }, select: { code: true, name: true, nameEn: true, icon: true, active: true } })
  const allowed = new Map(rows.filter((row) => row.active || kept.has(row.code)).map((row) => [row.code, row]))
  return perks.flatMap((perk) => {
    if (!perk.code) return [perk]
    const entry = allowed.get(perk.code)
    if (entry) return [{ code: entry.code, icon: entry.icon || perk.icon || '★', fa: entry.name, en: entry.nameEn }]
    return perk.fa ? [{ icon: perk.icon, fa: perk.fa, en: perk.en }] : []
  })
}

/** How many plans list each perk. */
export async function membershipUsage(client: Pick<Prisma.TransactionClient, 'membershipPlan'>) {
  const counts = new Map<string, number>()
  for (const row of await client.membershipPlan.findMany({ select: { perks: true } })) {
    for (const code of new Set(parsePerks(row.perks).flatMap((perk) => (perk.code ? [perk.code] : [])))) counts.set(code, (counts.get(code) ?? 0) + 1)
  }
  return (list: string, code: string) => (list === 'PERK' ? counts.get(code) ?? 0 : 0)
}
