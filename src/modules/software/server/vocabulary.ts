import type { Prisma } from '@prisma/client'

/** Counts how many software titles use each entry of the software lists (their licence). */
export async function softwareUsage(client: Pick<Prisma.TransactionClient, 'softwareTitle'>) {
  const counts = new Map((await client.softwareTitle.groupBy({ by: ['license'], _count: { _all: true } })).map((row) => [row.license, row._count._all]))
  return (list: string, code: string) => (list === 'LICENSE' ? counts.get(code) ?? 0 : 0)
}
