'use client'

import SectionSettingsHistoryLink from '@/components/admin/SectionSettingsHistoryLink'

import Link from '@/components/AppLink'
import { useEffect, useState } from 'react'
import { CINEMA_RAILS, type CinemaSettings } from '@/modules/cinema/domain/cinema'
import { OrderedPicker, RailsEditor } from '../../cms/SectionAdmin'
import { CinemaShell, Notice, fa, send, useJson } from '../shared'
import { CinemaMetadataSettings } from '@/components/admin/CinemaMetadata'
import CinemaFoundSubtitles from '@/components/admin/CinemaFoundSubtitles'

type Picker = { id: number; title: string; poster: string; kind: string; year: number | null }

/** Film & series home layout (blocks, slider picks, shelf sizes) and display options. */
export default function CinemaSettingsPage() {
  const { data, error } = useJson<{ settingsRevision: string; settings: CinemaSettings; picker: { titles: Picker[] } }>('/api/admin/cinema/settings')
  const [form, setForm] = useState<CinemaSettings | null>(null)
  const [revision, setRevision] = useState('')
  const [baseline, setBaseline] = useState<CinemaSettings | null>(null)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (data) { setForm(current => current ?? data.settings); setBaseline(current => current ?? data.settings); setRevision(current => current || data.settingsRevision || '') } }, [data])

  if (!form) return <CinemaShell title="صفحهٔ اصلی و تنظیمات">{error ? <Notice tone="error">{error}</Notice> : <div className="sa-skeleton" aria-busy="true" />}</CinemaShell>
  const set = (patch: Partial<CinemaSettings>) => { setMessage(null); setForm(current => current ? { ...current, ...patch } : current) }
  const items = (data?.picker.titles || []).map((title) => ({ id: title.id, title: title.title, image: title.poster, sub: `${title.kind === 'SERIES' ? 'سریال' : 'فیلم'}${title.year ? ` · ${fa(title.year)}` : ''}` }))

  async function save() {
    if (!form) return
    setBusy(true)
    const patch = Object.fromEntries(Object.entries(form).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(baseline?.[key as keyof CinemaSettings])))
    const response = await send<{ settingsRevision: string; settings: CinemaSettings }>('/api/admin/cinema/settings', 'POST', patch, revision ? { 'if-match': revision } : {})
    setBusy(false)
    if (!response.ok) { setMessage({ tone: 'error', text: response.error }); return }
    setForm(response.data.settings)
    setBaseline(response.data.settings)
    setRevision(response.data.settingsRevision)
    setMessage({ tone: 'ok', text: 'تنظیمات ذخیره شد و صفحهٔ اصلی فیلم و سریال به‌روز است' })
  }

  return <div className="cm-section-settings"><CinemaShell title="صفحهٔ اصلی و تنظیمات" actions={<><SectionSettingsHistoryLink section="cinema" /><a href="/cinema" target="_blank" rel="noreferrer" className="btn btn-ghost">پیش‌نمایش</a><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'در حال ذخیره…' : 'ذخیره'}</button></>}>
    {message && <Notice tone={message.tone}>{message.text}</Notice>}
    <fieldset disabled={busy} className="sa-settings-fields" aria-label="تنظیمات بخش">
    <div className="sa-cols">
      <div className="sa-stack">
        <CinemaMetadataSettings />
        <section className="sa-card">
          <header className="sa-card-head"><h2>بلوک‌های صفحهٔ اصلی</h2><small>ترتیب و نمایش</small></header>
          <RailsEditor rails={form.rails} labels={CINEMA_RAILS} onChange={(rails) => set({ rails })} />
        </section>
        <section className="sa-card">
          <header className="sa-card-head"><h2>قفسه‌ها</h2></header>
          <label className="sa-field"><span>تعداد عنوان در هر قفسه</span><input className="input num" type="number" min={6} max={24} value={form.shelfSize} onChange={(e) => { if (e.target.value !== '' && Number.isFinite(e.target.valueAsNumber)) set({ shelfSize: e.target.valueAsNumber }) }} /><small className="sa-sub">بین ۶ تا ۲۴</small></label>
          <label className="sa-field"><span>تعداد قفسه‌های ژانر</span><input className="input num" type="number" min={0} max={6} value={form.genreShelfCount} onChange={(e) => { if (e.target.value !== '' && Number.isFinite(e.target.valueAsNumber)) set({ genreShelfCount: e.target.valueAsNumber }) }} /><small className="sa-sub">پرکاربردترین ژانرها، هر کدام یک قفسه (۰ = خاموش)</small></label>
          <label className="sa-field"><span>حداقل امتیاز IMDb برای «برترین‌ها»</span><input className="input num" type="number" min={0} max={10} step={0.1} value={form.topRatedMin} onChange={(e) => { if (e.target.value !== '' && Number.isFinite(e.target.valueAsNumber)) set({ topRatedMin: e.target.valueAsNumber }) }} /><small className="sa-sub">۰ = همهٔ عنوان‌های دارای امتیاز</small></label>
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
          <label className="sa-check"><input type="checkbox" checked={form.showPersonBiography} onChange={e => set({ showPersonBiography: e.target.checked })} />نمایش زندگی‌نامهٔ عوامل در پروفایل عمومی</label>
          <label className="sa-check"><input type="checkbox" checked={form.personFollowEnabled} onChange={e => set({ personFollowEnabled: e.target.checked })} />دنبال‌کردن عوامل و اعلان اثر تازه</label>
          <label className="sa-check"><input type="checkbox" checked={form.enableAssSubtitles} onChange={e => set({ enableAssSubtitles: e.target.checked })} />زیرنویس ASS با استایل در پخش‌کننده</label>
          <label className="sa-check"><input type="checkbox" checked={form.enableSeparateAudio} onChange={e => set({ enableSeparateAudio: e.target.checked })} />انتخاب صدای جداگانه در پخش‌کننده</label>
        </section>
        <section className="sa-card">
          <header className="sa-card-head"><h2>زیرنویس همراه فایل</h2><small>کنار فایل یا داخل MKV/MP4</small></header>
          <label className="sa-check"><input type="checkbox" checked={form.findSubtitles} onChange={e => set({ findSubtitles: e.target.checked })} />یافتن خودکار زیرنویس هر فایل و نمایش آن در پخش‌کننده</label>
          <p className="sa-sub">فایل زیرنویس هم‌نام در همان پوشه (مثل <bdi dir="ltr">Film.1080p.fa.srt</bdi> کنار <bdi dir="ltr">Film.1080p.mkv</bdi>) و زیرنویس‌های متنی داخل فایل خوانده می‌شوند؛ هر زیرنویس فقط با همان فایل پخش می‌شود. زیرنویس‌های تصویری (PGS/VobSub) قابل نمایش در مرورگر نیستند.</p>
          <label className="sa-field"><span>سقف حجم فایل برای خواندن زیرنویس داخل آن (گیگابایت)</span><input className="input num" type="number" min={1} max={100} value={form.subtitleScanMaxGB} onChange={(e) => { if (e.target.value !== '' && Number.isFinite(e.target.valueAsNumber)) set({ subtitleScanMaxGB: e.target.valueAsNumber }) }} /><small className="sa-sub">زیرنویس داخل فایل لابه‌لای تصویر و صدا قرار دارد و برای برداشتنش کل فایل یک‌بار خوانده می‌شود</small></label>
          <CinemaFoundSubtitles />
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
  </fieldset></CinemaShell></div>
}
