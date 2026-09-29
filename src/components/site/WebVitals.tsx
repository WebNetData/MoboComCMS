'use client'

import { useReportWebVitals } from 'next/web-vitals'

// One page view in five reports its Web Vitals (real-user speed for the monitoring page).
const SAMPLED = typeof window !== 'undefined' && Math.random() < 0.2
const queue: { name: string; value: number; page: string }[] = []
let timer: ReturnType<typeof setTimeout> | null = null

function flush() {
  timer = null
  if (!queue.length) return
  const body = JSON.stringify(queue.splice(0, 10))
  if (!navigator.sendBeacon?.('/api/metrics/vitals', new Blob([body], { type: 'application/json' }))) void fetch('/api/metrics/vitals', { method: 'POST', body, keepalive: true }).catch(() => undefined)
}

export default function WebVitals() {
  useReportWebVitals((metric) => {
    if (!SAMPLED || window.location.pathname.startsWith('/admin')) return
    queue.push({ name: metric.name, value: Math.round(metric.value * (metric.name === 'CLS' ? 1000 : 1)) / (metric.name === 'CLS' ? 1000 : 1), page: window.location.pathname })
    timer ??= setTimeout(flush, 4000)
    if (metric.name === 'INP' || metric.name === 'CLS') addEventListener('pagehide', flush, { once: true })
  })
  return null
}
