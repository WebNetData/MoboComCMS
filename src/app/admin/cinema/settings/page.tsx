'use client'

import Link from '@/components/AppLink'
import { useEffect, useState } from 'react'
import { CINEMA_RAILS, type CinemaSettings } from '@/modules/cinema/domain/cinema'
import { OrderedPicker, RailsEditor } from '../../cms/SectionAdmin'
import { CinemaShell, Notice, fa, send, useJson } from '../shared'
import { CinemaMetadataSettings } from '@/components/admin/CinemaMetadata'

type Picker = { id: number; title: string; poster: string; kind: string; year: number | null }

/** Film & series home layout (blocks, slider picks, shelf sizes) and display options. */
export default function CinemaSettingsPage() {
  const { data, error } = useJson<{ settings: CinemaSettings; picker: { titles: Picker[] } }>('/api/admin/cinema/settings')
  const [form, setForm] = useState<CinemaSettings | null>(null)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (data) setForm(data.settings) }, [data])

  if (!form) return <CinemaShell title="صفحهٔ اصلی و تنظیمات">{error ? <Notice tone="error">{error}</Notice> : <div className="sa-skeleton" aria-busy="true" />}</CinemaShell>
  const set = (patch: Partial<CinemaSettings>) => { setMessage(null); setForm({ ...form, ...patch }) }
  const items = (data?.picker.titles || []).map((title) => ({ id: title.id, title: title.title, image: title.poster, sub: `${title.kind === 'SERIES' ? 'سریال' : 'فیلم'}${title.year ? ` · ${fa(title.year)}` : ''}` }))

  async function save() {
    if (!form) return
    setBusy(true)
    const response = await send<{ settings: CinemaSettings }>('/api/admin/cinema/settings', 'POST', form)
    setBusy(false)
    if (!response.ok) { setMessage({ tone: 'error', text: response.error }); return }
    setForm(response.data.settings)
    setMessage({ tone: 'ok', text: 'تنظیمات ذخیره شد و صفحهٔ اصلی فیلم و سریال به‌روز است' })
  }

  return <CinemaShell title="صفحهٔ اصلی و تنظیمات" actions={<><a href="/cinema" target="_blank" rel="noreferrer" className="btn btn-ghost">پیش‌نمایش</a><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'در حال ذخیره…' : 'ذخیره'}</button></>}>
    {message && <Notice tone={message.tone}>{message.text}</Notice>}
    <div className="sa-cols">
      <div className="sa-stack">
        <CinemaMetadataSettings />
        <section className="sa-card">
          <header className="sa-card-head"><h2>بلوک‌های صفحهٔ اصلی</h2><small>ترتیب و نمایش</small></header>
          <RailsEditor rails={form.rails} labels={CINEMA_RAILS} onChange={(rails) => set({ rails })} />
        </section>
        <section className="sa-card">
          <header className="sa-card-head"><h2>قفسه‌ها</h2></header>
          <label className="sa-field"><span>تعداد عنوان در هر قفسه</span><input className="input num" type="number" min={6} max={24} value={form.shelfSize} onChange={(e) => set({ shelfSize: Number(e.target.value) })} /><small className="sa-sub">بین ۶ تا ۲۴</small></label>
          <label className="sa-field"><span>تعداد قفسه‌های ژانر</span><input className="input num" type="number" min={0} max={6} value={form.genreShelfCount} onChange={(e) => set({ genreShelfCount: Number(e.target.value) })} /><small className="sa-sub">پرکاربردترین ژانرها، هر کدام یک قفسه (۰ = خاموش)</small></label>
          <label className="sa-field"><span>حداقل امتیاز IMDb برای «برترین‌ها»</span><input className="input num" type="number" min={0} max={10} step={0.1} value={form.topRatedMin} onChange={(e) => set({ topRatedMin: Number(e.target.value) })} /><small className="sa-sub">۰ = همهٔ عنوان‌های دارای امتیاز</small></label>
        </section>
      </div>
      <div className="sa-stack">
        <section className="sa-card">
          <header className="sa-card-head"><h2>اسلایدر بالای صفحه</h2><small>خالی = عنوان‌های «ویژه»، سپس تازه‌ترین‌ها</small></header>
          <OrderedPicker items={items} ids={form.heroIds} max={8} placeholder="افزودن فیلم یا سریال به اسلایدر…" onChange={(heroIds) => set({ heroIds })} />
        </section>
        <section className="sa-card">
          <header className="sa-card-head"><h2>نمایش</h2></header>
          <label className="sa-check"><input type="checkbox" checked={form.showImdb} onChange={(e) => set({ showImdb: e.target.checked })} />نمایش امتیاز IMDb در اسلایدر</label>
        </section>
        <section className="sa-card">
          <header className="sa-card-head"><h2>تنظیمات دیگر بخش</h2></header>
          <ul className="sa-rows">
            <li><Link href="/admin/sections/cinema"><span className="sa-grow"><b>آدرس بخش و سئو</b><small>تغییر مسیر /cinema، عنوان و توضیح متا</small></span><span className="sa-link">باز کردن</span></Link></li>
            <li><Link href="/admin/taxonomy?tax=cinema"><span className="sa-grow"><b>دسته‌بندی و زیردسته</b><small>ساختار دسته‌های فیلم و سریال</small></span><span className="sa-link">باز کردن</span></Link></li>
            <li><Link href="/admin/downloads"><span className="sa-grow"><b>لینک‌ها و گزارش خرابی</b><small>لینک‌های امن، انقضا و گزارش کاربران</small></span><span className="sa-link">باز کردن</span></Link></li>
          </ul>
        </section>
      </div>
    </div>
  </CinemaShell>
}
