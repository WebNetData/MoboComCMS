import { db } from '@/platform/database/prisma'
import type { PublicPlanRepository } from '../domain/public-plan'
import { legacyNumber } from '@/shared/money'

export const prismaPublicPlanRepository: PublicPlanRepository = {
  async listActive() {
    const rows = await db.plan.findMany({
      where: { active: true },
      orderBy: { sort: 'asc' },
      include: { panel: { select: { name: true, type: true } } },
    })

    return rows.map((plan) => ({
      id: plan.id,
      name: plan.name,
      nameEn: plan.nameEn,
      description: plan.description,
      descriptionEn: plan.descriptionEn,
      trafficGB: plan.trafficGB,
      days: plan.days,
      deviceLimit: plan.deviceLimit,
      price: plan.price,
      currency: plan.currency,
      featured: plan.featured,
      panel: plan.panel ? { name: plan.panel.name, type: plan.panel.type } : null,
      access: plan.access,
      memberPrice: plan.memberPriceMinor > 0n ? legacyNumber(plan.memberPriceMinor, plan.currency) : 0,
      vipGiftDays: plan.vipGiftDays,
    }))
  },
}
