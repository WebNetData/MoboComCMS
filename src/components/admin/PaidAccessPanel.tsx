'use client'

import { useEffect, useState } from 'react'
import Link from '@/components/AppLink'

type Item = { price: string; memberPrice: string; currency: string; vipAccess: string; active: boolean; sales: number; revenue: string }
type Form = { price: string; memberPrice: string; currency: string; vipAccess: string; active: boolean }

const EMPTY: Form = { price: '', memberPrice: '', currency: 'IRT', vipAccess: 'FREE', active: true }
const CURRENCY: Record<string, string> = { IRT: 'تومان', IRR: 'ریال', USD: 'دلار' }

/**
 * "Sell this item" panel of the section editors (article, software, game, film,
 * album, track). Saved on its own, so it works on any existing item without
 * touching the editor's form.
 */
export default function PaidAccessPanel({ ownerType, ownerId, noun = 'این مورد' }: { ownerType: string; ownerId: number | null; noun?: string }) {
  const [state, setState] = useState<{ enabled: boolean; item: Item | null } | null>(null)
  const [form, setForm] = useState<Form>(EMPTY)
  const [on, setOn] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    if (!ownerId) return
    let alive = true
    fetch(`/api/admin/paywall?ownerType=${ownerType}&ownerId=${ownerId}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((data) => {
      if (!alive || !data) return
      setState(data)
      setOn(!!data.item)
      setForm(data.item ? { price: data.item.price, memberPrice: data.item.memberPrice, currency: data.item.currency, vipAccess: data.item.vipAccess, active: data.item.active } : EMPTY)
    }).catch(() => null)
    return () => { alive = false }
  }, [ownerType, ownerId])

  if (!ownerId) return <div className="pw-admin"><div className="pw-admin-head"><b>💰 فروش {noun}</b></div><small className="muted">پس از ذخیرهٔ اولیه می‌توانید برای {noun} قیمت بگذارید.</small></div>
  if (!state) return null
  if (!state.enabled) return <div className="pw-admin"><div className="pw-admin-head"><b>💰 فروش {noun}</b></div><small className="muted">ماژول «فروش محتوا» خاموش است؛ از <Link href="/admin/extensions">افزونه‌ها</Link> روشنش کنید.</small></div>

  const set = (patch: Partial<Form>) => setForm((current) => ({ ...current, ...patch }))

  async function save() {
    setBusy(true); setNotice(null)
    const response = await fetch('/api/admin/paywall', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ownerType, ownerId, ...form }) }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) { setNotice({ ok: false, text: data?.error || 'ذخیره نشد' }); return }
    setState((current) => (current ? { ...current, item: data.item } : current))
    setNotice({ ok: true, text: 'قیمت ذخیره شد' })
  }

  async function remove() {
    if (!window.confirm(`فروش ${noun} برداشته شود؟ کسانی که خریده‌اند همچنان دسترسی دارند.`)) return
    setBusy(true); setNotice(null)
    const response = await fetch(`/api/admin/paywall?ownerType=${ownerType}&ownerId=${ownerId}`, { method: 'DELETE' }).catch(() => null)
    setBusy(false)
    if (!response?.ok) { setNotice({ ok: false, text: 'انجام نشد' }); return }
    setState((current) => (current ? { ...current, item: null } : current))
    setOn(false); setForm(EMPTY)
    setNotice({ ok: true, text: 'فروش برداشته شد' })
  }

  return (
    <section className="pw-admin" aria-label={`فروش ${noun}`}>
      <div className="pw-admin-head">
        <b>💰 فروش {noun}</b>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={on} onChange={(e) => { setOn(e.target.checked); if (!e.target.checked && state.item) void remove() }} /> فروشی باشد</label>
      </div>
      {on && <>
        <div className="pw-admin-grid">
          <label><span>قیمت</span><input className="input" dir="ltr" inputMode="decimal" value={form.price} onChange={(e) => set({ price: e.target.value })} placeholder="150000" /></label>
          <label><span>واحد</span><select className="select" value={form.currency} onChange={(e) => set({ currency: e.target.value })}>{Object.entries(CURRENCY).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label><span>اعضای ویژه (VIP)</span><select className="select" value={form.vipAccess} onChange={(e) => set({ vipAccess: e.target.value })}>
            <option value="FREE">رایگان دریافت می‌کنند</option>
            <option value="DISCOUNT">با قیمت ویژه می‌خرند</option>
            <option value="NONE">مثل بقیه می‌خرند</option>
          </select></label>
          {form.vipAccess === 'DISCOUNT' && <label><span>قیمت اعضای ویژه</span><input className="input" dir="ltr" inputMode="decimal" value={form.memberPrice} onChange={(e) => set({ memberPrice: e.target.value })} placeholder="90000" /></label>}
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={(e) => set({ active: e.target.checked })} /> فروش فعال است (خاموش = موقتاً رایگان برای همه)</label>
        {state.item && <div className="pw-admin-stats"><span>فروش: <b>{state.item.sales.toLocaleString('fa-IR')}</b></span><span>درآمد: <b>{state.item.revenue}</b></span></div>}
        <div className="pw-admin-actions">
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void save()} disabled={busy}>{busy ? '…' : 'ذخیرهٔ قیمت'}</button>
          {notice && <span className={notice.ok ? 'badge badge-green' : 'error-text'} role="status">{notice.text}</span>}
        </div>
      </>}
      {!on && notice && <span className={notice.ok ? 'badge badge-green' : 'error-text'} role="status">{notice.text}</span>}
    </section>
  )
}
