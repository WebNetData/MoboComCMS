'use client'
import { useSite } from '@/components/site/SiteProvider'

/** The site's logo, or its first letter on the accent colour when no logo is set. */
export default function BrandMark() {
  const site = useSite()
  if (site.logo) return <img src={site.logo} alt="" width={31} height={31} style={{ width: 31, height: 31, objectFit: 'contain' }} />
  return <span aria-hidden="true" style={{ display: 'inline-grid', placeItems: 'center', width: 31, height: 31, borderRadius: 9, background: 'linear-gradient(135deg, var(--primary), color-mix(in srgb, var(--primary) 55%, #e8468f))', color: '#fff', fontWeight: 900, fontSize: 16, lineHeight: 1 }}>{site.brand.trim().slice(0, 1)}</span>
}
