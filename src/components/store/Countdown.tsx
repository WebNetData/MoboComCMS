'use client'

import { useEffect, useState } from 'react'

const pad = (value: number) => String(value).padStart(2, '0').replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])

/** hh:mm:ss until the given moment (days are folded into hours, like Digikala). */
export default function Countdown({ until }: { until: string }) {
  const end = new Date(until).getTime()
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  // Render nothing until mounted so server and client markup agree.
  if (now === null || !Number.isFinite(end)) return <span className="sx-countdown" aria-hidden="true" />
  const left = Math.max(0, Math.floor((end - now) / 1000))
  const hours = Math.floor(left / 3600)
  const minutes = Math.floor((left % 3600) / 60)
  const seconds = left % 60
  return <span className="sx-countdown" role="timer" aria-label={`${hours} ساعت و ${minutes} دقیقه تا پایان پیشنهاد`}>
    <b>{pad(seconds)}</b><i>:</i><b>{pad(minutes)}</b><i>:</i><b>{pad(Math.min(hours, 99))}</b>
  </span>
}
