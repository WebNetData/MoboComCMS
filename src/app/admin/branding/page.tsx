'use client'

import { useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import type { SiteConfig } from '@/modules/site/config/types'
import LogoEditor from './LogoEditor'

type Slot = 'wordmark' | 'wordmarkDark' | 'logo'
const SLOTS: { id: Slot; title: string; hint: string; trim: boolean }[] = [
  { id: 'wordmark', title: 'لوگوی اصلی (افقی، با نام)', hint: 'در هدر سایت و پنل‌ها، به جای نام سایت نمایش داده می‌شود. بهترین نتیجه: PNG بدون پس‌زمینه، دست‌کم ۶۰۰ پیکسل عرض.', trim: true },
  { id: 'wordmarkDark', title: 'نسخهٔ حالت تاریک (اختیاری)', hint: 'اگر لوگوی اصلی روی زمینهٔ تیره دیده نمی‌شود، نسخهٔ روشن آن را این‌جا بگذارید.', trim: true },
  { id: 'logo', title: 'نشان مربعی', hint: 'نسخهٔ کوچک و مربعی (مثلاً فقط نماد MC) برای مینی‌اپ، جاهای کوچک و داده‌های ساختاریافته.', trim: true },
]

/** The site's brand: a wide logo for headers (and its dark version), a square mark, and how tall the logo sits. */
export default function BrandingPage() {
  const [config, setConfig] = useState<SiteConfig | null>(null)
  const [saved, setSaved] = useState('')
  const [editing, setEditing] = useState<{ slot: Slot; file: File } | null>(null)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch('/api/admin/site', { cache: 'no-store' }).then(async (response) => {
      const data = response.ok ? (await response.json().catch(() => null))?.config : null
      if (!data) { setNotice({ ok: false, text: 'تنظیمات سایت دریافت نشد؛ دسترسی «تنظیمات» لازم است.' }); return }
      setConfig(data); setSaved(JSON.stringify(data))
    }).catch(() => setNotice({ ok: false, text: 'ارتباط برقرار نشد.' }))
  }, [])

  if (!config) return <div className="br-page">{notice ? <p className="br-alert is-bad" role="alert">{notice.text}</p> : <div className="br-skeleton is-tall" aria-busy="true" />}</div>
  const set = (patch: Partial<SiteConfig>) => setConfig({ ...config, ...patch })
  const height = config.wordmarkHeight || 40
  const dirty = JSON.stringify(config) !== saved

  async function save() {
    if (!config) return
    setBusy(true); setNotice(null)
    try {
      const response = await fetch('/api/admin/site', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config) })
      const data = await response.json().catch(() => null)
      if (!response.ok) { setNotice({ ok: false, text: data?.error || 'ذخیره نشد.' }); return }
      setSaved(JSON.stringify(config)); setNotice({ ok: true, text: 'هویت برند ذخیره شد و روی همهٔ صفحه‌ها اعمال می‌شود.' })
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
        <button type="button" className="btn btn-primary" disabled={busy || !dirty} onClick={() => void save()}>{busy ? 'در حال ذخیره…' : dirty ? 'ذخیرهٔ تغییرات' : 'ذخیره شده'}</button>
      </div>
    </header>
    {notice && <p className={`br-alert ${notice.ok ? 'is-ok' : 'is-bad'}`} role="status">{notice.text}</p>}

    <section className="br-card br-preview" aria-labelledby="br-preview-title">
      <header><h2 id="br-preview-title">پیش‌نمایش هدر</h2><small>حالت روشن و تیره</small></header>
      {mock(false)}
      {mock(true)}
      <label className="br-range"><span>ارتفاع لوگو در هدر: {height.toLocaleString('fa-IR')} پیکسل</span><input type="range" min={24} max={72} value={height} onChange={(e) => set({ wordmarkHeight: Number(e.target.value) || 40 })} /><small>در پنل‌ها و فوتر کمی کوچک‌تر نمایش داده می‌شود.</small></label>
    </section>

    <div className="br-slots">
      {SLOTS.map((slot) => {
        const value = (config[slot.id] as string | undefined) || ''
        return <section key={slot.id} className="br-card br-slot" aria-labelledby={`br-${slot.id}`}>
          <header><h2 id={`br-${slot.id}`}>{slot.title}</h2>{value && <span className="br-tag">تنظیم شده</span>}</header>
          <p>{slot.hint}</p>
          <div className={`br-current${slot.id === 'wordmarkDark' ? ' is-dark' : ' is-checker'}${slot.id === 'logo' ? ' is-square' : ''}`}>{value ? <img src={value} alt="" /> : <span>هنوز تصویری نگذاشته‌اید</span>}</div>
          {editing?.slot === slot.id ? <LogoEditor file={editing.file} trim={slot.trim} onCancel={() => setEditing(null)} onDone={(url) => { set({ [slot.id]: url } as Partial<SiteConfig>); setEditing(null); setNotice({ ok: true, text: 'تصویر آماده است؛ برای اعمال روی سایت «ذخیرهٔ تغییرات» را بزنید.' }) }} />
            : <div className="br-slot-actions">
              <label className="btn btn-primary"><Icon name="upload" size={16} /> {value ? 'تعویض تصویر' : 'انتخاب تصویر'}<input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) setEditing({ slot: slot.id, file }) }} /></label>
              {value && <button type="button" className="btn btn-ghost" onClick={() => set({ [slot.id]: '' } as Partial<SiteConfig>)}>حذف</button>}
            </div>}
        </section>
      })}
    </div>

    <section className="br-card br-name">
      <header><h2>نام برند</h2></header>
      <label className="br-field"><span>نام سایت</span><input className="input" value={config.brand} maxLength={60} onChange={(e) => set({ brand: e.target.value })} /><small>وقتی لوگوی افقی دارید، نام فقط برای خوانندهٔ صفحه، عنوان صفحه‌ها و جاهای متنی استفاده می‌شود.</small></label>
    </section>
  </div>
}
