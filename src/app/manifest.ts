import type { MetadataRoute } from 'next'
import { getSiteSeo } from '@/modules/site/server/seo'

export const dynamic = 'force-dynamic'

/** Web app manifest: makes the site installable (Android, desktop, iOS "Add to Home Screen"). */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const seo = await getSiteSeo('fa')
  return {
    id: '/',
    name: seo.name,
    short_name: seo.name.slice(0, 12),
    description: seo.description,
    lang: 'fa',
    dir: 'rtl',
    start_url: '/?source=pwa',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#6d4aff',
    categories: ['shopping', 'entertainment', 'utilities'],
    icons: [
      { src: '/pwa-icon/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/pwa-icon/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/pwa-icon/512?maskable=1', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'جست‌وجو', url: '/search', icons: [{ src: '/pwa-icon/192', sizes: '192x192' }] },
      { name: 'نرم‌افزار', url: '/software' },
      { name: 'فروشگاه', url: '/products' },
      { name: 'علاقه‌مندی‌ها', url: '/favorites' },
    ],
  }
}
