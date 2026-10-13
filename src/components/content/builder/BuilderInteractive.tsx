'use client'

import { useEffect, useId, useRef, useState } from 'react'

// The three builder blocks that need the browser: tabs, numbers that count up when they come into view, and a
// countdown to a date. Each one is readable without script (all panels in order, the final number, the date)
// and does nothing a reader who asked for less motion would see moving.

const still = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function BuilderTabs({ tabs }: { tabs: { title: string; html: string }[] }) {
  const id = useId()
  const [active, setActive] = useState(0)
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  if (!tabs.length) return null
  const go = (index: number) => { const next = (index + tabs.length) % tabs.length; setActive(next); buttons.current[next]?.focus() }
  return <div className="br-tabs">
    <div className="br-tabs-list" role="tablist">
      {tabs.map((tab, index) => <button key={index} ref={(node) => { buttons.current[index] = node }} type="button" role="tab" id={`${id}-t${index}`} aria-controls={`${id}-p${index}`} aria-selected={active === index} tabIndex={active === index ? 0 : -1} className={active === index ? 'is-on' : ''}
        onClick={() => setActive(index)}
        onKeyDown={(event) => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); const rtl = getComputedStyle(event.currentTarget).direction === 'rtl'; go(index + ((event.key === 'ArrowLeft') === rtl ? 1 : -1)) } else if (event.key === 'Home') { event.preventDefault(); go(0) } else if (event.key === 'End') { event.preventDefault(); go(tabs.length - 1) } }}>{tab.title}</button>)}
    </div>
    {tabs.map((tab, index) => <div key={index} role="tabpanel" id={`${id}-p${index}`} aria-labelledby={`${id}-t${index}`} hidden={active !== index} tabIndex={0} className="br-tabs-panel br-rich" dangerouslySetInnerHTML={{ __html: tab.html }} />)}
  </div>
}

export function BuilderCounter({ value, suffix, locale }: { value: number; suffix: string; locale: string }) {
  const node = useRef<HTMLSpanElement>(null)
  const [shown, setShown] = useState(value)
  useEffect(() => {
    const el = node.current
    if (!el || still() || !('IntersectionObserver' in window) || !Number.isFinite(value) || value === 0) return
    let frame = 0
    setShown(0)
    const watch = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      watch.disconnect()
      const started = performance.now(), length = 1400
      const tick = (now: number) => {
        const t = Math.min(1, (now - started) / length), eased = 1 - Math.pow(1 - t, 3)
        setShown(Math.round(value * eased))
        if (t < 1) frame = requestAnimationFrame(tick)
      }
      frame = requestAnimationFrame(tick)
    }, { threshold: 0.4 })
    watch.observe(el)
    return () => { watch.disconnect(); cancelAnimationFrame(frame) }
  }, [value])
  return <span ref={node} className="num">{shown.toLocaleString(locale === 'fa' ? 'fa-IR' : 'en-US')}{suffix}</span>
}

const PARTS: [number, string, string][] = [[86_400_000, 'روز', 'days'], [3_600_000, 'ساعت', 'hours'], [60_000, 'دقیقه', 'minutes'], [1000, 'ثانیه', 'seconds']]

export function BuilderCountdown({ until, done, locale }: { until: string; done: string; locale: string }) {
  const target = Date.parse(until)
  // The first paint is the same on the server and in the browser (no clock yet); the clock starts after mounting.
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  if (!Number.isFinite(target)) return null
  const left = now === null ? null : Math.max(0, target - now)
  if (left === 0) return <p className="br-countdown-done" role="status">{done}</p>
  let rest = left ?? 0
  return <div className="br-countdown" role="timer" aria-live="off" aria-label={new Date(target).toLocaleString(locale === 'fa' ? 'fa-IR' : 'en-US')}>
    {PARTS.map(([size, fa, en]) => { const count = Math.floor(rest / size); rest -= count * size; return <div key={en} className="br-countdown-part"><strong className="num">{left === null ? '–' : count.toLocaleString(locale === 'fa' ? 'fa-IR' : 'en-US', { minimumIntegerDigits: 2 })}</strong><span>{locale === 'fa' ? fa : en}</span></div> })}
  </div>
}
