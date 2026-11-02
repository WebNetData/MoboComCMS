'use client'

import { useEffect, useState } from 'react'

const parts = (ms: number) => { const left = Math.max(0, Math.floor(ms / 1000)); return [['روز', Math.floor(left / 86_400)], ['ساعت', Math.floor(left / 3600) % 24], ['دقیقه', Math.floor(left / 60) % 60], ['ثانیه', left % 60]] as const }

/** Time left until the site reopens. Nothing is written until the browser has the clock, so server and client agree. */
export default function Countdown({ until }: { until: string }) {
  const end = new Date(until).getTime()
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const first = setTimeout(tick, 0), timer = setInterval(tick, 1000)
    return () => { clearTimeout(first); clearInterval(timer) }
  }, [])
  if (Number.isNaN(end) || now === null) return <div className="sn-count" aria-hidden="true" />
  if (end <= now) return <p className="sn-soon">همین حالا در حال بازگشت هستیم</p>
  return <div className="sn-count" role="timer" aria-label="زمان باقی‌مانده تا بازگشایی">{parts(end - now).map(([label, value]) => <div key={label}><b>{value.toLocaleString('fa-IR')}</b><span>{label}</span></div>)}</div>
}
