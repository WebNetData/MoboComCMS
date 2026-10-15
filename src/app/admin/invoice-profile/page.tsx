'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { Notice } from '../store/shared'

type Profile = {
  sellerName: string; nationalId: string; economicCode: string; registrationNo: string; province: string; city: string; address: string; postalCode: string; phone: string
  logo: string; stamp: string; vatBps: number; pricesIncludeVat: boolean; unit: 'rial' | 'toman'; footerNote: string
}

/** Seller details, VAT and unit printed on the official sales invoice (صورتحساب رسمی). */
export default function InvoiceProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    fetch('/api/admin/invoice-profile', { cache: 'no-store' }).then((r) => r.json().then((data) => ({ ok: r.ok, data }))).then(({ ok, data }) => {
      if (!ok) { setNotice({ tone: 'error', text: data?.error || 'بارگذاری انجام نشد' }); return }
      setProfile(data.profile)
    }).catch(() => setNotice({ tone: 'error', text: 'ارتباط برقرار نشد' }))
  }, [])
  if (!profile) return <div className="sa" dir="rtl">{notice ? <Notice tone="error">{notice.text}</Notice> : <div className="sa-skeleton" />}</div>
  const set = (patch: Partial<Profile>) => setProfile({ ...profile, ...patch })
  const input = (key: keyof Profile, label: string, props: { ltr?: boolean; max?: number; hint?: string } = {}) =>
    <label className="sa-field"><span>{label}</span><input className="input" dir={props.ltr ? 'ltr' : undefined} maxLength={props.max} value={String(profile[key])} onChange={(e) => set({ [key]: e.target.value } as Partial<Profile>)} />{props.hint && <small className="sa-hint">{props.hint}</small>}</label>

  async function save(event: FormEvent) {
    event.preventDefault()
    setBusy(true); setNotice(null)
    const response = await fetch('/api/admin/invoice-profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile }) }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) { setNotice({ tone: 'error', text: data?.error || 'ذخیره انجام نشد' }); return }
    setProfile(data.profile); setNotice({ tone: 'ok', text: 'ذخیره شد؛ روی همهٔ صورتحساب‌های رسمی اعمال می‌شود.' })
  }

  return <form className="sa" dir="rtl" onSubmit={save}>
    <header className="sa-head">
      <div><h1>صورتحساب رسمی</h1><p className="sa-hint">مشخصات فروشنده، مالیات بر ارزش افزوده و واحد مبلغ در «صورتحساب فروش کالا و خدمات». هر فاکتور از صفحهٔ خودش با دکمهٔ «صورتحساب رسمی» قابل چاپ و ذخیرهٔ PDF است.</p></div>
      <div className="sa-head-actions"><button className="btn btn-primary" disabled={busy}>{busy ? 'در حال ذخیره…' : 'ذخیره'}</button></div>
    </header>
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    <div className="sa-cols">
      <section className="sa-card sa-form">
        <header className="sa-card-head"><h2>مشخصات فروشنده</h2></header>
        <div className="sa-grid">
          {input('sellerName', 'نام شخص حقیقی یا حقوقی', { max: 120 })}
          {input('nationalId', 'شناسهٔ ملی / کد ملی', { ltr: true, max: 11 })}
          {input('economicCode', 'کد اقتصادی', { ltr: true, max: 14 })}
          {input('registrationNo', 'شمارهٔ ثبت', { max: 30 })}
          {input('province', 'استان', { max: 40 })}
          {input('city', 'شهر', { max: 40 })}
          {input('postalCode', 'کد پستی', { ltr: true, max: 10 })}
          {input('phone', 'تلفن', { ltr: true, max: 40 })}
        </div>
        <label className="sa-field"><span>نشانی</span><textarea className="input" rows={2} maxLength={300} value={profile.address} onChange={(e) => set({ address: e.target.value })} /></label>
      </section>
      <div className="sa-stack">
        <section className="sa-card sa-form">
          <header className="sa-card-head"><h2>مالیات و مبالغ</h2></header>
          <div className="sa-grid">
            <label className="sa-field"><span>نرخ مالیات بر ارزش افزوده (٪)</span><input className="input num" type="number" min={0} max={50} step={0.5} value={profile.vatBps / 100} onChange={(e) => set({ vatBps: Math.round(Number(e.target.value) * 100) })} /></label>
            <label className="sa-field"><span>واحد مبالغ</span><select className="select" value={profile.unit} onChange={(e) => set({ unit: e.target.value as Profile['unit'] })}><option value="rial">ریال</option><option value="toman">تومان</option></select></label>
          </div>
          <label className="sa-check"><input type="checkbox" checked={profile.pricesIncludeVat} onChange={(e) => set({ pricesIncludeVat: e.target.checked })} />قیمت‌های فروشگاه شامل مالیات است (مالیات از مبلغ جدا نمایش داده می‌شود)</label>
          <p className="sa-hint">اگر خاموش باشد، مالیات روی مبلغ هر ردیف اضافه نمایش داده می‌شود. نرخ صفر یعنی ستون مالیات صفر.</p>
        </section>
        <section className="sa-card sa-form">
          <header className="sa-card-head"><h2>ظاهر</h2></header>
          {input('logo', 'لوگوی اختصاصی فاکتورها (اختیاری)', { ltr: true, hint: 'خالی بگذارید تا لوگوی اصلی تنظیم‌شده در «هویت بصری» سایت، در همهٔ فاکتورها استفاده شود. برای درج در PDF از تصویر بارگذاری‌شده در رسانهٔ سایت با مسیر /api/media/covers/… استفاده کنید.' })}
          {input('stamp', 'تصویر مهر و امضا (اختیاری)', { ltr: true, hint: 'PNG با پس‌زمینهٔ شفاف بهترین نتیجه را دارد.' })}
          <label className="sa-field"><span>یادداشت پایین صورتحساب</span><textarea className="input" rows={2} maxLength={500} value={profile.footerNote} onChange={(e) => set({ footerNote: e.target.value })} /></label>
        </section>
      </div>
    </div>
  </form>
}
