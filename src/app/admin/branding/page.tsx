'use client'

import { useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import type { SiteConfig } from '@/modules/site/config/types'
import LogoEditor from './LogoEditor'

type Slot = 'wordmark' | 'wordmarkDark' | 'logo' | 'favicon' | 'appleIcon' | 'appIcon' | 'maskableIcon'
const identitySlots = new Set(['favicon', 'appleIcon', 'appIcon', 'maskableIcon'])
const SLOTS: { id: Slot; title: string; hint: string; trim: boolean }[] = [
  { id: 'wordmark', title: 'لوگوی اصلی (افقی، با نام)', hint: 'در هدر سایت و پنل‌ها، به جای نام سایت نمایش داده می‌شود. بهترین نتیجه: PNG بدون پس‌زمینه، دست‌کم ۶۰۰ پیکسل عرض.', trim: true },
  { id: 'wordmarkDark', title: 'نسخهٔ حالت تاریک (اختیاری)', hint: 'اگر لوگوی اصلی روی زمینهٔ تیره دیده نمی‌شود، نسخهٔ روشن آن را این‌جا بگذارید.', trim: true },
  { id: 'favicon', title: 'آیکون مرورگر (favicon)', hint: 'نشان تب مرورگر و علاقه‌مندی‌ها. تصویر مربعی PNG یا نشانی فایل ICO / SVG؛ پیشنهاد: ۴۸ یا ۹۶ پیکسل.', trim: false },
  { id: 'appleIcon', title: 'آیکون دستگاه اپل', hint: 'برای افزودن سایت به صفحهٔ اصلی آیفون و آیپد. پیشنهاد: PNG مربعی ۱۸۰ پیکسل.', trim: false },
  { id: 'appIcon', title: 'آیکون برنامهٔ نصب‌شونده', hint: 'آیکون PWA در موبایل و دسکتاپ. پیشنهاد: PNG مربعی ۵۱۲ پیکسل. خالی بماند، آیکون از نشان مربعی ساخته می‌شود.', trim: false },
  { id: 'maskableIcon', title: 'آیکون با حاشیهٔ امن (اختیاری)', hint: 'برای برش گرد یا مربعی اندروید؛ نشان را در ۸۰٪ مرکز تصویر نگه دارید.', trim: false },
  { id: 'logo', title: 'نشان مربعی', hint: 'نسخهٔ کوچک و مربعی (مثلاً فقط نماد MC) برای مینی‌اپ، جاهای کوچک و داده‌های ساختاریافته.', trim: true },
]

/** The site's brand: a wide logo for headers (and its dark version), a square mark, and how tall the logo sits. */
export default function BrandingPage() {
  const [config, setConfig] = useState<SiteConfig | null>(null)
  const [saved, setSaved] = useState(''), [revision, setRevision] = useState('')
  const [editing, setEditing] = useState<{ slot: Slot; file: File } | null>(null)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch('/api/admin/site', { cache: 'no-store' }).then(async (response) => {
      const payload = response.ok ? await response.json().catch(() => null) : null
      const data = payload?.config
      if (!data) { setNotice({ ok: false, text: 'تنظیمات سایت دریافت نشد؛ دسترسی «تنظیمات» لازم است.' }); return }
      setConfig(data); setSaved(JSON.stringify(data)); setRevision(payload.revision)
    }).catch(() => setNotice({ ok: false, text: 'ارتباط برقرار نشد.' }))
  }, [])

  if (!config) return <div className="br-page">{notice ? <p className="br-alert is-bad" role="alert">{notice.text}</p> : <div className="br-skeleton is-tall" aria-busy="true" />}</div>
  const set = (patch: Partial<SiteConfig>) => setConfig(previous => previous ? { ...previous, ...patch } : previous)
  const setIdentity = (patch: Partial<NonNullable<SiteConfig['identity']>>) => setConfig(previous => previous ? { ...previous, identity: { ...previous.identity, ...patch } } : previous)
  const setSlot = (slot: Slot, value: string) => setConfig(previous => !previous ? previous : identitySlots.has(slot) ? { ...previous, identity: { ...previous.identity, [slot]: value } } : { ...previous, [slot]: value })
  const height = config.wordmarkHeight || 40
  const dirty = JSON.stringify(config) !== saved

  async function save() {
    if (!config) return
    setBusy(true); setNotice(null)
    try {
      const changes = Object.fromEntries(['brand', 'tagline', 'copyright', 'logo', 'wordmark', 'wordmarkDark', 'wordmarkHeight', 'identity'].filter(key => (config as unknown as Record<string, unknown>)[key] !== undefined).map(key => [key, (config as unknown as Record<string, unknown>)[key]]))
      const response = await fetch('/api/admin/site', { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'If-Match': revision }, body: JSON.stringify({ changes }) })
      const data = await response.json().catch(() => null)
      if (!response.ok) { setNotice({ ok: false, text: data?.error || 'ذخیره نشد.' }); return }
      setConfig(data.config); setRevision(data.revision); setSaved(JSON.stringify(data.config)); setNotice({ ok: true, text: 'هویت برند ذخیره شد و روی همهٔ صفحه‌ها اعمال می‌شود.' })
    } catch { setNotice({ ok: false, text: 'ارتباط برقرار نشد.' }) } finally { setBusy(false) }
  }

  const mock = (dark: boolean) => {
    const image = dark ? config.wordmarkDark || config.wordmark : config.wordmark
    return <div className={`br-mock${dark ? ' is-dark' : ''}`} aria-hidden="true">
      <span className="br-mock-brand">{image ? <img src={image} alt="" style={{ height }} /> : <><i>{config.brand.trim().slice(0, 1)}</i><b>{config.brand}</b></>}</span>
      <span className="br-mock-nav"><i /><i /><i /><i /></span>
      <span className="br-mock-actions"><i /><i className="is-cta" /></span>
    </div>
  }

  return <div className="br-page">
    <header className="br-head">
      <div><h1>لوگو و هویت برند</h1><p>لوگوی خودتان را بگذارید؛ اگر پس‌زمینه دارد، همین‌جا حذفش کنید. پیش‌نمایش پایین همان چیزی است که بازدیدکننده می‌بیند.</p></div>
      <div className="br-head-actions">
        <Link href="/" target="_blank" className="btn btn-ghost"><Icon name="external" size={16} /> مشاهدهٔ سایت</Link>
        <button type="button" className="btn btn-primary" disabled={busy || !dirty || !!editing} onClick={() => void save()}>{busy ? 'در حال ذخیره…' : dirty ? 'ذخیرهٔ تغییرات' : 'ذخیره شده'}</button>
      </div>
    </header>
    {notice && <p className={`br-alert ${notice.ok ? 'is-ok' : 'is-bad'}`} role="status">{notice.text}</p>}

    <fieldset className="br-fields" disabled={busy} aria-label="هویت سایت">
    <section className="br-card br-preview" aria-labelledby="br-preview-title">
      <header><h2 id="br-preview-title">پیش‌نمایش هدر</h2><small>حالت روشن و تیره</small></header>
      {mock(false)}
      {mock(true)}
      <label className="br-range"><span>ارتفاع لوگو در هدر: {height.toLocaleString('fa-IR')} پیکسل</span><input type="range" min={24} max={72} value={height} onChange={(e) => set({ wordmarkHeight: Number(e.target.value) || 40 })} /><small>در پنل‌ها و فوتر کمی کوچک‌تر نمایش داده می‌شود.</small></label>
    </section>

    <div className="br-slots">
      {SLOTS.map((slot) => {
        const value = identitySlots.has(slot.id) ? String(config.identity?.[slot.id as keyof NonNullable<SiteConfig['identity']>] || '') : String(config[slot.id as 'logo' | 'wordmark' | 'wordmarkDark'] || '')
        return <section key={slot.id} className="br-card br-slot" aria-labelledby={`br-${slot.id}`}>
          <header><h2 id={`br-${slot.id}`}>{slot.title}</h2>{value && <span className="br-tag">تنظیم شده</span>}</header>
          <p>{slot.hint}</p>
          <div className={`br-current${slot.id === 'wordmarkDark' ? ' is-dark' : ' is-checker'}${slot.id === 'logo' ? ' is-square' : ''}`}>{value ? <img src={value} alt="" /> : <span>هنوز تصویری نگذاشته‌اید</span>}</div>
          {identitySlots.has(slot.id) && <label className="br-field"><span>نشانی تصویر: {slot.title}</span><input className="input" dir="ltr" value={value} maxLength={2048} placeholder="/uploads/… یا https://…" onChange={e => setSlot(slot.id, e.target.value)} /></label>}
          {editing?.slot === slot.id ? <LogoEditor file={editing.file} trim={slot.trim} onCancel={() => setEditing(null)} onDone={(url) => { setSlot(slot.id, url); setEditing(null); setNotice({ ok: true, text: 'تصویر آماده است؛ برای اعمال روی سایت «ذخیرهٔ تغییرات» را بزنید.' }) }} />
            : <div className="br-slot-actions">
              <label className="btn btn-primary"><Icon name="upload" size={16} /> {value ? 'تعویض تصویر' : 'انتخاب تصویر'}<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) setEditing({ slot: slot.id, file }) }} /></label>
              {value && <button type="button" className="btn btn-ghost" onClick={() => setSlot(slot.id, '')}>حذف</button>}
            </div>}
        </section>
      })}
    </div>

    <section className="br-card br-name">
      <header><h2>هویت متنی و برنامه</h2></header>
      <label className="br-field"><span>شعار سایت</span><input className="input" value={config.tagline.fa} maxLength={200} onChange={e => set({ tagline: { ...config.tagline, fa: e.target.value } })} /></label>
      <label className="br-field"><span>متن کپی‌رایت</span><input className="input" value={config.copyright.fa} maxLength={300} onChange={e => set({ copyright: { ...config.copyright, fa: e.target.value } })} /></label>
      <label className="br-field"><span>نام کوتاه برنامه</span><input className="input" value={config.identity?.shortName || ''} maxLength={30} onChange={e => setIdentity({ shortName: e.target.value })} placeholder={config.brand.slice(0, 12)} /></label>
      {(['themeColor', 'backgroundColor'] as const).map(key => <label className="br-field" key={key}><span>{key === 'themeColor' ? 'رنگ نوار مرورگر و برنامه' : 'رنگ پس‌زمینهٔ شروع برنامه'}</span><input className="input" dir="ltr" maxLength={7} placeholder={key === 'themeColor' ? '#6d4aff' : '#ffffff'} value={config.identity?.[key] || ''} onChange={e => setIdentity({ [key]: e.target.value })} /><small>کد شش‌رقمی رنگ؛ خالی برای پیش‌فرض قالب.</small></label>)}
      <p>برای حذف تصویر اختصاصی، آن را خالی کنید. مرورگر و دستگاه ممکن است آیکون قبلی را مدتی در حافظه نگه دارند؛ برای تعویض، فایل تازه با نشانی تازه انتخاب کنید.</p>
      <div className="br-slot-actions"><Link className="btn btn-ghost" href="/admin/settings">نشانی سایت و تنظیمات پایه</Link><Link className="btn btn-ghost" href="/admin/seo">عنوان‌ها، توضیحات و تصویر اشتراک‌گذاری</Link><Link className="btn btn-ghost" href="/admin/studio">اطلاعات تماس، شبکه‌ها و ظاهر سایت</Link><Link className="btn btn-ghost" href="/admin/homepage">طرح صفحهٔ اول</Link></div>
    </section>
    <section className="br-card br-name">
      <header><h2>نام برند</h2></header>
      <label className="br-field"><span>نام سایت</span><input className="input" value={config.brand} maxLength={60} onChange={(e) => set({ brand: e.target.value })} /><small>وقتی لوگوی افقی دارید، نام فقط برای خوانندهٔ صفحه، عنوان صفحه‌ها و جاهای متنی استفاده می‌شود.</small></label>
    </section>
    </fieldset>
  </div>
}
