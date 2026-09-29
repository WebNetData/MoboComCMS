'use client'

import { useState, type FormEvent } from 'react'
import { call, useSeller } from '../SellerContext'

async function upload(file: File) {
  const form = new FormData()
  form.append('file', file, file.name)
  const response = await fetch('/api/seller/media', { method: 'POST', body: form })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error || 'بارگذاری نشد')
  return String(data.url)
}

function ImageField({ label, value, hint, onChange }: { label: string; value: string; hint: string; onChange: (url: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return <div className="sa-field"><span>{label}</span>
    <div className="sl-image-field">{value ? <img src={value} alt="" /> : <span className="sa-prod-ph" />}
      <label className="btn btn-ghost btn-sm">{busy ? 'در حال بارگذاری…' : 'انتخاب تصویر'}<input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={busy} onChange={async (e) => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; setBusy(true); setError(''); try { onChange(await upload(file)) } catch (err) { setError(err instanceof Error ? err.message : 'بارگذاری نشد') } setBusy(false) }} /></label>
      {value && <button type="button" className="sa-link is-danger" onClick={() => onChange('')}>حذف</button>}
    </div><small className="sa-sub">{hint}</small>{error && <small className="error-text">{error}</small>}</div>
}

export default function SellerProfile() {
  const { seller, reload } = useSeller()
  const [form, setForm] = useState({ shopName: seller.shopName, slug: seller.slug, phone: seller.phone, email: seller.email, city: seller.city, address: seller.address, about: seller.about, logo: seller.logo, banner: seller.banner, iban: seller.iban, ibanOwner: seller.ibanOwner })
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }))
  async function save(event: FormEvent) {
    event.preventDefault()
    setBusy(true); setNotice(null)
    const result = await call('/api/seller', 'PUT', form)
    setBusy(false)
    setNotice({ ok: result.ok, text: result.ok ? 'پروفایل فروشگاه ذخیره شد.' : result.error })
    if (result.ok) reload()
  }
  return <form className="sa" onSubmit={save}>
    <header className="sa-head"><h1>پروفایل فروشگاه</h1><div className="sa-head-actions"><button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'در حال ذخیره…' : 'ذخیره'}</button></div></header>
    {notice && <p className={`sa-notice ${notice.ok ? 'is-ok' : 'is-error'}`} role="status">{notice.text}</p>}
    <section className="sa-card sa-form"><header className="sa-card-head"><h2>ویترین</h2></header>
      <div className="sa-cols">
        <label className="sa-field"><span>نام فروشگاه</span><input className="input" value={form.shopName} onChange={(e) => set({ shopName: e.target.value })} required /></label>
        <label className="sa-field"><span>نشانی فروشگاه</span><div className="sl-slug"><span dir="ltr">/shop/</span><input className="input" dir="ltr" value={form.slug} onChange={(e) => set({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} required /></div></label>
      </div>
      <div className="sa-cols">
        <ImageField label="لوگو" value={form.logo} hint="مربعی، حداقل ۲۵۶×۲۵۶" onChange={(logo) => set({ logo })} />
        <ImageField label="بنر صفحهٔ فروشگاه" value={form.banner} hint="افقی، پیشنهادی ۱۶۰۰×۴۰۰" onChange={(banner) => set({ banner })} />
      </div>
      <label className="sa-field"><span>دربارهٔ فروشگاه</span><textarea className="textarea" rows={4} value={form.about} onChange={(e) => set({ about: e.target.value })} maxLength={2000} /></label>
    </section>
    <section className="sa-card sa-form"><header className="sa-card-head"><h2>تماس و نشانی</h2></header>
      <div className="sa-cols">
        <label className="sa-field"><span>تلفن</span><input className="input" dir="ltr" value={form.phone} onChange={(e) => set({ phone: e.target.value })} /></label>
        <label className="sa-field"><span>ایمیل</span><input className="input" dir="ltr" type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} /></label>
        <label className="sa-field"><span>شهر</span><input className="input" value={form.city} onChange={(e) => set({ city: e.target.value })} /></label>
        <label className="sa-field"><span>نشانی انبار</span><input className="input" value={form.address} onChange={(e) => set({ address: e.target.value })} /></label>
      </div>
    </section>
    <section className="sa-card sa-form"><header className="sa-card-head"><h2>حساب بانکی تسویه</h2></header>
      <div className="sa-cols">
        <label className="sa-field"><span>شمارهٔ شبا</span><input className="input" dir="ltr" value={form.iban} onChange={(e) => set({ iban: e.target.value })} placeholder="IR…" /></label>
        <label className="sa-field"><span>نام صاحب حساب</span><input className="input" value={form.ibanOwner} onChange={(e) => set({ ibanOwner: e.target.value })} /></label>
      </div>
      <p className="sa-hint">اطلاعات هویتی ({seller.kind === 'COMPANY' ? 'شرکت' : 'شخص'}: {seller.legalName}) پس از تأیید قابل تغییر نیست؛ برای اصلاح با پشتیبانی تماس بگیرید.{seller.commissionPercent != null ? ` کارمزد اختصاصی شما: ${seller.commissionPercent.toLocaleString('fa-IR')}٪` : ''}</p>
    </section>
  </form>
}
