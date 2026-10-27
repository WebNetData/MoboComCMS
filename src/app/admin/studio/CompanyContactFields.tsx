'use client'

import { useState } from 'react'
import Link from '@/components/AppLink'
import { coordinatesFromMapLink, emptyCompanyContact, normalizeCompanyContact, companyMapLinks, type CompanyContact } from '@/modules/site/domain/company-contact'

export default function CompanyContactFields({ value, onChange }: { value?: CompanyContact; onChange: (value: CompanyContact) => void }) {
  const draft = { ...emptyCompanyContact(), ...value }
  const [mapLink, setMapLink] = useState(''), [notice, setNotice] = useState('')
  let error = '', map = null
  try { map = companyMapLinks(normalizeCompanyContact(draft)) } catch (e) { error = e instanceof Error ? e.message : 'اطلاعات معتبر نیست' }
  const patch = (data: Partial<CompanyContact>) => onChange({ ...draft, ...data })
  const fields = [['phone', 'شماره تماس', '+98 ...'], ['email', 'ایمیل عمومی', 'hello@your-domain'], ['telegram', 'تلگرام', '@username یا https://t.me/username'], ['instagram', 'اینستاگرام', '@username یا لینک پروفایل'], ['x', 'حساب X', '@username یا لینک پروفایل']] as const
  return <section className="card studio-editor" id="contact-information" aria-labelledby="company-contact-title">
    <h2 id="company-contact-title">اطلاعات تماس و نقشهٔ موبوکام</h2>
    <p className="studio-help">این اطلاعات در صفحه‌های دارای پنل تماس نمایش داده می‌شوند؛ مورد خالی نمایش داده نمی‌شود. متن دربارهٔ ما و تماس با ما در <Link href="/admin/pages" className="text-link">مدیریت صفحات</Link> قابل ویرایش است.</p>
    <div className="sh-grid">{fields.map(([key, label, placeholder]) => <label className="sh-field" key={key}><span>{label}</span><input className="sh-input" dir="ltr" value={draft[key]} placeholder={placeholder} maxLength={254} onChange={e => patch({ [key]: e.target.value })} /></label>)}</div>
    <label className="studio-field"><span>نشانی دفتر</span><textarea className="textarea" rows={3} value={draft.address} maxLength={800} onChange={e => patch({ address: e.target.value })} /></label>
    <label className="studio-field"><span>ساعت پاسخ‌گویی یا مراجعه</span><input className="input" value={draft.hours} maxLength={500} onChange={e => patch({ hours: e.target.value })} /></label>
    <div className="studio-item">
      <h3>انتخاب پین نقشه</h3><p className="studio-help">لینک کامل پین گوگل را بچسبانید یا مختصات را وارد کنید. محل پین از مرکز دوربین نقشه جداست. نمایش نقشه بدون کلید API با OpenStreetMap است؛ مسیر‌یابی در گوگل باز می‌شود.</p>
      <label className="studio-field"><span>لینک پین Google Maps یا OpenStreetMap</span><input className="input" dir="ltr" value={mapLink} maxLength={4096} onChange={e => setMapLink(e.target.value)} placeholder="https://www.google.com/maps/place/..." /></label>
      <button type="button" className="btn btn-ghost" onClick={() => { try { patch({ ...coordinatesFromMapLink(mapLink), mapEnabled: true }); setNotice('پین استخراج شد؛ پیش‌نمایش را بررسی کنید و تنظیمات را منتشر کنید.') } catch (e) { setNotice(e instanceof Error ? e.message : 'لینک معتبر نیست') } }}>دریافت پین از لینک</button>
      {notice && <p role="status" className="studio-help">{notice}</p>}
      <div className="sh-grid">{(['latitude', 'longitude'] as const).map(key => <label className="sh-field" key={key}><span>{key === 'latitude' ? 'عرض جغرافیایی' : 'طول جغرافیایی'}</span><input className="sh-input" dir="ltr" type="number" min={key === 'latitude' ? -90 : -180} max={key === 'latitude' ? 90 : 180} step="any" value={draft[key] ?? ''} onChange={e => patch({ [key]: e.target.value === '' ? null : Number(e.target.value) })} /></label>)}</div>
      <label className="studio-field"><span>بزرگ‌نمایی نقشه · {draft.zoom.toLocaleString('fa-IR')}</span><input type="range" min={8} max={19} value={draft.zoom} onChange={e => patch({ zoom: Number(e.target.value) })} /></label>
      <label className="studio-switch"><input type="checkbox" checked={draft.mapEnabled} onChange={e => patch({ mapEnabled: e.target.checked })} />نمایش نقشه و پین در صفحات تماس</label>
      {map && <p className="studio-help"><a href={map.google} target="_blank" rel="noreferrer">بررسی محل پین روی نقشه ↗</a></p>}
    </div>
    {error && <p role="alert" className="error-text">{error}</p>}
  </section>
}
