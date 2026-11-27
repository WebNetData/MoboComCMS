import type { Prisma } from '@prisma/client'
import { isModuleEnabled } from '@/extensions/server/modules'
import { db } from '@/platform/database/prisma'
import { currentAdminHasPermission, type AuthedUser } from '@/modules/identity/server/access'

export async function opportunityCommerceReport(actor: AuthedUser, where: Prisma.CrmOpportunityWhereInput) {
  if (!currentAdminHasPermission(actor, 'orders.manage') || !await isModuleEnabled('store', db)) return null
  const paid: Prisma.CrmOpportunityWhereInput = {
    ...where, quotations: { some: { quotation: { order: { status: 'PAID' } } } },
  }
  const [opportunities, paidOpportunities, estimates, actual] = await db.$transaction([
    db.crmOpportunity.count({ where }),
    db.crmOpportunity.count({ where: paid }),
    db.crmOpportunity.groupBy({ where: paid, by: ['currency'], _sum: { amountMinor: true } }),
    db.order.groupBy({
      where: { status: 'PAID', quotation: { crmLink: { opportunity: where } } },
      by: ['currency'], _sum: { totalMinor: true },
    }),
  ], process.env.DATABASE_URL?.startsWith('file:') ? undefined : { isolationLevel: 'RepeatableRead' })
  const estimated = new Map(estimates.map(row => [row.currency, row._sum.amountMinor ?? 0n]))
  const captured = new Map(actual.map(row => [row.currency, row._sum.totalMinor ?? 0n]))
  const currencies = Array.from(new Set([...estimated.keys(), ...captured.keys()])).sort()
  return {
    opportunities, paidOpportunities,
    conversionRate: opportunities ? Math.round(paidOpportunities * 1000 / opportunities) / 10 : 0,
    totals: currencies.map(currency => ({
      currency, estimatedMinor: String(estimated.get(currency) ?? 0n), paidMinor: String(captured.get(currency) ?? 0n),
    })),
  }
}
