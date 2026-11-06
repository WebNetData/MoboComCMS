import { appIcons } from '@/modules/site/domain/site-identity'
import type { MetadataRoute } from 'next'
import { getSiteSeo } from '@/modules/site/server/seo'

export const dynamic = 'force-dynamic'

/** Web app manifest: makes the site installable (Android, desktop, iOS "Add to Home Screen"). */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const seo = await getSiteSeo('fa')
  return {
    id: '/',
    name: seo.name,
    short_name: seo.identity.shortName || seo.name.slice(0, 12),
    description: seo.description,
    lang: 'fa',
    dir: 'rtl',
    start_url: '/?source=pwa',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: seo.identity.backgroundColor || '#ffffff',
    theme_color: seo.identity.themeColor || '#6d4aff',
    categories: ['shopping', 'entertainment', 'utilities'],
    icons: appIcons(seo.identity),
    shortcuts: [
      { name: 'جست‌وجو', url: '/search', icons: [{ src: '/pwa-icon/192', sizes: '192x192' }] },
      { name: 'نرم‌افزار', url: '/software' },
      { name: 'فروشگاه', url: '/products' },
      { name: 'علاقه‌مندی‌ها', url: '/favorites' },
    ],
  }
}
