'use client'

import { useState, type FormEvent } from 'react'
import { call, type SellerAccount } from './SellerContext'

const STEPS = ['اطلاعات هویتی', 'فروشگاه', 'حساب بانکی', 'قوانین']

/** "Sell on the site" application: identity, shop, payout account and terms, in one guided form. */
export default function ApplyForm({ previous, terms, onDone }: { previous: SellerAccount | null; terms: string; onDone: () => void }) {
  const [form, setForm] = useState({
    kind: previous?.kind || 'PERSON', legalName: previous?.legalName || '', nationalId: previous?.nationalId || '',
    shopName: previous?.shopName || '', slug: previous?.slug || '', phone: previous?.phone || '', email: previous?.email || '',
    city: previous?.city || '', address: previous?.address || '', about: previous?.about || '', iban: previous?.iban || '', ibanOwner: previous?.ibanOwner || '',
    acceptTerms: false,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }))

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true); setError('')
    const result = await call('/api/seller', 'POST', form)
    setBusy(false)
    if (result.ok) onDone(); else setError(result.error)
  }

  return <form className="sl-apply" onSubmit={submit}>
    <header className="sl-apply-head">
      <span className="sl-eyebrow">فروشنده شوید</span>
      <h1>در فروشگاه ما غرفه باز کنید</h1>
      <p>محصولاتتان را به هزاران خریدار نشان دهید. ثبت محصول، مدیریت موجودی و سفارش‌ها، و تسویهٔ منظم به حساب بانکی — همه از پنل فروشندگی.</p>
      <ol className="sl-steps">{STEPS.map((step, index) => <li key={step}><span>{(index + 1).toLocaleString('fa-IR')}</span>{step}</li>)}</ol>
    </header>

    {previous?.status === 'REJECTED' && <p className="sa-notice is-error" role="alert">درخواست قبلی شما رد شد{previous.statusNote ? `: ${previous.statusNote}` : ''}. پس از اصلاح، دوباره ارسال کنید.</p>}

    <section className="sa-card sa-form">
      <header className="sa-card-head"><h2>۱. اطلاعات هویتی</h2></header>
      <div className="sl-kind" role="radiogroup" aria-label="نوع فروشنده">
        {[['PERSON', 'شخص حقیقی'], ['COMPANY', 'شخص حقوقی (شرکت)']].map(([value, label]) => <label key={value} className={form.kind === value ? 'is-on' : ''}><input type="radio" name="kind" checked={form.kind === value} onChange={() => set({ kind: value })} />{label}</label>)}
      </div>
      <div className="sa-cols">
        <label className="sa-field"><span>{form.kind === 'COMPANY' ? 'نام ثبتی شرکت' : 'نام و نام خانوادگی'}</span><input className="input" value={form.legalName} onChange={(e) => set({ legalName: e.target.value })} required /></label>
        <label className="sa-field"><span>{form.kind === 'COMPANY' ? 'شناسهٔ ملی شرکت (۱۱ رقم)' : 'کد ملی (۱۰ رقم)'}</span><input className="input" dir="ltr" inputMode="numeric" value={form.nationalId} onChange={(e) => set({ nationalId: e.target.value })} required /></label>
      </div>
    </section>

    <section className="sa-card sa-form">
      <header className="sa-card-head"><h2>۲. فروشگاه</h2></header>
      <div className="sa-cols">
        <label className="sa-field"><span>نام فروشگاه</span><input className="input" value={form.shopName} onChange={(e) => set({ shopName: e.target.value })} required maxLength={60} placeholder="مثلاً: دیجی‌لند" /></label>
        <label className="sa-field"><span>نشانی فروشگاه در سایت</span><div className="sl-slug"><span dir="ltr">/shop/</span><input className="input" dir="ltr" value={form.slug} onChange={(e) => set({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} required placeholder="digiland" /></div></label>
        <label className="sa-field"><span>موبایل یا تلفن فروشگاه</span><input className="input" dir="ltr" inputMode="tel" value={form.phone} onChange={(e) => set({ phone: e.target.value })} required placeholder="09121234567" /></label>
        <label className="sa-field"><span>ایمیل (اختیاری)</span><input className="input" dir="ltr" type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} /></label>
        <label className="sa-field"><span>شهر</span><input className="input" value={form.city} onChange={(e) => set({ city: e.target.value })} /></label>
        <label className="sa-field"><span>نشانی انبار یا دفتر</span><input className="input" value={form.address} onChange={(e) => set({ address: e.target.value })} /></label>
      </div>
      <label className="sa-field"><span>معرفی کوتاه فروشگاه</span><textarea className="textarea" rows={3} value={form.about} onChange={(e) => set({ about: e.target.value })} maxLength={2000} /></label>
    </section>

    <section className="sa-card sa-form">
      <header className="sa-card-head"><h2>۳. حساب بانکی برای تسویه</h2></header>
      <div className="sa-cols">
        <label className="sa-field"><span>شمارهٔ شبا</span><input className="input" dir="ltr" value={form.iban} onChange={(e) => set({ iban: e.target.value })} placeholder="IR000000000000000000000000" /></label>
        <label className="sa-field"><span>نام صاحب حساب</span><input className="input" value={form.ibanOwner} onChange={(e) => set({ ibanOwner: e.target.value })} /></label>
      </div>
      <p className="sa-hint">می‌توانید بعداً هم از پروفایل فروشگاه وارد کنید؛ برای برداشت وجه الزامی است.</p>
    </section>

    <section className="sa-card sa-form">
      <header className="sa-card-head"><h2>۴. قوانین فروشندگی</h2></header>
      {terms ? <div className="sl-terms">{terms}</div> : <ul className="sl-terms-list"><li>محصولات باید اصل، سالم و مطابق توضیحات باشند.</li><li>سفارش‌ها باید در مهلت تعیین‌شده تأیید و آمادهٔ ارسال شوند.</li><li>کارمزد فروش از هر سفارش کسر و مابقی پس از دورهٔ مرجوعی قابل برداشت است.</li><li>امتیاز خریداران در نمایش و رتبهٔ فروشگاه اثر دارد.</li></ul>}
      <label className="sa-check"><input type="checkbox" checked={form.acceptTerms} onChange={(e) => set({ acceptTerms: e.target.checked })} /> قوانین فروشندگی را خواندم و می‌پذیرم</label>
    </section>

    {error && <p className="sa-notice is-error" role="alert">{error}</p>}
    <div className="sl-apply-actions"><button type="submit" className="btn btn-primary" disabled={busy || !form.acceptTerms}>{busy ? 'در حال ارسال…' : 'ارسال درخواست فروشندگی'}</button></div>
  </form>
}
