import type { PublicPlan, PublicPlanRepository } from '../domain/public-plan'

export async function listPublicPlans(repository: PublicPlanRepository): Promise<PublicPlan[]> {
  return repository.listActive()
}
