'use client'

import BrandMark from '@/components/BrandMark'
import { useSite } from '@/components/site/SiteProvider'
import type { SiteConfig } from '@/modules/site/config/types'

/** Whether the site has a wide logo (with its name in it): then the name is not written beside it. */
export const hasWordmark = (site: Pick<SiteConfig, 'wordmark'>) => Boolean(site.wordmark)

/**
 * The site's wide logo at a height, the dark version on dark pages (both are in the page; CSS shows the right one, so
 * there is no flash when the theme is read). `height` defaults to the owner's header setting; panels pass a smaller one.
 */
export function Wordmark({ height, className = '' }: { height?: number; className?: string }) {
  const site = useSite()
  if (!site.wordmark) return null
  const size = height ?? site.wordmarkHeight ?? 40
  return <span className={`site-wordmark${site.wordmarkDark ? ' has-dark' : ''} ${className}`} style={{ ['--wm-h' as string]: `${size}px` }}>
    <img className="wm-light" src={site.wordmark} alt={site.brand} height={size} decoding="async" />
    {site.wordmarkDark && <img className="wm-dark" src={site.wordmarkDark} alt="" aria-hidden="true" height={size} decoding="async" />}
  </span>
}

/** The brand in a panel's side bar or top bar: the wide logo when there is one, else the mark and the name. */
export default function BrandLockup({ height = 30 }: { height?: number }) {
  const site = useSite()
  if (site.wordmark) return <Wordmark height={Math.min(height, site.wordmarkHeight ?? height)} className="is-panel" />
  return <><span className="brand-mark"><BrandMark /></span> {site.brand}</>
}
