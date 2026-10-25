'use client'

import { useEffect, useState } from 'react'
import { sized } from '@/shared/media/image'
import Link from '@/components/AppLink'

export type HeroSlide = { slug: string; title: string; subtitle: string; summary: string; backdrop: string; poster: string; imdb: string; year: string; genres: string[]; badges: string[]; vip: boolean; kindLabel: string }

/** Filimo-style rotating hero with backdrop, meta and thumbnails. */
export default function CinemaHero({ slides, fa }: { slides: HeroSlide[]; fa: boolean }) {
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    if (paused || slides.length < 2) return
    const timer = setInterval(() => setActive((i) => (i + 1) % slides.length), 7000)
    return () => clearInterval(timer)
  }, [paused, slides.length])
  if (!slides.length) return null
  const slide = slides[active]
  return (
    <section className="cn-hero" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} aria-roledescription="carousel">
      {slides.map((s, i) => (
        <div key={s.slug} className={`cn-hero-bg${i === active ? ' is-active' : ''}`} style={s.backdrop ? { backgroundImage: `url("${s.backdrop.replace(/"/g, '%22')}")` } : undefined} aria-hidden="true" />
      ))}
      <div className="cn-hero-shade" aria-hidden="true" />
      <div className="container cn-hero-inner">
        <div className="cn-hero-copy" key={slide.slug}>
          <span className="md-eyebrow">{slide.kindLabel}</span>
          <h1>{slide.title}</h1>
          {slide.subtitle && <p className="cn-hero-sub" dir="ltr">{slide.subtitle}</p>}
          <div className="cn-meta">
            {slide.imdb && <span className="cn-imdb"><b>IMDb</b><span>{slide.imdb}</span></span>}
            {slide.year && <span>{slide.year}</span>}
            {slide.genres.map((g) => <span key={g}>{g}</span>)}
            {slide.badges.map((b) => <span key={b} className="cn-badge">{b}</span>)}
            {slide.vip && <span className="vip-chip">♛ VIP</span>}
          </div>
          {slide.summary && <p className="cn-hero-summary">{slide.summary}</p>}
          <div className="cn-hero-actions">
            <Link href={`/cinema/${slide.slug}#watch`} className="btn cn-btn-primary">▶ {fa ? 'تماشا و دانلود' : 'Watch & download'}</Link>
            <Link href={`/cinema/${slide.slug}`} className="btn cn-btn-ghost">{fa ? 'اطلاعات بیشتر' : 'More info'}</Link>
          </div>
        </div>
        {slides.length > 1 && (
          <div className="cn-hero-thumbs" role="tablist">
            {slides.map((s, i) => (
              <button key={s.slug} type="button" role="tab" aria-selected={i === active} className={i === active ? 'is-active' : ''} onClick={() => setActive(i)} aria-label={s.title}>
                {s.poster ? <img src={sized(s.poster, 160)} alt="" /> : <span>{i + 1}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
