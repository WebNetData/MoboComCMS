import { listPublicPlans } from '../application/list-public-plans'
import { prismaPublicPlanRepository } from '../infrastructure/prisma-public-plan-repository'

/** Composition root for server-side plan queries. */
export function getPublicPlans() {
  return listPublicPlans(prismaPublicPlanRepository)
}
