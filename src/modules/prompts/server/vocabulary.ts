// Public Vocabulary integration port; independent of the main facade to avoid a registry/query cycle.
import type { Prisma } from '@prisma/client'
export async function promptUsage(client: Pick<Prisma.TransactionClient, 'promptTemplate'>) {
  const rows = await client.promptTemplate.groupBy({ by: ['category'], _count: { _all: true } })
  const counts = new Map(rows.map(row => [row.category, row._count._all]))
  return (list: string, code: string) => list === 'CATEGORY' ? counts.get(code) || 0 : 0
}
