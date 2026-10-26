import type { Prisma } from '@prisma/client'

/** Counts how many magazine posts use each post format. */
export async function journalUsage(client: Pick<Prisma.TransactionClient, 'post'>) {
  const counts = new Map((await client.post.groupBy({ by: ['format'], _count: { _all: true } })).map((row) => [row.format, row._count._all]))
  return (list: string, code: string) => (list === 'POST_FORMAT' ? counts.get(code) ?? 0 : 0)
}
