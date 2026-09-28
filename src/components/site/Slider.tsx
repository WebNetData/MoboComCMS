'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Card slider for every horizontal rail. The track keeps its own layout class
 * (md-rail, sx-rail…) and scroll-snap; on top of it:
 * - glass previous/next arrows that page by the visible width,
 * - a page indicator (click a page to jump), shown when there is more than one page,
 * - soft edge fades on the side that has more cards (a mask, so it works on any background),
 * - mouse drag, ←/→ keys, native swipe on touch,
 * - optional autoplay that pauses on hover, focus and hidden tabs.
 * Direction-aware (RTL) and reduced-motion friendly.
 */
export default function Slider({ className, children, label, role, as = 'div', autoplay = 0 }: {
  className: string; children: ReactNode; label?: string; role?: string; as?: 'div' | 'nav'
  /** Milliseconds between automatic pages; 0 = off. */
  autoplay?: number
}) {
  const track = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null)
  const paused = useRef(false)
  const [state, setState] = useState({ start: true, end: true, pages: 1, page: 0, rtl: true })

  const measure = useCallback(() => {
    const el = track.current
    if (!el) return
    const rtl = getComputedStyle(el).direction === 'rtl'
    const offset = Math.abs(el.scrollLeft)
    const max = Math.max(0, el.scrollWidth - el.clientWidth)
    const pages = max > 2 ? Math.ceil(el.scrollWidth / el.clientWidth - 0.05) : 1
    const page = max > 2 ? Math.min(pages - 1, Math.round((offset / max) * (pages - 1))) : 0
    setState((current) => {
      const next = { start: offset <= 2, end: offset >= max - 2, pages, page, rtl }
      return current.start === next.start && current.end === next.end && current.pages === next.pages && current.page === next.page && current.rtl === next.rtl ? current : next
    })
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

  const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const scrollTo = useCallback((offset: number) => {
    const el = track.current
    if (!el) return
    const rtl = getComputedStyle(el).direction === 'rtl'
    el.scrollTo({ left: rtl ? -offset : offset, behavior: reduced() ? 'auto' : 'smooth' })
  }, [])
  const page = useCallback((towardsEnd: boolean) => {
    const el = track.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    const offset = Math.abs(el.scrollLeft)
    const step = Math.max(160, el.clientWidth * 0.9)
    // Autoplay wraps around at the end.
    if (towardsEnd && offset >= max - 2) { scrollTo(0); return }
    scrollTo(Math.min(max, Math.max(0, offset + (towardsEnd ? step : -step))))
  }, [scrollTo])
  const goTo = (index: number) => {
    const el = track.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    scrollTo(state.pages > 1 ? (max * index) / (state.pages - 1) : 0)
  }

  useEffect(() => {
    if (!autoplay || reduced()) return
    const timer = setInterval(() => { if (!paused.current && document.visibilityState === 'visible' && state.pages > 1) page(true) }, Math.max(2500, autoplay))
    return () => clearInterval(timer)
  }, [autoplay, page, state.pages])

  // Physical sides that hide more cards (for the fades).
  const moreLeft = state.rtl ? !state.end : !state.start
  const moreRight = state.rtl ? !state.start : !state.end
  const Tag = as
  const dots = state.pages > 1 && state.pages <= 14
  return <div
    className={`sl${state.start ? ' at-start' : ''}${state.end ? ' at-end' : ''}${state.pages <= 1 ? ' is-static' : ''}`}
    style={{ '--sl-fl': moreLeft ? '64px' : '0px', '--sl-fr': moreRight ? '64px' : '0px' } as React.CSSProperties}
    onMouseEnter={() => { paused.current = true }} onMouseLeave={() => { paused.current = false }}
    onFocusCapture={() => { paused.current = true }} onBlurCapture={() => { paused.current = false }}
  >
    <div className="sl-viewport">
      <Tag
        ref={track as React.RefObject<HTMLDivElement & HTMLElement>} className={`${className} sl-track`} role={role} aria-label={label}
        tabIndex={-1}
        onKeyDown={(event) => {
          const rtl = getComputedStyle(event.currentTarget).direction === 'rtl'
          if (event.key === 'ArrowLeft') { event.preventDefault(); page(rtl) }
          if (event.key === 'ArrowRight') { event.preventDefault(); page(!rtl) }
        }}
        onPointerDown={(event) => { if (event.pointerType === 'mouse' && event.button === 0 && track.current) drag.current = { x: event.clientX, left: track.current.scrollLeft, moved: false } }}
        onPointerMove={(event) => {
          const current = drag.current
          if (!current || !track.current) return
          const dx = event.clientX - current.x
          if (Math.abs(dx) > 6) { current.moved = true; track.current.classList.add('is-dragging') }
          if (current.moved) track.current.scrollLeft = current.left - dx
        }}
        onPointerUp={() => { track.current?.classList.remove('is-dragging'); setTimeout(() => { drag.current = null }, 0) }}
        onPointerLeave={() => { track.current?.classList.remove('is-dragging'); drag.current = null }}
        onClickCapture={(event) => { if (drag.current?.moved) { event.preventDefault(); event.stopPropagation() } }}
      >{children}</Tag>
      <button type="button" className="sl-btn is-prev" onClick={() => page(false)} disabled={state.start} aria-label="قبلی" tabIndex={state.start ? -1 : 0}>
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
      </button>
      <button type="button" className="sl-btn is-next" onClick={() => page(true)} disabled={state.end} aria-label="بعدی" tabIndex={state.end ? -1 : 0}>
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg>
      </button>
    </div>
    {dots && <div className="sl-dots" role="group" aria-label="صفحه‌های اسلایدر">
      {Array.from({ length: state.pages }, (_, index) => <button key={index} type="button" className={`sl-dot${index === state.page ? ' is-on' : ''}`} aria-label={`صفحهٔ ${(index + 1).toLocaleString('fa-IR')} از ${state.pages.toLocaleString('fa-IR')}`} aria-current={index === state.page ? 'true' : undefined} onClick={() => goTo(index)}>
        {index === state.page && autoplay > 0 && <i style={{ animationDuration: `${Math.max(2500, autoplay)}ms` }} />}
      </button>)}
    </div>}
  </div>
}
