'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

export type JournalSlide = {
  href: string
  image: string
  category: string
  title: string
  excerpt?: string
  meta?: string[]
}

type Labels = {
  previous: string
  next: string
  slide: string
}

const AUTOPLAY_MS = 6500

export default function JournalHeroSlider({ slides, labels }: { slides: JournalSlide[]; labels: Labels }) {
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  const count = slides.length
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (count < 2 || paused) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    timer.current = setInterval(() => setActive((current) => (current + 1) % count), AUTOPLAY_MS)
    return () => {
      if (timer.current) clearInterval(timer.current)
    }
  }, [count, paused])

  if (count === 0) return null

  const go = (next: number) => setActive((next + count) % count)

  return (
    <section
      className="ln-hero"
      aria-roledescription="carousel"
      aria-label={labels.slide}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="ln-hero-stage">
        {slides.map((slide, index) => (
          <Link
            key={`${slide.href}-${index}`}
            href={slide.href}
            className={`ln-hero-slide${index === active ? ' is-active' : ''}`}
            aria-hidden={index !== active}
            tabIndex={index === active ? 0 : -1}
          >
            <span className="ln-hero-art">
              <img src={slide.image} alt="" loading={index === 0 ? 'eager' : 'lazy'} decoding="async" />
            </span>
            <span className="ln-hero-copy">
              <span className="ln-badge">{slide.category}</span>
              <strong className="ln-hero-title">{slide.title}</strong>
              {slide.excerpt && <em className="ln-hero-excerpt">{slide.excerpt}</em>}
              {slide.meta && (
                <span className="ln-meta">
                  {slide.meta.map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </span>
              )}
            </span>
          </Link>
        ))}

        {count > 1 && (
          <>
            <button type="button" className="ln-hero-arrow is-prev" aria-label={labels.previous} onClick={() => go(active - 1)}>
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <button type="button" className="ln-hero-arrow is-next" aria-label={labels.next} onClick={() => go(active + 1)}>
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M15 5l-7 7 7 7" />
              </svg>
            </button>
            <div className="ln-hero-progress" aria-hidden="true">
              <span style={{ width: `${((active + 1) / count) * 100}%` }} />
            </div>
          </>
        )}
      </div>

      {count > 1 && (
        <div className="ln-hero-thumbs">
          {slides.map((slide, index) => (
            <button
              key={`thumb-${slide.href}-${index}`}
              type="button"
              className={index === active ? 'is-active' : ''}
              aria-label={`${labels.slide} ${index + 1}`}
              aria-current={index === active}
              onClick={() => setActive(index)}
            >
              <span className="ln-hero-thumb-art">
                <img src={slide.image} alt="" loading="lazy" decoding="async" />
              </span>
              <span className="ln-hero-thumb-copy">
                <span className="ln-badge">{slide.category}</span>
                <strong>{slide.title}</strong>
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
