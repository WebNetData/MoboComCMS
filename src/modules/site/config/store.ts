import { cache } from 'react'
import { db } from '@/platform/database/prisma'
import { defaultSite } from './defaults'
import { validateSite } from './validation'
import { isStoreEnabled } from '@/modules/catalog/server/storefront'
import { isPublicApiEnabled } from '@/modules/public-api/server/availability'
export const SITE_KEY = 'site.config.v1'
export const getSiteConfig = cache(async () => {
  const row = await db.setting.findUnique({ where: { key: SITE_KEY } })
  if (row) {
    try { const parsed: unknown = JSON.parse(row.value); if (validateSite(parsed)) return parsed } catch { /* Invalid old data falls back to the complete default document. */ }
  }
  const legacy = await db.setting.findMany({ where: { key: { in: ['brandName', 'brandTagline'] } } })
  const values = Object.fromEntries(legacy.map(r => [r.key, r.value]))
  return { ...defaultSite, brand: values.brandName || defaultSite.brand, tagline: { ...defaultSite.tagline, fa: values.brandTagline || defaultSite.tagline.fa } }
})

/** Filter only public rendering; keep the editable configuration intact. */
export const getPublicSiteConfig = cache(async () => {
  const editable = await getSiteConfig()
  const publicApiEnabled = await isPublicApiEnabled()
  const site = { ...editable, publicApiEnabled, navigation: editable.navigation.filter(link => publicApiEnabled || !link.href.startsWith('/dashboard/api')), footer: editable.footer.filter(link => publicApiEnabled || !link.href.startsWith('/dashboard/api')) }
  if (await isStoreEnabled()) return site
  const isShopLink = (link: { href: string }) => /^\/products(?:[/?#]|$)/.test(link.href)
  return {
    ...site,
    navigation: site.navigation.filter(link => !isShopLink(link)),
    footer: site.footer.filter(link => !isShopLink(link)),
    sections: site.sections.map(section => section.kind === 'products' ? { ...section, enabled: false } : section),
  }
})
