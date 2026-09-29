'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import Link from '@/components/AppLink'

type Card = { id: number; amount: number; last4: string; code: string; state: 'ACTIVE' | 'REDEEMED' | 'DISABLED' | 'EXPIRED'; recipientName: string; recipientEmail: string; createdAt: string; expiresAt: string | null; redeemedAt: string | null }
type Data = { settings: { purchaseEnabled: boolean; amounts: number[]; minToman: number; maxToman: number; validityDays: number }; bought: Card[]; redeemed: Card[] }

const fa = (value: number) => value.toLocaleString('fa-IR')
const date = (value: string | null) => (value ? new Date(value).toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' }) : '—')
const STATE: Record<Card['state'], [string, string]> = { ACTIVE: ['قابل استفاده', 'is-ok'], REDEEMED: ['استفاده شد', ''], DISABLED: ['غیرفعال', 'is-bad'], EXPIRED: ['منقضی', 'is-bad'] }

async function post<T>(body: Record<string, unknown>): Promise<{ ok: true; data: T } | { ok: false; error: string; code?: string }> {
  const response = await fetch('/api/store/gift-cards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)
  const data = await response?.json().catch(() => null)
  if (!response) return { ok: false, error: 'ارتباط برقرار نشد' }
  return response.ok ? { ok: true, data: data as T } : { ok: false, error: data?.error || 'انجام نشد', code: data?.code }
}

function Redeem({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true); setNotice(null)
    const result = await post<{ amount: number }>({ op: 'redeem', code })
    setBusy(false)
    if (result.ok) { setNotice({ ok: true, text: `${fa(result.data.amount)} تومان به کیف پول شما اضافه شد.` }); setCode(''); onDone() } else setNotice({ ok: false, text: result.error })
  }
  return <form className="gc-hero" onSubmit={submit}>
    <div className="gc-hero-text">
      <h2>استفاده از کارت هدیه</h2>
      <p>کد ۱۶ نویسه‌ای کارت را وارد کنید؛ مبلغ آن فوراً به کیف پول شما اضافه می‌شود و در هر خریدی قابل استفاده است.</p>
    </div>
    <div className="gc-redeem">
      <input className="input gc-code" dir="ltr" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="XXXX-XXXX-XXXX-XXXX" aria-label="کد کارت هدیه" maxLength={24} autoComplete="off" spellCheck={false} />
      <button type="submit" className="btn btn-primary" disabled={busy || code.replace(/[\s-]/g, '').length < 16}>{busy ? 'در حال بررسی…' : 'ثبت کد'}</button>
    </div>
    {notice && <p className={`gc-notice ${notice.ok ? 'is-ok' : 'is-bad'}`} role="status">{notice.text}{notice.ok && <> — <Link href="/dashboard/wallet">کیف پول</Link></>}</p>}
  </form>
}

function Buy({ settings, onDone }: { settings: Data['settings']; onDone: (code: string) => void }) {
  const [amount, setAmount] = useState(settings.amounts[1] || settings.amounts[0] || settings.minToman)
  const [custom, setCustom] = useState('')
  const [form, setForm] = useState({ recipientName: '', recipientEmail: '', message: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ text: string; code?: string } | null>(null)
  const value = custom ? Number(custom.replace(/[^\d]/g, '')) : amount
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!window.confirm(`${fa(value)} تومان از کیف پول شما برای خرید کارت هدیه برداشته شود؟`)) return
    setBusy(true); setError(null)
    const result = await post<{ code: string; emailed?: boolean }>({ op: 'buy', toman: value, ...form, idempotencyKey: `gift-${Date.now()}-${Math.random().toString(36).slice(2, 10)}` })
    setBusy(false)
    if (result.ok) { onDone(result.data.code); setForm({ recipientName: '', recipientEmail: '', message: '' }); setCustom('') } else setError({ text: result.error, code: result.code })
  }
  return <form className="gc-buy card" onSubmit={submit}>
    <header><h2>خرید کارت هدیه</h2><small>از موجودی کیف پول پرداخت می‌شود · اعتبار {settings.validityDays ? `${fa(settings.validityDays)} روز` : 'بدون انقضا'}</small></header>
    <div className="gc-amounts" role="radiogroup" aria-label="مبلغ کارت">
      {settings.amounts.map((option) => <button key={option} type="button" role="radio" aria-checked={!custom && amount === option} className={!custom && amount === option ? 'is-active' : ''} onClick={() => { setAmount(option); setCustom('') }}><b className="num">{fa(option)}</b><small>تومان</small></button>)}
    </div>
    <label className="gc-field"><span>یا مبلغ دلخواه (تومان)</span><input className="input num" inputMode="numeric" value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^\d۰-۹]/g, '').replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))))} placeholder={`${fa(settings.minToman)} تا ${fa(settings.maxToman)}`} /></label>
    <div className="gc-two">
      <label className="gc-field"><span>نام گیرنده (اختیاری)</span><input className="input" value={form.recipientName} onChange={(e) => setForm({ ...form, recipientName: e.target.value })} maxLength={80} /></label>
      <label className="gc-field"><span>ایمیل گیرنده (اختیاری)</span><input className="input" dir="ltr" type="email" value={form.recipientEmail} onChange={(e) => setForm({ ...form, recipientEmail: e.target.value })} placeholder="friend@example.com" /></label>
    </div>
    <label className="gc-field"><span>پیام شما (اختیاری)</span><textarea className="input" rows={2} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} maxLength={300} placeholder="تولدت مبارک!" /></label>
    {error && <p className="gc-notice is-bad" role="alert">{error.text}{error.code === 'INSUFFICIENT_FUNDS' && <> — <Link href="/dashboard/wallet">شارژ کیف پول</Link></>}</p>}
    <button type="submit" className="btn btn-primary" disabled={busy || !value || value < settings.minToman || value > settings.maxToman}>{busy ? 'در حال صدور…' : `خرید کارت ${value ? fa(value) : ''} تومانی`}</button>
    <small className="muted">اگر ایمیل گیرنده را بنویسید، کارت با پیام شما برایش فرستاده می‌شود؛ کد همیشه در همین صفحه هم در دسترس است.</small>
  </form>
}

function CardVisual({ card }: { card: Card }) {
  const [shown, setShown] = useState(false)
  const [copied, setCopied] = useState(false)
  const [label, tone] = STATE[card.state]
  return <li className={`gc-card${card.state === 'ACTIVE' ? '' : ' is-muted'}`}>
    <div className="gc-card-top"><span>کارت هدیه</span><span className={`gc-state ${tone}`}>{label}</span></div>
    <b className="gc-card-amount num">{fa(card.amount)} <small>تومان</small></b>
    {card.code ? <div className="gc-card-code" dir="ltr">
      <code>{shown ? card.code : `••••-••••-••••-${card.last4}`}</code>
      <button type="button" onClick={() => setShown(!shown)} aria-label={shown ? 'پنهان کردن کد' : 'نمایش کد'}>{shown ? 'پنهان' : 'نمایش'}</button>
      <button type="button" onClick={() => { void navigator.clipboard?.writeText(card.code); setCopied(true); setTimeout(() => setCopied(false), 1500) }}>{copied ? 'کپی شد' : 'کپی'}</button>
    </div> : <div className="gc-card-code" dir="ltr"><code>••••-{card.last4}</code></div>}
    <small className="gc-card-meta">{card.recipientName || card.recipientEmail ? `برای ${card.recipientName || card.recipientEmail} · ` : ''}{card.redeemedAt ? `استفاده: ${date(card.redeemedAt)}` : card.expiresAt ? `اعتبار تا ${date(card.expiresAt)}` : `صدور: ${date(card.createdAt)}`}</small>
  </li>
}

export default function GiftCards() {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState('')
  const [fresh, setFresh] = useState('')
  const load = useCallback(async () => {
    const response = await fetch('/api/store/gift-cards', { cache: 'no-store' }).catch(() => null)
    const body = await response?.json().catch(() => null)
    if (response?.ok) { setData(body); setError('') } else setError(body?.error || 'بارگذاری نشد')
  }, [])
  useEffect(() => { void load() }, [load])
  return <div className="gc-page">
    <header className="gc-head"><h1 className="h2">کارت هدیه</h1><p className="muted">کارت هدیه بخرید و به دوستانتان هدیه دهید، یا کد کارتی را که گرفته‌اید به اعتبار کیف پول تبدیل کنید.</p></header>
    <Redeem onDone={() => void load()} />
    {error && <p className="gc-notice is-bad">{error}</p>}
    {fresh && <div className="gc-fresh" role="status"><b>کارت هدیه صادر شد</b><code dir="ltr">{fresh}</code><button type="button" className="btn btn-ghost btn-sm" onClick={() => void navigator.clipboard?.writeText(fresh)}>کپی کد</button></div>}
    {!data ? <div className="gc-skeleton" aria-busy="true" /> : <div className="gc-grid">
      {data.settings.purchaseEnabled && data.settings.amounts.length > 0 ? <Buy settings={data.settings} onDone={(code) => { setFresh(code); void load() }} /> : <div className="card gc-buy"><h2>خرید کارت هدیه</h2><p className="muted">خرید کارت هدیه در حال حاضر فعال نیست.</p></div>}
      <section className="gc-lists">
        <h2>کارت‌هایی که خریده‌اید</h2>
        {data.bought.length ? <ul className="gc-cards">{data.bought.map((card) => <CardVisual key={card.id} card={card} />)}</ul> : <p className="muted gc-empty">هنوز کارتی نخریده‌اید.</p>}
        <h2>کارت‌هایی که استفاده کرده‌اید</h2>
        {data.redeemed.length ? <ul className="gc-cards">{data.redeemed.map((card) => <CardVisual key={card.id} card={card} />)}</ul> : <p className="muted gc-empty">هنوز کارتی استفاده نکرده‌اید.</p>}
      </section>
    </div>}
  </div>
}
