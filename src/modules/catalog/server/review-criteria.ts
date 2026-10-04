import { db } from '@/platform/database/prisma'

const keys = ['quality', 'value', 'usability'] as const

/** Aggregate every approved review without materializing the full review table. */
export async function productReviewCriteria(productId: number) {
  const totals = Object.fromEntries(keys.map(key => [key, { sum: 0, count: 0 }])) as Record<typeof keys[number], { sum: number; count: number }>
  let cursor = 0
  while (true) {
    const rows = await db.productReview.findMany({
      where: { productId, status: 'APPROVED', id: { gt: cursor } }, orderBy: { id: 'asc' }, take: 500,
      select: { id: true, criteria: true },
    })
    if (!rows.length) break
    for (const row of rows) {
      let parsed: unknown
      try { parsed = JSON.parse(row.criteria) } catch { continue }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue
      for (const key of keys) {
        const value = Number((parsed as Record<string, unknown>)[key])
        if (!Number.isFinite(value) || value < 1 || value > 5) continue
        totals[key].sum += value; totals[key].count++
      }
    }
    if (rows.length < 500) break
    cursor = rows[rows.length - 1].id
  }
  return Object.fromEntries(keys.map(key => [key, totals[key].count ? Math.round(totals[key].sum / totals[key].count * 10) / 10 : 0]))
}
