'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from '@/components/AppLink'

export type HeroSlide = { id: number; slug: string; title: string; summary: string; backdrop: string; cover: string; screenshots: string[]; genres: string[]; score: number | null }

const INTERVAL = 7000

function Arrow({ dir }: { dir: 'prev' | 'next' }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{dir === 'next' ? <path d="m15 6-6 6 6 6" /> : <path d="m9 6 6 6-6 6" />}</svg>
}

/**
 * GameUp-style hero: the featured game's key art as a large banner, beside it
 * a panel with the title, four screenshots, the summary and a call to action.
 * Rotates every few seconds (paused on hover/focus and for reduced motion).
 */
export default function GameHero({ slides }: { slides: HeroSlide[] }) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const reduced = useRef(false)
  const count = slides.length
  const go = useCallback((delta: number) => setIndex((current) => (current + delta + count) % count), [count])

  useEffect(() => { reduced.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches }, [])
  useEffect(() => {
    if (count < 2 || paused || reduced.current) return
    const timer = setTimeout(() => go(1), INTERVAL)
    return () => clearTimeout(timer)
  }, [index, paused, count, go])

  if (!count) return null
  const slide = slides[index]
  const shots = slide.screenshots.length ? slide.screenshots : [slide.cover].filter(Boolean)
  return <section className="gx-hero" aria-roledescription="carousel" aria-label="بازی‌های ویژه" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocusCapture={() => setPaused(true)} onBlurCapture={() => setPaused(false)}>
    <div className="container gx-hero-grid">
      <Link href={`/games/${slide.slug}`} className="gx-hero-banner" aria-label={slide.title} style={{ backgroundImage: `url("${encodeURI(slide.backdrop || slide.cover)}")` }}>
        <span className="gx-hero-cta">مشاهدهٔ بازی</span>
      </Link>
      <div className="gx-hero-panel" aria-live="polite">
        <h2><Link href={`/games/${slide.slug}`}>{slide.title}</Link></h2>
        {shots.length > 0 && <div className={`gx-hero-shots is-${Math.min(shots.length, 4)}`}>{shots.slice(0, 4).map((src) => <img key={src} src={src} alt="" loading="lazy" />)}</div>}
        {slide.summary && <p>{slide.summary}</p>}
        <div className="gx-hero-meta">
          {slide.score !== null && <span className="gx-score">{slide.score.toLocaleString('fa-IR')}</span>}
          {slide.genres.slice(0, 2).map((genre) => <em key={genre}>{genre}</em>)}
          <Link href={`/games/${slide.slug}`} className="gx-btn">دانلود و نقد</Link>
        </div>
      </div>
      {count > 1 && <>
        <button type="button" className="gx-hero-arrow is-prev" aria-label="بازی قبلی" onClick={() => go(-1)}><Arrow dir="prev" /></button>
        <button type="button" className="gx-hero-arrow is-next" aria-label="بازی بعدی" onClick={() => go(1)}><Arrow dir="next" /></button>
        <div className="gx-hero-dots" role="tablist" aria-label="اسلایدها">{slides.map((item, i) => <button key={item.id} type="button" role="tab" aria-selected={i === index} aria-label={item.title} onClick={() => setIndex(i)} />)}</div>
      </>}
    </div>
  </section>
}
