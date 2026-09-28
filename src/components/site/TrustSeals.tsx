'use client'

import { useEffect, useRef, useState } from 'react'
import { useSite } from '@/components/site/SiteProvider'

/**
 * Footer strip of trust seals (eNamad, Samandehi, …). The issuers check the
 * Referer against the licensed domain, hence referrerPolicy="origin".
 */
export default function TrustSeals({ className = '' }: { className?: string }) {
  const site = useSite()
  const config = site.trustSeals
  if (!config?.seals.length) return null
  return <section className={`trust-seals ${className}`.trim()} aria-label={config.title || 'نمادهای اعتماد'}>
    {config.title && <h3 className="trust-seals-title">{config.title}</h3>}
    <ul>
      {config.seals.map((seal) => {
        const logo = <SealLogo src={seal.image} title={seal.title} />
        return <li key={seal.id} className={`trust-seal is-${seal.kind}`}>
          {seal.href ? <a href={seal.href} target="_blank" rel="noopener" referrerPolicy="origin" aria-label={seal.title}>{logo}</a> : logo}
        </li>
      })}
    </ul>
  </section>
}

/** The issuer's logo; if it does not load (wrong domain, issuer down) the seal's name is shown instead of an empty box. */
function SealLogo({ src, title }: { src: string; title: string }) {
  const [failed, setFailed] = useState(false)
  const ref = useRef<HTMLImageElement>(null)
  // The image may have failed before React attached onError (server-rendered markup).
  useEffect(() => { const img = ref.current; if (img?.complete && !img.naturalWidth) setFailed(true) }, [])
  if (failed) return <span className="trust-seal-fallback">{title}</span>
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={ref} src={src} alt={title} title={title} referrerPolicy="origin" loading="lazy" decoding="async" onError={() => setFailed(true)} onLoad={(e) => { if (!e.currentTarget.naturalWidth) setFailed(true) }} />
}
