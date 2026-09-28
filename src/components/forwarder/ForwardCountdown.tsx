'use client'

import { useEffect, useState } from 'react'

/** Circular countdown; opens the destination at zero (or waits for a click). */
export default function ForwardCountdown({ url, seconds, auto }: { url: string; seconds: number; auto: boolean }) {
  const [left, setLeft] = useState(seconds)
  useEffect(() => {
    if (left <= 0) { if (auto) window.location.replace(url); return }
    const timer = setTimeout(() => setLeft((value) => value - 1), 1000)
    return () => clearTimeout(timer)
  }, [left, auto, url])
  const progress = seconds > 0 ? 1 - left / seconds : 1
  const circumference = 2 * Math.PI * 44
  return <div className="fw-count">
    <div className="fw-ring" role="timer" aria-live="polite" aria-label={left > 0 ? `${left} ثانیه تا انتقال` : 'آماده'}>
      <svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="44" className="fw-ring-bg" /><circle cx="50" cy="50" r="44" className="fw-ring-fg" style={{ strokeDasharray: circumference, strokeDashoffset: circumference * (1 - progress) }} /></svg>
      <b>{left > 0 ? left.toLocaleString('fa-IR') : '✓'}</b>
    </div>
    <a href={url} rel="noopener nofollow" className={`fw-go${left > 0 ? ' is-wait' : ''}`} aria-disabled={left > 0} onClick={(event) => { if (left > 0) event.preventDefault() }}>
      {left > 0 ? `${left.toLocaleString('fa-IR')} ثانیه تا انتقال…` : 'رفتن به سایت مقصد'}
    </a>
  </div>
}
