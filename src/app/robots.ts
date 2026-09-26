import type { MetadataRoute } from 'next'
import { getSettings } from '@/modules/settings/server'
import { getSeoConfig } from '@/modules/seo/server/config'
import { AI_CRAWLERS, PRIVATE_PATHS } from '@/modules/seo/domain/seo'

export const dynamic = 'force-dynamic'

export default async function robots(): Promise<MetadataRoute.Robots> {
  const [settings, seo] = await Promise.all([getSettings().catch(() => null), getSeoConfig().catch(() => null)])
  const base = (settings?.siteUrl || process.env.NEXTAUTH_URL || 'http://localhost:3000').replace(/\/+$/, '')
  const allowAi = seo?.allowAiCrawlers !== false
  return {
    rules: [
      // Private areas are never indexed, by anyone.
      { userAgent: '*', allow: '/', disallow: PRIVATE_PATHS },
      // AI assistants and answer engines: same public pages, or nothing when turned off in the SEO center.
      { userAgent: [...AI_CRAWLERS], ...(allowAi ? { allow: ['/', '/llms.txt'], disallow: PRIVATE_PATHS } : { disallow: '/' }) },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  }
}
