'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from '@/components/AppLink'

export type Slide = { src: string; eyebrow: string; title: string; text: string; label: string; href: string; label2: string; href2: string }

/**
 * A full-width slider: one slide in view, moved by arrows, dots, a swipe or the arrow keys (which follow the page's
 * direction). It plays by itself only while the visitor is not pointing at it, typing in it or reading another tab,
 * shows how long until the next slide, and can be paused. Those who ask for less motion get still slides that only
 * change when they say so. Slides out of view are inert, so the keyboard never lands in a hidden one.
 */
export default function BuilderSlides({ slides, effect, autoplay, height, overlay, align, fa }: {
  slides: Slide[]; effect: string; autoplay: number; height: string; overlay: string; align: string; fa: boolean
}) {
  const count = slides.length
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [held, setHeld] = useState(false)
  const [calm, setCalm] = useState(false)
  const [hidden, setHidden] = useState(false)
  const root = useRef<HTMLElement>(null)
  const start = useRef<number | null>(null)
  const go = useCallback((to: number) => setIndex(((to % count) + count) % count), [count])

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const read = () => setCalm(query.matches)
    read(); query.addEventListener('change', read)
    const visible = () => setHidden(document.visibilityState === 'hidden')
    document.addEventListener('visibilitychange', visible)
    return () => { query.removeEventListener('change', read); document.removeEventListener('visibilitychange', visible) }
  }, [])

  const playing = autoplay > 0 && count > 1 && !paused && !held && !calm && !hidden
  useEffect(() => {
    if (!playing) return
    const timer = window.setTimeout(() => go(index + 1), autoplay * 1000)
    return () => window.clearTimeout(timer)
  }, [playing, index, autoplay, go])

  if (!count) return null
  const rtl = () => (root.current ? getComputedStyle(root.current).direction === 'rtl' : fa)
  const L = (faText: string, en: string) => (fa ? faText : en)
  const onKey = (event: React.KeyboardEvent) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const forward = (event.key === 'ArrowRight') !== rtl()
    go(index + (forward ? 1 : -1))
  }
  const onPointerUp = (event: React.PointerEvent) => {
    if (start.current === null) return
    const delta = event.clientX - start.current
    start.current = null
    if (Math.abs(delta) < 40) return
    const forward = (delta < 0) !== rtl()
    go(index + (forward ? 1 : -1))
  }

  return <section
    ref={root}
    className={`br-slides is-${effect} h-${height} ov-${overlay} al-${align}${playing ? ' is-playing' : ''}`}
    style={{ ['--br-i' as string]: index, ['--br-autoplay' as string]: `${autoplay}s` }}
    aria-roledescription={L('اسلایدر', 'carousel')}
    aria-label={slides[0]?.title || L('اسلایدر', 'Slider')}
    tabIndex={0}
    onKeyDown={onKey}
    onMouseEnter={() => setHeld(true)} onMouseLeave={() => setHeld(false)}
    onFocus={() => setHeld(true)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setHeld(false) }}
    onPointerDown={(event) => { if (event.pointerType !== 'mouse') start.current = event.clientX }}
    onPointerUp={onPointerUp} onPointerCancel={() => { start.current = null }}
  >
    <div className="br-slides-track">
      {slides.map((slide, at) => {
        const on = at === index
        return <div key={at} className={`br-sld${on ? ' is-on' : ''}`} role="group" aria-roledescription={L('اسلاید', 'slide')} aria-label={L(`${(at + 1).toLocaleString('fa-IR')} از ${count.toLocaleString('fa-IR')}`, `${at + 1} of ${count}`)} aria-hidden={!on} inert={!on}>
          {slide.src && <img className="br-sld-bg" src={slide.src} alt="" loading={at ? 'lazy' : 'eager'} decoding="async" />}
          <div className="br-sld-copy">
            {slide.eyebrow && <span className="br-sld-eyebrow">{slide.eyebrow}</span>}
            {slide.title && (at === 0 ? <h2>{slide.title}</h2> : <h3 className="br-sld-title">{slide.title}</h3>)}
            {slide.text && <p>{slide.text}</p>}
            {(slide.label || slide.label2) && <div className="br-sld-actions">
              {slide.label && <Link className="btn btn-primary" href={slide.href}>{slide.label}</Link>}
              {slide.label2 && <Link className="btn br-sld-ghost" href={slide.href2}>{slide.label2}</Link>}
            </div>}
          </div>
        </div>
      })}
    </div>
    {count > 1 && <>
      <button type="button" className="br-slides-arrow is-prev" aria-label={L('اسلاید قبلی', 'Previous slide')} onClick={() => go(index - 1)}><span aria-hidden="true" /></button>
      <button type="button" className="br-slides-arrow is-next" aria-label={L('اسلاید بعدی', 'Next slide')} onClick={() => go(index + 1)}><span aria-hidden="true" /></button>
      <div className="br-slides-foot">
        <div className="br-slides-dots" role="group" aria-label={L('انتخاب اسلاید', 'Choose a slide')}>
          {slides.map((slide, at) => <button key={at} type="button" aria-label={L(`اسلاید ${(at + 1).toLocaleString('fa-IR')}`, `Slide ${at + 1}`)} aria-current={at === index ? 'true' : undefined} onClick={() => go(at)}>{at === index && playing && <i key={index} className="br-slides-progress" />}</button>)}
        </div>
        {autoplay > 0 && !calm && <button type="button" className="br-slides-pause" aria-pressed={paused} aria-label={paused ? L('ادامهٔ پخش خودکار', 'Resume autoplay') : L('توقف پخش خودکار', 'Pause autoplay')} onClick={() => setPaused(!paused)}><span aria-hidden="true" className={paused ? 'is-play' : ''} /></button>}
      </div>
    </>}
  </section>
}
