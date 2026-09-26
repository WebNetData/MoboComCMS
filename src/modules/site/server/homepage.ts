import { db } from '@/platform/database/prisma'
import { getSettings } from '@/modules/settings/server'
import { getPublicPlans } from '@/modules/catalog/server/public-plans'
import type { LandingData } from '@/modules/site/domain/homepage'
import { resolveUsdTomanRateNumber } from '@/modules/billing/domain/rates'
import { telegramConfig } from '@/modules/notifications/server/telegram'

function parseFormFields(value: string) {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export async function getLandingData(): Promise<LandingData> {
  const [plans, settings, locations, posts, products, forms, telegram] = await Promise.all([
    getPublicPlans(),
    getSettings(),
    db.mapLocation.findMany({ where: { active: true } }),
    db.post.findMany({
      where: { status: 'PUBLISHED' },
      include: { category: true },
      orderBy: { publishedAt: 'desc' },
      take: 3,
    }),
    db.product.findMany({
      where: { active: true },
      include: { category: true },
      orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }],
      take: 3,
    }),
    db.siteForm.findMany({ where: { published: true } }),
    telegramConfig().catch(() => null),
  ])

  return {
    plans: plans.slice(0, 4),
    locations: locations.map((location) => ({
      id: location.id,
      country: location.country,
      countryFa: location.countryFa,
      flag: location.flag,
      lat: location.lat,
      lng: location.lng,
      city: location.city,
    })),
    posts: posts.map((post) => ({
      id: post.id,
      slug: post.slug,
      title: post.title,
      titleEn: post.titleEn,
      excerpt: post.excerpt,
      excerptEn: post.excerptEn,
      cover: post.cover,
      publishedAt: post.publishedAt,
      category: post.category ? { name: post.category.name, nameEn: post.category.nameEn } : null,
    })),
    products: (settings.storeEnabled === 'true' ? products : []).map((product) => ({
      id: product.id,
      slug: product.slug,
      name: product.name,
      nameEn: product.nameEn,
      price: product.price,
      currency: product.currency,
      image: product.image,
      category: product.category ? { name: product.category.name, nameEn: product.category.nameEn } : null,
    })),
    forms: forms.map((form) => ({
      ...form,
      fields: parseFormFields(form.fields),
    })),
    tomanRate: resolveUsdTomanRateNumber(settings.usdRateToman, process.env.FRENZYEX_USD_RATE_TOMAN),
    telegramBot: telegram?.ready ? telegram.username : '',
  }
}
