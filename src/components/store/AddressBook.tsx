'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { MAX_ADDRESSES, PROVINCES, formatAddress } from '@/modules/shipping/domain/shipping'
import LocationPicker from '@/components/site/LocationPicker'

export type SavedAddress = {
  id: number; title: string; recipient: string; mobile: string; province: string; city: string
  address: string; plaque: string; unit: string; postalCode: string; isDefault: boolean
  lat?: number | null; lng?: number | null
}

type Draft = Omit<SavedAddress, 'id'>
const EMPTY: Draft = { title: '', recipient: '', mobile: '', province: '', city: '', address: '', plaque: '', unit: '', postalCode: '', isDefault: false, lat: null, lng: null }
const TITLES = ['خانه', 'محل کار', 'منزل والدین']
const fa = (value: string) => value.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])

async function request<T>(url: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const response = await fetch(url, { cache: 'no-store', ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } }).catch(() => null)
  const body = await response?.json().catch(() => null)
  if (!response) return { ok: false, error: 'ارتباط برقرار نشد؛ اتصال اینترنت را بررسی کنید' }
  if (!response.ok) return { ok: false, error: body?.error || 'انجام نشد؛ دوباره تلاش کنید' }
  return { ok: true, data: body as T }
}

/** Loads the signed-in customer's addresses; `reload` refreshes after changes. */
export function useAddresses() {
  const [addresses, setAddresses] = useState<SavedAddress[] | null>(null)
  const [error, setError] = useState('')
  const reload = useCallback(async () => {
    const result = await request<{ addresses: SavedAddress[] }>('/api/addresses')
    if (result.ok) { setAddresses(result.data.addresses); setError('') } else { setError(result.error); setAddresses((current) => current || []) }
  }, [])
  useEffect(() => { void reload() }, [reload])
  return { addresses, error, reload }
}

/** One address as the courier reads it. */
export function AddressSummary({ address }: { address: SavedAddress }) {
  return <div className="sh-address-summary">
    <p className="sh-address-line">{formatAddress(address)}</p>
    <ul className="sh-address-meta">
      <li><span className="sh-meta-key">گیرنده</span>{address.recipient}</li>
      <li><span className="sh-meta-key">موبایل</span><bdi dir="ltr">{fa(address.mobile)}</bdi></li>
      <li><span className="sh-meta-key">کد پستی</span><bdi dir="ltr">{fa(address.postalCode)}</bdi></li>
      {address.lat != null && address.lng != null && <li><span className="sh-meta-key">نقشه</span>موقعیت ثبت شده</li>}
    </ul>
  </div>
}

/** Add or edit form; saves through the API and hands back the stored address. */
export function AddressForm({ initial, onSaved, onCancel }: { initial?: SavedAddress | null; onSaved: (address: SavedAddress) => void; onCancel?: () => void }) {
  const [draft, setDraft] = useState<Draft>(initial ? { ...initial } : EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const id = useId()
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }))

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true); setError('')
    const result = initial
      ? await request<{ address: SavedAddress }>(`/api/addresses/${initial.id}`, { method: 'PATCH', body: JSON.stringify(draft) })
      : await request<{ address: SavedAddress }>('/api/addresses', { method: 'POST', body: JSON.stringify(draft) })
    setBusy(false)
    if (result.ok) onSaved(result.data.address)
    else setError(result.error)
  }

  const field = (key: keyof Draft, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => <label className="sh-field" htmlFor={`${id}-${key}`}>
    <span>{label}</span>
    <input id={`${id}-${key}`} className="sh-input" value={String(draft[key])} onChange={(e) => set(key, e.target.value as never)} {...props} />
  </label>

  return <form className="sh-form" onSubmit={submit} noValidate>
    <fieldset className="sh-title-picker">
      <legend>عنوان آدرس</legend>
      <div className="sh-chips">
        {TITLES.map((title) => <button key={title} type="button" className="sh-chip" aria-pressed={draft.title === title} onClick={() => set('title', title)}>{title}</button>)}
        <input className="sh-input sh-chip-input" aria-label="عنوان دلخواه" placeholder="عنوان دلخواه" maxLength={30} value={TITLES.includes(draft.title) ? '' : draft.title} onChange={(e) => set('title', e.target.value)} />
      </div>
    </fieldset>
    <div className="sh-grid">
      <label className="sh-field" htmlFor={`${id}-province`}>
        <span>استان</span>
        <select id={`${id}-province`} className="sh-input" value={draft.province} required onChange={(e) => set('province', e.target.value)}>
          <option value="">انتخاب استان</option>
          {PROVINCES.map((province) => <option key={province} value={province}>{province}</option>)}
        </select>
      </label>
      {field('city', 'شهر', { required: true, autoComplete: 'address-level2', maxLength: 60 })}
      <div className="sh-span">{field('address', 'نشانی پستی', { required: true, autoComplete: 'street-address', maxLength: 400, placeholder: 'خیابان، کوچه، نام ساختمان' })}</div>
      {field('plaque', 'پلاک', { inputMode: 'numeric', maxLength: 10, dir: 'ltr' })}
      {field('unit', 'واحد', { inputMode: 'numeric', maxLength: 10, dir: 'ltr' })}
      {field('postalCode', 'کد پستی ده‌رقمی', { required: true, inputMode: 'numeric', maxLength: 12, dir: 'ltr', autoComplete: 'postal-code', placeholder: '۱۲۳۴۵۶۷۸۹۰' })}
      {field('mobile', 'موبایل گیرنده', { required: true, inputMode: 'tel', maxLength: 16, dir: 'ltr', autoComplete: 'tel', placeholder: '۰۹۱۲۱۲۳۴۵۶۷' })}
      <div className="sh-span">{field('recipient', 'نام و نام خانوادگی گیرنده', { required: true, autoComplete: 'name', maxLength: 80 })}</div>
    </div>
    <fieldset className="sh-map">
      <legend>موقعیت روی نقشه <small>(اختیاری)</small></legend>
      <LocationPicker value={draft.lat != null && draft.lng != null ? { lat: draft.lat, lng: draft.lng } : null} onChange={(pin) => setDraft((current) => ({ ...current, lat: pin?.lat ?? null, lng: pin?.lng ?? null }))} province={draft.province} city={draft.city} street={draft.address} />
    </fieldset>
    <label className="sh-check"><input type="checkbox" checked={draft.isDefault} onChange={(e) => set('isDefault', e.target.checked)} />آدرس پیش‌فرض برای ارسال سفارش‌ها</label>
    {error && <p className="sh-error" role="alert">{error}</p>}
    <div className="sh-actions">
      <button type="submit" className="sh-btn sh-btn-primary" disabled={busy}>{busy ? 'در حال ذخیره…' : initial ? 'ذخیرهٔ تغییرات' : 'ثبت آدرس'}</button>
      {onCancel && <button type="button" className="sh-btn sh-btn-ghost" onClick={onCancel}>انصراف</button>}
    </div>
  </form>
}

/** Modal wrapper around the form (native <dialog>: focus trap, Esc, backdrop). */
export function AddressDialog({ open, initial, onClose, onSaved }: { open: boolean; initial?: SavedAddress | null; onClose: () => void; onSaved: (address: SavedAddress) => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])
  return <dialog ref={ref} className="sh-dialog" aria-labelledby="sh-dialog-title" onClose={onClose} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
    <header className="sh-dialog-head">
      <h2 id="sh-dialog-title">{initial ? 'ویرایش آدرس' : 'افزودن آدرس جدید'}</h2>
      <button type="button" className="sh-icon-btn" aria-label="بستن" onClick={onClose}>×</button>
    </header>
    {open && <AddressForm key={initial?.id || 'new'} initial={initial} onSaved={onSaved} onCancel={onClose} />}
  </dialog>
}

/** Address book for the account panel: list, add, edit, delete, make default. */
export default function AddressBook() {
  const { addresses, error, reload } = useAddresses()
  const [editing, setEditing] = useState<SavedAddress | null>(null)
  const [adding, setAdding] = useState(false)
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null)
  const [busyId, setBusyId] = useState(0)

  async function remove(address: SavedAddress) {
    if (!window.confirm(`آدرس «${address.title}» حذف شود؟`)) return
    setBusyId(address.id)
    const result = await request(`/api/addresses/${address.id}`, { method: 'DELETE' })
    setBusyId(0)
    setNotice(result.ok ? { text: 'آدرس حذف شد', error: false } : { text: result.error, error: true })
    await reload()
  }

  async function makeDefault(address: SavedAddress) {
    setBusyId(address.id)
    const result = await request(`/api/addresses/${address.id}`, { method: 'PATCH', body: JSON.stringify({ makeDefault: true }) })
    setBusyId(0)
    if (!result.ok) setNotice({ text: result.error, error: true })
    await reload()
  }

  const full = (addresses?.length || 0) >= MAX_ADDRESSES
  return <section className="sh-book" aria-labelledby="sh-book-title">
    <header className="sh-book-head">
      <div>
        <h1 id="sh-book-title">آدرس‌های من</h1>
        <p>سفارش‌های فیزیکی به آدرسی که هنگام پرداخت انتخاب می‌کنید ارسال می‌شوند. تا {MAX_ADDRESSES.toLocaleString('fa-IR')} آدرس می‌توانید ذخیره کنید.</p>
      </div>
      <button type="button" className="sh-btn sh-btn-primary" disabled={full} title={full ? 'به سقف تعداد آدرس رسیده‌اید' : undefined} onClick={() => { setEditing(null); setAdding(true) }}>+ آدرس جدید</button>
    </header>
    {notice && <p className={`sh-notice${notice.error ? ' is-error' : ''}`} role="status">{notice.text}</p>}
    {error && <p className="sh-notice is-error" role="alert">{error}</p>}
    {addresses === null ? <div className="sh-skeleton" aria-busy="true" aria-label="در حال بارگذاری" /> : addresses.length === 0 ? <div className="sh-empty">
      <span className="sh-empty-icon" aria-hidden="true">⌖</span>
      <h2>هنوز آدرسی ثبت نکرده‌اید</h2>
      <p>برای خرید محصولات فیزیکی، نشانی دقیق، کد پستی و شمارهٔ تماس گیرنده را یک بار اینجا ثبت کنید.</p>
      <button type="button" className="sh-btn sh-btn-primary" onClick={() => setAdding(true)}>ثبت اولین آدرس</button>
    </div> : <ul className="sh-cards">
      {addresses.map((address) => <li key={address.id} className={`sh-card${address.isDefault ? ' is-default' : ''}`}>
        <header><b>{address.title}</b>{address.isDefault && <span className="sh-badge">پیش‌فرض</span>}</header>
        <AddressSummary address={address} />
        <footer>
          <button type="button" className="sh-link" disabled={busyId === address.id} onClick={() => { setAdding(false); setEditing(address) }}>ویرایش</button>
          {!address.isDefault && <button type="button" className="sh-link" disabled={busyId === address.id} onClick={() => void makeDefault(address)}>انتخاب به‌عنوان پیش‌فرض</button>}
          <button type="button" className="sh-link is-danger" disabled={busyId === address.id} onClick={() => void remove(address)}>حذف</button>
        </footer>
      </li>)}
    </ul>}
    <AddressDialog open={adding || !!editing} initial={editing} onClose={() => { setAdding(false); setEditing(null) }} onSaved={async () => { setAdding(false); setEditing(null); setNotice({ text: 'آدرس ذخیره شد', error: false }); await reload() }} />
  </section>
}
