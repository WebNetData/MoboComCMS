import type { MetadataRoute } from 'next'
import { getSettings } from '@/modules/settings/server'

export const dynamic = 'force-dynamic'

export default async function robots(): Promise<MetadataRoute.Robots> {
  const settings = await getSettings().catch(() => null)
  const base = (settings?.siteUrl || process.env.NEXTAUTH_URL || 'http://localhost:3000').replace(/\/+$/, '')

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // private areas must never be indexed
        disallow: ['/admin', '/builder-preview/', '/dashboard', '/api/', '/invoice/', '/login', '/register', '/payment/'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  }
}
