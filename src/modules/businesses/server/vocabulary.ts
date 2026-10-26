import type { Prisma } from '@prisma/client'
import { knownNames } from '@/modules/vocabulary/server/vocabulary'

/** Counts how many businesses and waiting suggestions use each category. */
export async function businessUsage(client: Pick<Prisma.TransactionClient, 'businessProfile' | 'businessRequest'>) {
  const [profiles, requests] = await Promise.all([
    client.businessProfile.groupBy({ by: ['category'], _count: { _all: true } }),
    client.businessRequest.groupBy({ by: ['category'], where: { status: 'PENDING' }, _count: { _all: true } }),
  ])
  const counts = new Map<string, number>()
  for (const row of [...profiles, ...requests]) counts.set(row.category, (counts.get(row.category) ?? 0) + row._count._all)
  return (list: string, code: string) => (list === 'CATEGORY' ? counts.get(code) ?? 0 : 0)
}

/**
 * A business's category as saved: a name of the CATEGORY list (matched by its name or English name), or the one the
 * business already had even if since deactivated; anything else leaves it without a category.
 */
export async function listedCategory(tx: Pick<Prisma.TransactionClient, 'vocabulary'>, wanted: string, had?: string | null) {
  if (!wanted.trim()) return ''
  return (await knownNames(tx, 'businesses', 'CATEGORY', [wanted], had ? [had] : []))[0] ?? ''
}
