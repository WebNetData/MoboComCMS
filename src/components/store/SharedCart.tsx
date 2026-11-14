'use client'
import { useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import { formatMoney } from '@/shared/money'
import styles from './shared-cart.module.css'
type Line = { productId: number; variantId: number | null; quantity: number; name: string; variantName: string; href: string; maxQuantity: number; currency: string; unitMinor: string; issue: string }
export type ShareView = { id: number; title: string; expiresAt: string; fingerprint: string; lines: Line[] }
async function read(response: Response) { const body = await response.json(); if (!response.ok) throw Error(body.error || 'عملیات انجام نشد'); return body }
export function ShareCartControl() {
  const [title, setTitle] = useState('پیشنهاد خرید'), [result, setResult] = useState<{ href: string; id: number; version: number } | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [copied, setCopied] = useState(false)
  const [shares, setShares] = useState<{ id: number; title: string; version: number; revokedAt: string | null }[]>([])
  async function load() { try { const body = await fetch('/api/cart/share', { cache: 'no-store' }).then(read); setShares(body.shares) } catch (cause) { setError(cause instanceof Error ? cause.message : 'دریافت نشد') } }
  async function create() { setBusy(true); setError(''); setCopied(false); try { setResult(await fetch('/api/cart/share', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title }) }).then(read)); await load() } catch (cause) { setError(cause instanceof Error ? cause.message : 'ثبت نشد') } finally { setBusy(false) } }
  async function revoke(id: number, version: number) { setBusy(true); setError(''); try { await fetch('/api/cart/share', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'revoke', id, version }) }).then(read); if (result?.id === id) setResult(null); await load() } catch (cause) { setError(cause instanceof Error ? cause.message : 'لغو نشد') } finally { setBusy(false) } }
  return <details className={`${styles.card} ${styles.shareControl}`}><summary>اشتراک‌گذاری ترکیب سبد</summary><p>یک کپی از کالاها و تعدادها می‌سازید؛ اطلاعات حساب، نشانی و پاسخ‌های سفارش ارسال نمی‌شود. لینک تا هفت روز معتبر است و هر دارندهٔ لینک آن را می‌بیند.</p><label>عنوان عمومی لینک<input className="input" maxLength={100} value={title} onChange={event => setTitle(event.target.value)} /></label><div className={styles.actions}><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void create()}>ساخت لینک سبد</button><button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void load()}>مدیریت لینک‌های ساخته‌شده</button></div>
    {error && <p role="alert">{error}</p>}{result && <div role="status"><Link href={result.href}>مشاهدهٔ سبد مشترک</Link><input aria-label="لینک قابل اشتراک سبد" className="input" readOnly value={typeof window === 'undefined' ? result.href : new URL(result.href, window.location.origin).href} /><button type="button" className="btn" onClick={() => { void navigator.clipboard.writeText(new URL(result.href, window.location.origin).href).then(() => setCopied(true), () => setError('لینک را از کادر کپی کنید')) }}>{copied ? 'کپی شد' : 'کپی لینک'}</button></div>}
    {!!shares.length && <ul>{shares.map(share => <li key={share.id}>{share.title} #{share.id} · {share.revokedAt ? 'لغوشده' : <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void revoke(share.id, share.version)}>لغو دسترسی این لینک</button>}</li>)}</ul>}
  </details>
}
export default function SharedCart({ token }: { token: string }) {
  const [view, setView] = useState<ShareView | null>(null), [selected, setSelected] = useState<Line[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState(false), [confirmed, setConfirmed] = useState(false), [added, setAdded] = useState(false), [reviewed, setReviewed] = useState(false)
  const [requestId, setRequestId] = useState('')
  async function refresh(lines?: Line[]) {
    setBusy(true); setError(''); setConfirmed(false)
    try { const next: ShareView = await fetch(`/api/cart/share/${token}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'preview', lines }) }).then(read); setView(next); setSelected(next.lines); setReviewed(true); setRequestId(crypto.randomUUID()) } catch (cause) { setError(cause instanceof Error ? cause.message : 'دریافت نشد') } finally { setBusy(false) }
  }
  useEffect(() => { const controller = new AbortController(); setBusy(true); fetch(`/api/cart/share/${token}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'preview' }), signal: controller.signal }).then(read).then((next: ShareView) => { if (!controller.signal.aborted) { setView(next); setSelected(next.lines); setReviewed(true); setRequestId(crypto.randomUUID()) } }).catch(cause => { if (!controller.signal.aborted) setError(cause.message) }).finally(() => { if (!controller.signal.aborted) setBusy(false) }); return () => controller.abort() }, [token])
  async function add() {
    if (!confirmed || !reviewed || !view) return
    setBusy(true); setError('')
    try { await fetch(`/api/cart/share/${token}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lines: selected, confirmed, fingerprint: view.fingerprint, requestId }) }).then(read); setAdded(true); window.dispatchEvent(new Event('cart:changed')) } catch (cause) { setError(cause instanceof Error ? cause.message : 'افزوده نشد'); setConfirmed(false) } finally { setBusy(false) }
  }
  return <section className={`container content-surface ${styles.page}`} aria-label="سبد خرید مشترک"><h1>{view?.title || 'سبد خرید مشترک'}</h1><p className={styles.intro}>این ترکیب پیشنهادی است؛ قیمت، موجودی و محدودیت خرید امروز بررسی می‌شود. افزودن به سبد شما، سبد فرستنده را تغییر نمی‌دهد و موجودی رزرو نمی‌کند.</p>
    {error && <p role="alert">{error}</p>}{busy && <p role="status">در حال بررسی…</p>}
    {added ? <div role="status"><h2>کالاها به سبد شما اضافه شدند</h2><Link className="btn btn-primary" href="/cart">بررسی سبد و ادامهٔ خرید</Link></div> : <>
      <ul className={styles.lines}>{selected.map((line, index) => <li className={styles.card} key={`${line.productId}:${line.variantId}`}><h2>{line.href ? <Link href={line.href}>{line.name}</Link> : line.name}</h2><p>{line.variantName}</p>{line.currency && <p>{formatMoney(BigInt(line.unitMinor), line.currency, 'fa-IR')} برای هر عدد</p>}{line.issue && <p role="status">{line.issue}</p>}
        <label className={styles.quantity}>تعداد {line.name}<input className="input" type="number" min={1} max={999} value={line.quantity} disabled={busy} onChange={event => { setSelected(rows => rows.map((row, i) => i === index ? { ...row, quantity: Number(event.target.value) } : row)); setReviewed(false); setConfirmed(false) }} /></label><button type="button" className="btn btn-ghost" disabled={busy} onClick={() => { setSelected(rows => rows.filter((_, i) => i !== index)); setReviewed(false); setConfirmed(false) }}>حذف از انتخاب من</button></li>)}</ul>
      <button type="button" className="btn" disabled={busy || !selected.length} onClick={() => void refresh(selected)}>بررسی دوبارهٔ قیمت و موجودی</button>
      {view && <div className={styles.actions}><label className={styles.confirmation}><input type="checkbox" checked={confirmed} disabled={!reviewed || busy} onChange={event => setConfirmed(event.target.checked)} /> قیمت‌های فعلی، تعدادها و موجودی را بررسی کردم</label><button type="button" className="btn btn-primary" disabled={!confirmed || !reviewed || busy || !selected.length || !!view.lines.some(line => line.issue)} onClick={() => void add()}>افزودن انتخاب‌ها به سبد خودم</button><p><Link href={`/admin/store/quotations?shared=${token}`}>تهیهٔ پیش‌فاکتور با این ترکیب برای فروشنده</Link></p></div>}
    </>}{!view && <button type="button" className="btn" disabled={busy} onClick={() => void refresh()}>تلاش دوباره</button>}
  </section>
}
