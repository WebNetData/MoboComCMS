'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Horizontal card slider: the track keeps its own layout class (e.g. md-rail,
 * sx-rail) and scroll-snap; the native scrollbar is hidden and replaced by
 * previous/next arrows that page by the visible width, fade edges that show
 * there is more, mouse drag and keyboard (←/→) support. Direction-aware (RTL).
 */
export default function Slider({ className, children, label, role, as = 'div' }: { className: string; children: ReactNode; label?: string; role?: string; as?: 'div' | 'nav' }) {
  const track = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ start: true, end: true })
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null)

  const measure = useCallback(() => {
    const el = track.current
    if (!el) return
    const offset = Math.abs(el.scrollLeft)
    const max = el.scrollWidth - el.clientWidth
    setEdges({ start: offset <= 2, end: offset >= max - 2 })
  }, [])

  useEffect(() => {
    const el = track.current
    if (!el) return
    measure()
    el.addEventListener('scroll', measure, { passive: true })
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => { el.removeEventListener('scroll', measure); observer.disconnect() }
  }, [measure])

  const page = (towardsEnd: boolean) => {
    const el = track.current
    if (!el) return
    const rtl = getComputedStyle(el).direction === 'rtl'
    const step = Math.max(160, el.clientWidth * 0.85) * (towardsEnd ? 1 : -1) * (rtl ? -1 : 1)
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollBy({ left: step, behavior: reduce ? 'auto' : 'smooth' })
  }

  const Tag = as
  return <div className={`sl${edges.start ? ' at-start' : ''}${edges.end ? ' at-end' : ''}${edges.start && edges.end ? ' is-static' : ''}`}>
    <Tag
      ref={track as React.RefObject<HTMLDivElement & HTMLElement>} className={`${className} sl-track`} role={role} aria-label={label}
      tabIndex={-1}
      onKeyDown={(event) => {
        const rtl = getComputedStyle(event.currentTarget).direction === 'rtl'
        if (event.key === 'ArrowLeft') { event.preventDefault(); page(rtl) }
        if (event.key === 'ArrowRight') { event.preventDefault(); page(!rtl) }
      }}
      onPointerDown={(event) => { if (event.pointerType === 'mouse' && track.current) drag.current = { x: event.clientX, left: track.current.scrollLeft, moved: false } }}
      onPointerMove={(event) => {
        const state = drag.current
        if (!state || !track.current) return
        const dx = event.clientX - state.x
        if (Math.abs(dx) > 6) { state.moved = true; track.current.classList.add('is-dragging') }
        if (state.moved) track.current.scrollLeft = state.left - dx
      }}
      onPointerUp={() => { track.current?.classList.remove('is-dragging'); setTimeout(() => { drag.current = null }, 0) }}
      onPointerLeave={() => { track.current?.classList.remove('is-dragging'); drag.current = null }}
      onClickCapture={(event) => { if (drag.current?.moved) { event.preventDefault(); event.stopPropagation() } }}
    >{children}</Tag>
    <button type="button" className="sl-btn is-prev" onClick={() => page(false)} disabled={edges.start} aria-label="قبلی" tabIndex={edges.start ? -1 : 0}>
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
    </button>
    <button type="button" className="sl-btn is-next" onClick={() => page(true)} disabled={edges.end} aria-label="بعدی" tabIndex={edges.end ? -1 : 0}>
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>
    </button>
  </div>
}
