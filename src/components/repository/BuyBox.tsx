'use client'

import { useState } from 'react'
import Link from '@/components/AppLink'

const requestId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().replace(/-/g, '') : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`)

/** Buys a paid product from the wallet; shows the wallet shortfall and the login prompt where they apply. */
export default function BuyBox({ productId, name, priceLabel, free }: { productId: number; name: string; priceLabel: string; free: boolean }) {
  const [id] = useState(requestId)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<{ text: string; shortfall?: number; login?: boolean } | null>(null)
  async function buy() {
    setBusy(true); setError(null)
    const response = await fetch('/api/repo/mine', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'buy', productId, requestId: id }) }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy(false)
    if (response?.ok) { setDone(true); return }
    setError({ text: data?.error || 'خرید انجام نشد', shortfall: typeof data?.shortfall === 'number' ? data.shortfall : undefined, login: response?.status === 401 })
  }
  if (free) return <div className="rp-buy"><b>رایگان</b><p className="sa-hint">سایت شما از «مخزن افزونه و قالب» در پنل مدیریت به این مخزن وصل می‌شود و آن را با یک کلیک نصب می‌کند؛ لایسنس لازم نیست.</p></div>
  if (done) return <div className="rp-buy" role="status"><b>خرید انجام شد ✓</b><p>کلید لایسنس شما در پنل کاربری آماده است.</p><Link className="btn btn-primary" href="/dashboard/licenses">لایسنس‌های من</Link></div>
  return <div className="rp-buy">
    <b className="rp-price">{priceLabel}</b>
    <p className="sa-hint">پرداخت از کیف پول شما انجام می‌شود. لایسنس پس از خرید بلافاصله ساخته می‌شود.</p>
    {error && <p role="alert" className="error-text">{error.text}{error.login && <> — <Link href={`/login?next=${encodeURIComponent(typeof window === 'undefined' ? '/repository' : window.location.pathname)}`} className="sa-link">ورود</Link></>}{error.shortfall ? <> — <Link href="/dashboard/wallet" className="sa-link">شارژ کیف پول ({error.shortfall.toLocaleString('fa-IR')} تومان کم دارید)</Link></> : null}</p>}
    <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void buy()} aria-label={`خرید ${name}`}>{busy ? 'کمی صبر کنید…' : 'خرید با کیف پول'}</button>
  </div>
}
