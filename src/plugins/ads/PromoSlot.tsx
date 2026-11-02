'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from '@/platform/routing/navigation'
import { IMAGE_WIDTHS, sized } from '@/shared/media/image'

/** A banner stored on the site comes in the sizes the screen needs, not the file as it was uploaded. */
const widthsOf = (image: string) => sized(image, 480) === image ? undefined : IMAGE_WIDTHS.filter((width) => width >= 320).map((width) => `${sized(image, width)} ${width}w`).join(', ')

type Served = {
  ad: null | { id: number; kind: string; title: string; alt: string; image: string; imageMobile: string; text: string; cta: string; html: string; click: string; view: string; label: string; width: number; height: number; sticky: boolean }
  fallback: string
  reserve: { width: number; height: number } | null
}

const SANDBOX = 'allow-scripts allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation'
const flag = (placement: string) => `promo:has:${placement}`
const read = (key: string) => { try { return sessionStorage.getItem(key) } catch { return null } }
const write = (key: string, value: string) => { try { sessionStorage.setItem(key, value) } catch { /* private mode */ } }

// The slots a page mounts together ask together: one request for all of them, not one each (a page has up to ten).
type Waiting = { placement: string; resolve: (served: Served | null) => void }
const waiting = new Map<string, Waiting[]>()
function askServed(placement: string, path: string, lang: string): Promise<Served | null> {
  return new Promise((resolve) => {
    const key = `${path}\n${lang}`
    const batch = waiting.get(key)
    if (batch) { batch.push({ placement, resolve }); return }
    waiting.set(key, [{ placement, resolve }])
    setTimeout(() => {
      const asked = waiting.get(key) || []
      waiting.delete(key)
      const placements = [...new Set(asked.map((item) => item.placement))].slice(0, 16)
      const params = new URLSearchParams({ ps: placements.join(','), path, lang })
      fetch(`/api/promo/serve?${params}`, { cache: 'no-store' })
        .then((response) => (response.ok ? response.json() : null))
        .then((data: { ads?: Record<string, Served> } | null) => { for (const item of asked) item.resolve(data?.ads?.[item.placement] ?? null) })
        .catch(() => { for (const item of asked) item.resolve(null) })
    }, 0)
  })
}

/**
 * A promotion placement. It is filled after the page has loaded (so cached pages
 * never freeze an ad), keeps its space when the last visit showed one (no layout
 * jump), and counts an impression once the banner has been at least half visible
 * for a second. Themes can place it anywhere: <PromoSlot placement="sidebar" />.
 */
export default function PromoSlot({ placement, className = '' }: { placement: string; className?: string }) {
  const pathname = usePathname()
  const [served, setServed] = useState<Served | null>(null)
  const [closed, setClosed] = useState(false)
  const [expect, setExpect] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const counted = useRef('')

  useEffect(() => { setExpect(read(flag(placement)) === '1'); setClosed(read(`promo:closed:${placement}`) === '1') }, [placement])

  useEffect(() => {
    let alive = true
    askServed(placement, pathname || '/', document.documentElement.lang || 'fa').then((data) => {
      if (!alive) return
      setServed(data)
      write(flag(placement), data?.ad || data?.fallback ? '1' : '0')
    }).catch(() => undefined)
    return () => { alive = false }
  }, [placement, pathname])

  const ad = served?.ad || null
  useEffect(() => {
    const node = box.current
    if (!ad || !node || counted.current === ad.view) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting && entry.intersectionRatio >= 0.5) {
        timer = setTimeout(() => {
          if (counted.current === ad.view) return
          counted.current = ad.view
          const body = JSON.stringify({ t: ad.view })
          if (!navigator.sendBeacon?.('/api/promo/view', new Blob([body], { type: 'application/json' }))) void fetch('/api/promo/view', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true })
          observer.disconnect()
        }, 1000)
      } else clearTimeout(timer)
    }, { threshold: [0, 0.5, 1] })
    observer.observe(node)
    return () => { clearTimeout(timer); observer.disconnect() }
  }, [ad])

  // Nothing to show and nothing expected: no space at all.
  if (!served && !expect) return null
  if (served && !ad && !served.fallback) return null
  if (ad?.sticky && closed) return null
  const size = ad ? { width: ad.width, height: ad.height } : served?.reserve
  const ratio = size?.width && size.height ? { aspectRatio: `${size.width} / ${size.height}`, maxWidth: size.width } : undefined
  // A picture keeps its own shape: the placement caps its width, never forces its height (a 3:1 picture in a
  // 728×90 place was squeezed flat). The reserved box above still holds the space until it loads.
  const picture = size?.width ? { maxWidth: size.width, width: '100%', height: 'auto' } : undefined

  return (
    <aside ref={box} className={`promo-slot promo-${placement}${ad?.sticky ? ' is-sticky' : ''}${className ? ` ${className}` : ''}`} aria-label={ad?.label || 'تبلیغ'} data-placement={placement}>
      {ad?.sticky && <button type="button" className="promo-close" aria-label="بستن" onClick={() => { setClosed(true); write(`promo:closed:${placement}`, '1') }}>✕</button>}
      <div className="promo-frame" style={!ad && !served ? ratio : undefined}>
        {ad?.kind === 'IMAGE' && <a href={ad.click} target="_blank" rel="sponsored nofollow noopener noreferrer" className="promo-link">
          <picture>{ad.imageMobile && <source media="(max-width: 640px)" srcSet={ad.imageMobile} />}<img src={sized(ad.image, 1280)} srcSet={widthsOf(ad.image)} sizes="(max-width: 640px) 100vw, 1000px" alt={ad.alt || ad.title} width={ad.width || undefined} height={ad.height || undefined} loading="lazy" decoding="async" style={picture} /></picture>
        </a>}
        {ad?.kind === 'TEXT' && <a href={ad.click} target="_blank" rel="sponsored nofollow noopener noreferrer" className="promo-text"><b>{ad.title}</b>{ad.text && <span>{ad.text}</span>}{ad.cta && <em>{ad.cta}</em>}</a>}
        {ad?.kind === 'HTML' && <iframe title={ad.label} srcDoc={ad.html} sandbox={SANDBOX} loading="lazy" width={ad.width || undefined} height={ad.height || undefined} style={ratio} />}
        {!ad && served?.fallback && <iframe title="پیشنهاد" srcDoc={served.fallback} sandbox={SANDBOX} loading="lazy" width={served.reserve?.width || undefined} height={served.reserve?.height || undefined} style={ratio} />}
        {ad && <span className="promo-label">{ad.label}</span>}
      </div>
    </aside>
  )
}
