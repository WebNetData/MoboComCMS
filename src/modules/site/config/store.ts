import { cache } from 'react'
import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { defaultSite } from './defaults'
import { validateSite } from './validation'
import { isStoreEnabled } from '@/modules/catalog/server/storefront'
import { isPublicApiEnabled } from '@/modules/public-api/server/availability'
import { normalizeTrustSeals, visibleSeals } from './trust-seals'
import { hideDisabledModules } from './visibility'
import { filterSiteMenus } from './menus'
import { getPublicExtensionRuntime } from '@/extensions/server/state'
import { createSectionSettingsHistory, type SectionSettingsContext } from '@/modules/settings/server/section-history'
export const SITE_KEY = 'site.config.v1'
export const TRUST_SEALS_KEY = 'site.trust-seals.v1'

export async function getTrustSeals() {
  const row = await db.setting.findUnique({ where: { key: TRUST_SEALS_KEY } }).catch(() => null)
  try { return normalizeTrustSeals(row ? JSON.parse(row.value) : {}) } catch { return normalizeTrustSeals({}) }
}

const sealsHistory = () => createSectionSettingsHistory(TRUST_SEALS_KEY, 'settings-trust-seals', normalizeTrustSeals, config => ({ enabled: config.enabled, seals: config.seals.map((seal) => `${seal.kind}:${seal.enabled ? 'on' : 'off'}`) }), { action: 'trust_seals.update', targetId: TRUST_SEALS_KEY })
export const trustSealsSettingsState = () => sealsHistory().current()
export const restoreTrustSealsSettings = (...args: Parameters<ReturnType<typeof sealsHistory>['restore']>) => sealsHistory().restore(...args)

export async function saveTrustSeals(input: unknown, context?: SectionSettingsContext) {
  return sealsHistory().save(input, context)
}
/** Strict mutation reads never overwrite corrupt configuration with rendering defaults. */
export async function getSiteConfigFrom(reader: Pick<Prisma.TransactionClient, 'setting'>, strict = false) {
  const row = await reader.setting.findUnique({ where: { key: SITE_KEY } })
  if (row) {
    try { const parsed: unknown = JSON.parse(row.value); if (validateSite(parsed)) return parsed } catch { /* Invalid old data falls back to the complete default document. */ }
  }
  if (row && strict) throw new Error('site configuration has invalid stored data; repair it before changing it')
  const legacy = await reader.setting.findMany({ where: { key: { in: ['brandName', 'brandTagline'] } } })
  const values = Object.fromEntries(legacy.map(r => [r.key, r.value]))
  return { ...defaultSite, brand: values.brandName || defaultSite.brand, tagline: { ...defaultSite.tagline, fa: values.brandTagline || defaultSite.tagline.fa } }
}
export const getSiteConfig = cache(() => getSiteConfigFrom(db))

/** Filter only public rendering; keep the editable configuration intact. */
export const getPublicSiteConfig = cache(async () => {
  // Menus, the announcement and home sections that lead into a switched-off module are left out of the public copy.
  const runtime = await getPublicExtensionRuntime().catch(() => ({}))
  const saved = await getSiteConfig()
  const editable = hideDisabledModules({ ...saved, footerExplore: saved.footerExplore ?? saved.navigation }, runtime)
  const [publicApiEnabled, seals] = await Promise.all([isPublicApiEnabled(), getTrustSeals()])
  const shown = visibleSeals(seals)
  const trustSeals = shown.length ? { title: seals.title, seals: shown.map(({ id, kind, title, href, image }) => ({ id, kind, title, href, image })) } : undefined
  const site = { ...filterSiteMenus(editable, link => publicApiEnabled || !link.href.startsWith('/dashboard/api')), publicApiEnabled, trustSeals }
  if (await isStoreEnabled()) return site
  const isShopLink = (link: { href: string }) => /^\/products(?:[/?#]|$)/.test(link.href)
  return {
    ...filterSiteMenus(site, link => !isShopLink(link)),
    sections: site.sections.map(section => section.kind === 'products' ? { ...section, enabled: false } : section),
  }
})
