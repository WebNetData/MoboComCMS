'use client'

import Link from '@/components/AppLink'
import { useEffect, useState } from 'react'
import type { StoreSlide } from '@/modules/store/domain/store'

/** Shop landing carousel (auto-advances; pauses on hover/focus and for reduced motion). */
export default function StoreSlider({ slides }: { slides: StoreSlide[] }) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    if (slides.length < 2 || paused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = setInterval(() => setIndex((current) => (current + 1) % slides.length), 6000)
    return () => clearInterval(timer)
  }, [slides.length, paused])
  if (!slides.length) return null
  const go = (next: number) => setIndex((next + slides.length) % slides.length)
  return <section className="sx-slider" aria-roledescription="carousel" aria-label="پیشنهادهای ویژه" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
    {slides.map((slide, i) => {
      const inner = <>
        {slide.image && <img src={slide.image} alt="" loading={i === 0 ? 'eager' : 'lazy'} />}
        {(slide.title || slide.subtitle) && <span className="sx-slide-copy">
          {slide.title && <b>{slide.title}</b>}
          {slide.subtitle && <small>{slide.subtitle}</small>}
          {slide.cta && slide.href && <em>{slide.cta}</em>}
        </span>}
      </>
      return <div key={i} className={`sx-slide${i === index ? ' is-active' : ''}`} role="group" aria-roledescription="slide" aria-label={`${(i + 1).toLocaleString('fa-IR')} از ${slides.length.toLocaleString('fa-IR')}`} aria-hidden={i !== index}>
        {slide.href ? <Link href={slide.href} tabIndex={i === index ? 0 : -1}>{inner}</Link> : inner}
      </div>
    })}
    {slides.length > 1 && <>
      <button type="button" className="sx-slider-nav is-prev" aria-label="اسلاید قبلی" onClick={() => go(index - 1)}>‹</button>
      <button type="button" className="sx-slider-nav is-next" aria-label="اسلاید بعدی" onClick={() => go(index + 1)}>›</button>
      <div className="sx-slider-dots">{slides.map((_, i) => <button key={i} type="button" aria-label={`اسلاید ${(i + 1).toLocaleString('fa-IR')}`} aria-current={i === index} onClick={() => go(i)} />)}</div>
    </>}
  </section>
}
