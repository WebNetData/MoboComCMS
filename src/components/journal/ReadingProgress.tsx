'use client'

import { useEffect, useRef } from 'react'

/**
 * How far the reader is through the article: a thin bar under the top of the window. It measures the article body
 * itself, not the whole page, so comments and the footer do not count. The width is written straight to the
 * element on scroll (no re-render); decoration only, so it is hidden from assistive technology.
 */
export default function ReadingProgress({ targetId = 'article-body' }: { targetId?: string }) {
  const bar = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const target = document.getElementById(targetId)
    if (!target || !bar.current) return
    let frame = 0
    const measure = () => {
      frame = 0
      const box = target.getBoundingClientRect()
      const span = box.height - window.innerHeight * 0.6
      const done = span > 0 ? Math.min(1, Math.max(0, -box.top / span)) : box.top < 0 ? 1 : 0
      if (bar.current) bar.current.style.transform = `scaleX(${done})`
      document.documentElement.style.setProperty('--jp-read', String(Math.round(done * 100)))
    }
    const queue = () => { if (!frame) frame = requestAnimationFrame(measure) }
    measure()
    window.addEventListener('scroll', queue, { passive: true })
    window.addEventListener('resize', queue)
    return () => { window.removeEventListener('scroll', queue); window.removeEventListener('resize', queue); if (frame) cancelAnimationFrame(frame); document.documentElement.style.removeProperty('--jp-read') }
  }, [targetId])

  return <div className="jp-progress no-print" aria-hidden="true"><span ref={bar} /></div>
}
