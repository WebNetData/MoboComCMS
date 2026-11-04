'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import { startCheckout } from '@/modules/checkout/ui/client'

type Result = { name: string; display: string; suffix: string; state: 'available' | 'taken' | 'unknown'; register: number; renew: number; transfer: number; years: number[]; needsHandle: boolean }
const nf = (value: number) => Math.round(value).toLocaleString('fa-IR')
const STATE = { available: ['آزاد است', 'is-free'], taken: ['ثبت شده', 'is-taken'], unknown: ['قابل سفارش', 'is-unknown'] } as const

function OrderSheet({ result, transfer, signedIn, onClose }: { result: Result; transfer: boolean; signedIn: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [years, setYears] = useState(result.years[0] || 1)
  const [handle, setHandle] = useState('')
  const [authCode, setAuthCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Opened once; leaving the page removes the element, which closes it (no cleanup: React runs effects twice in dev).
  useEffect(() => { const node = dialog.current; if (node && !node.open) node.showModal() }, [])
  const total = transfer ? result.transfer : result.register * years

  async function order(event: FormEvent) {
    event.preventDefault()
    setBusy(true); setError('')
    try {
      const outcome = await startCheckout({ domainOrder: { name: result.name, years, transfer, handle: handle.trim(), authCode: authCode.trim() } })
      if (!outcome.ok) { if (outcome.code === 'GATEWAY_AMBIGUOUS' && outcome.invoiceUrl) { window.location.assign(outcome.invoiceUrl); return } setError(outcome.code === 'NO_GATEWAY' ? 'موجودی کیف پول کافی نیست و درگاه پرداختی فعال نیست.' : outcome.message || 'سفارش ثبت نشد'); return }
      const destination = outcome.paid ? `/payment/result?invoice=${encodeURIComponent(outcome.invoiceNumber)}` : outcome.paymentUrl || outcome.invoiceUrl
      if (destination) window.location.assign(destination)
    } catch { setError('ارتباط با سرور برقرار نشد؛ دوباره امتحان کنید.') } finally { setBusy(false) }
  }

  return <dialog ref={dialog} className="hx-order dx-order" aria-labelledby="dx-order-title" onClose={onClose} onClick={(event) => { if (event.target === dialog.current) dialog.current?.close() }}>
    <form method="dialog" className="hx-order-body" onSubmit={(event) => void order(event)}>
      <header className="hx-order-head">
        <span className="hx-plan-kind">{transfer ? 'انتقال دامنه' : 'ثبت دامنه'}</span>
        <h2 id="dx-order-title" dir="ltr">{result.display}</h2>
        <button type="button" className="hx-order-close" aria-label="بستن" onClick={() => dialog.current?.close()}><Icon name="close" size={18} /></button>
      </header>
      {!transfer && <fieldset className="hx-order-terms"><legend>مدت ثبت</legend><div>{result.years.map((y) => <label key={y} className={years === y ? 'is-on' : ''}>
        <input type="radio" name="years" checked={years === y} onChange={() => setYears(y)} /><b>{nf(y)} سال</b><span className="num">{nf(result.register * y)} تومان</span>
      </label>)}</div></fieldset>}
      {result.needsHandle && <label className="hx-order-field"><span>شناسهٔ ایرنیک *</span>
        <input className="input" dir="ltr" required value={handle} maxLength={40} autoComplete="off" spellCheck={false} placeholder="ab1234-irnic" onChange={(event) => setHandle(event.target.value)} />
        <small>دامنه‌های .ir به نام شناسهٔ ایرنیک شما ثبت می‌شوند. اگر شناسه ندارید، رایگان در nic.ir بسازید.</small>
      </label>}
      {transfer && !result.needsHandle && <label className="hx-order-field"><span>کد انتقال (Auth code) *</span>
        <input className="input" dir="ltr" required value={authCode} maxLength={200} autoComplete="off" spellCheck={false} onChange={(event) => setAuthCode(event.target.value)} />
        <small>این کد را از ثبت‌کنندهٔ فعلی دامنه بگیرید و قفل انتقال را باز کنید.</small>
      </label>}
      <div className="hx-order-total">
        <span>مبلغ قابل پرداخت</span>
        <b className="num">{nf(total)} تومان</b>
        <small>تمدید سالانه {nf(result.renew)} تومان. ابتدا از موجودی کیف پول استفاده می‌شود.</small>
        {result.state === 'unknown' && <small>آزاد بودن این دامنه هنگام ثبت بررسی می‌شود؛ اگر ثبت نشد، مبلغ کامل به کیف پول برمی‌گردد.</small>}
      </div>
      {error && <p className="hx-order-error" role="alert">{error}</p>}
      {signedIn
        ? <button type="submit" className="btn btn-primary hx-order-pay" disabled={busy}>{busy ? 'در حال ثبت…' : transfer ? 'پرداخت و انتقال' : 'پرداخت و ثبت'}</button>
        : <Link className="btn btn-primary hx-order-pay" href="/login?next=%2Fdomains">ورود برای سفارش</Link>}
    </form>
  </dialog>
}

/** The domain search: one box, results on every featured extension, and the order sheet. */
export default function DomainSearch({ signedIn, initial = '' }: { signedIn: boolean; initial?: string }) {
  const [query, setQuery] = useState(initial)
  const [results, setResults] = useState<Result[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<'register' | 'transfer'>('register')
  const [ordering, setOrdering] = useState<{ result: Result; transfer: boolean } | null>(null)

  async function search(event?: FormEvent) {
    event?.preventDefault()
    const q = query.trim()
    if (!q) return
    setBusy(true); setError('')
    try {
      const response = await fetch(`/api/hosting/domains/search?q=${encodeURIComponent(q)}`, { cache: 'no-store' })
      const data = await response.json().catch(() => null)
      if (!response.ok) { setError(String(data?.error || 'جست‌وجو انجام نشد')); setResults(null); return }
      setResults(data.results || []); setError(String(data.error || ''))
    } catch { setError('ارتباط با سرور برقرار نشد') } finally { setBusy(false) }
  }

  return <div className="dx-search">
    <div className="dx-modes" role="tablist" aria-label="نوع سفارش">
      <button type="button" role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'is-on' : ''} onClick={() => setMode('register')}>ثبت دامنهٔ تازه</button>
      <button type="button" role="tab" aria-selected={mode === 'transfer'} className={mode === 'transfer' ? 'is-on' : ''} onClick={() => setMode('transfer')}>انتقال دامنه</button>
    </div>
    <form className="dx-box" role="search" onSubmit={(event) => void search(event)}>
      <Icon name="globe" size={22} />
      <input dir="ltr" aria-label={mode === 'transfer' ? 'دامنه‌ای که می‌خواهید منتقل کنید' : 'نام دامنهٔ دلخواه'} value={query} maxLength={253} autoComplete="off" spellCheck={false} placeholder={mode === 'transfer' ? 'yourdomain.com' : 'نام دلخواه… مثلاً mybrand'} onChange={(event) => setQuery(event.target.value)} />
      <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'در حال بررسی…' : mode === 'transfer' ? 'بررسی انتقال' : 'جست‌وجو'}</button>
    </form>
    {error && <p className="dx-error" role="alert">{error}</p>}
    {results && <ul className="dx-results" aria-live="polite">
      {results.map((result, index) => {
        const [label, tone] = STATE[result.state]
        const canRegister = mode === 'register' && result.state !== 'taken'
        const canTransfer = mode === 'transfer' && result.state !== 'available' && result.transfer > 0
        return <li key={result.name} className={`dx-result ${tone}${index === 0 ? ' is-first' : ''}`} style={{ ['--i' as string]: index }}>
          <span className="dx-name" dir="ltr"><b>{result.display.split('.')[0]}</b>.{result.display.split('.').slice(1).join('.')}</span>
          <span className={`dx-state ${tone}`}>{label}</span>
          <span className="dx-price"><b className="num">{nf(mode === 'transfer' ? result.transfer : result.register)}</b> <small>تومان{mode === 'transfer' ? '' : ' / سال'}</small></span>
          {canRegister || canTransfer
            ? <button type="button" className="btn btn-primary btn-sm" onClick={() => setOrdering({ result, transfer: mode === 'transfer' })}>{mode === 'transfer' ? 'انتقال' : 'ثبت'}</button>
            : <span className="dx-na">{mode === 'transfer' ? (result.transfer > 0 ? 'هنوز ثبت نشده' : 'انتقال ندارد') : 'در دسترس نیست'}</span>}
        </li>
      })}
      {!results.length && !error && <li className="dx-empty">پسوندی برای این جست‌وجو تعریف نشده است.</li>}
    </ul>}
    {ordering && <OrderSheet result={ordering.result} transfer={ordering.transfer} signedIn={signedIn} onClose={() => setOrdering(null)} />}
  </div>
}
