import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { cloudOrderMeta } from '@/modules/checkout/domain/surface'
import { hostingRenewalHorizon } from '@/modules/hosting/domain/services'
import type { RenewalInvoice } from '@/modules/hosting/domain/workspace'

const RENEWAL_PREVIEW_LIMIT = 6

type ServiceTerm = { id: number; nextDueAt: Date | null }

/** Match only invoices for the same owner, service and still-current term. */
export async function findCurrentRenewalInvoices(userId: number, services: ServiceTerm[], now: Date, client: Pick<Prisma.TransactionClient, 'order'> = db) {
  const terms = new Map(services.flatMap(({ id, nextDueAt }) => nextDueAt ? [[id, nextDueAt.toISOString()] as const] : []))
  const found = new Map<number, RenewalInvoice>()
  if (!terms.size) return found

  const where: Prisma.OrderWhereInput = {
    userId,
    meta: { contains: '"hosting-renewal"' },
    AND: [
      { OR: [...new Set(terms.values())].map(dueAt => ({ meta: { contains: dueAt } })) },
      { OR: [
        { status: 'PAID', invoice: { is: { userId, status: 'PAID' } } },
        { status: 'PENDING', invoice: { is: { userId, status: 'UNPAID', OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } } },
      ] },
    ],
  }
  // Paid orders take precedence even if a new checkout was subsequently opened.
  const cursorOrder = [{ status: 'asc' }, { id: 'desc' }] satisfies Prisma.OrderOrderByWithRelationInput[]
  let cursor: number | undefined
  const batchSize = 100
  do {
    const rows = await client.order.findMany({
      where, orderBy: cursorOrder, take: batchSize,
      ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }),
      select: { id: true, meta: true, invoice: { select: { number: true, status: true } } },
    })
    for (const row of rows) {
      const meta = cloudOrderMeta(row.meta)
      const id = meta?.serviceId
      if (meta?.kind !== 'hosting-renewal' || typeof id !== 'number' || !terms.has(id) || meta.dueAt !== terms.get(id) || found.has(id) || !row.invoice) continue
      const { number, status } = row.invoice
      if (status === 'PAID' || status === 'UNPAID') found.set(id, { number, status })
    }
    if (rows.length < batchSize || found.size === terms.size) break
    cursor = rows.at(-1)?.id
  } while (cursor !== undefined)
  return found
}

export async function cloudServiceRenewals(userId: number, now = new Date()) {
  const where = {
    userId,
    cycle: { not: 'HOURLY' },
    status: { in: ['ACTIVE', 'SUSPENDED'] },
    nextDueAt: { lte: hostingRenewalHorizon(now) },
  }
  const [services, renewalsTotal] = await Promise.all([
    db.hostingService.findMany({
      where, orderBy: [{ nextDueAt: 'asc' }, { id: 'asc' }], take: RENEWAL_PREVIEW_LIMIT,
      select: { id: true, label: true, status: true, nextDueAt: true, priceMinor: true },
    }),
    db.hostingService.count({ where }),
  ])
  const invoices = await findCurrentRenewalInvoices(userId, services, now)
  const renewals = services.flatMap(row => row.nextDueAt ? [{
    id: row.id, label: row.label, status: row.status, dueAt: row.nextDueAt.toISOString(), overdue: row.nextDueAt <= now,
    renewable: row.priceMinor > 0n, invoice: invoices.get(row.id) ?? null,
  }] : [])
  return { renewals, renewalsTotal }
}
