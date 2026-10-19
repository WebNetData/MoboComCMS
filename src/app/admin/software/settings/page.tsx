'use client'

import SectionSettingsHistoryLink from '@/components/admin/SectionSettingsHistoryLink'

import Link from '@/components/AppLink'
import { useEffect, useState } from 'react'
import { SOFTWARE_RAILS, type SoftwareSettings } from '@/modules/software/domain/software'
import { OrderedPicker, RailsEditor } from '../../cms/SectionAdmin'
import { Notice, SoftwareShell, send, useJson } from '../shared'

type Pick = { id: number; title: string; icon: string; version: string }

/** Software portal home (blocks, shelf sizes, editor picks) and freshness rule. */
export default function SoftwareSettingsPage() {
  const { data, error } = useJson<{ settingsRevision: string; settings: SoftwareSettings; picker: { titles: Pick[] } }>('/api/admin/software/settings')
  const [form, setForm] = useState<SoftwareSettings | null>(null)
  const [baseline, setBaseline] = useState<SoftwareSettings | null>(null)
  const [revision, setRevision] = useState('')
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (data) { setForm(current => current ?? data.settings); setBaseline(current => current ?? data.settings); setRevision(current => current || data.settingsRevision || '') } }, [data])

  if (!form) return <SoftwareShell title="صفحهٔ اصلی و تنظیمات">{error ? <Notice tone="error">{error}</Notice> : <div className="sa-skeleton" aria-busy="true" />}</SoftwareShell>
  const set = (patch: Partial<SoftwareSettings>) => { setMessage(null); setForm({ ...form, ...patch }) }

  async function save() {
    if (!form) return
    setBusy(true)
    const patch = Object.fromEntries(Object.entries(form).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(baseline?.[key as keyof SoftwareSettings])))
    const response = await send<{ settingsRevision: string; settings: SoftwareSettings }>('/api/admin/software/settings', 'POST', patch, revision ? { 'if-match': revision } : {})
    setBusy(false)
    if (!response.ok) { setMessage({ tone: 'error', text: response.error }); return }
    setForm(response.data.settings)
    setBaseline(response.data.settings)
    setRevision(response.data.settingsRevision)
    setMessage({ tone: 'ok', text: 'تنظیمات ذخیره شد و صفحهٔ اصلی نرم‌افزار به‌روز است' })
  }

  return <div className="cm-section-settings"><SoftwareShell title="صفحهٔ اصلی و تنظیمات" actions={<><SectionSettingsHistoryLink section="software" /><a href="/software" target="_blank" rel="noreferrer" className="btn btn-ghost">پیش‌نمایش</a><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'در حال ذخیره…' : 'ذخیره'}</button></>}>
    {message && <Notice tone={message.tone}>{message.text}</Notice>}
    <fieldset disabled={busy} className="sa-settings-fields" aria-label="تنظیمات بخش">
    <div className="sa-cols">
      <div className="sa-stack">
        <section className="sa-card">
          <header className="sa-card-head"><h2>بلوک‌های صفحهٔ اصلی</h2><small>ترتیب و نمایش</small></header>
          <RailsEditor rails={form.rails} labels={SOFTWARE_RAILS} onChange={(rails) => set({ rails })} />
          <p className="sa-hint">نوار آمار و کاشی‌ها همیشه بالای صفحه می‌آیند؛ ترتیب بقیه در ستون اصلی اعمال می‌شود.</p>
        </section>
        <section className="sa-card">
          <header className="sa-card-head"><h2>قفسه‌ها و اخبار</h2></header>
          <label className="sa-field"><span>تعداد نرم‌افزار در هر قفسه</span><input className="input num" type="number" min={4} max={16} value={form.shelfSize} onChange={(e) => { if (e.target.value !== '' && Number.isFinite(e.target.valueAsNumber)) set({ shelfSize: e.target.valueAsNumber }) }} /><small className="sa-sub">بین ۴ تا ۱۶</small></label>
          <label className="sa-field"><span>تعداد قفسه‌های دستهٔ اصلی</span><input className="input num" type="number" min={0} max={8} value={form.categoryShelfCount} onChange={(e) => { if (e.target.value !== '' && Number.isFinite(e.target.valueAsNumber)) set({ categoryShelfCount: e.target.valueAsNumber }) }} /><small className="sa-sub">پرمحتواترین دسته‌ها (مثل ویندوز و اندروید)، هر کدام یک قفسه</small></label>
          <label className="sa-field"><span>تعداد خبرهای فناوری</span><input className="input num" type="number" min={3} max={10} value={form.newsCount} onChange={(e) => { if (e.target.value !== '' && Number.isFinite(e.target.valueAsNumber)) set({ newsCount: e.target.valueAsNumber }) }} /></label>
        </section>
      </div>
      <div className="sa-stack">
        <section className="sa-card">
          <header className="sa-card-head"><h2>پیشنهاد سردبیر (ستون کناری)</h2><small>خالی = نرم‌افزارهای «ویژه»، سپس پردانلودها</small></header>
          <OrderedPicker items={(data?.picker.titles || []).map((row) => ({ id: row.id, title: row.title, image: row.icon, sub: row.version }))} ids={form.suggestionIds} max={10} placeholder="افزودن نرم‌افزار…" onChange={(suggestionIds) => set({ suggestionIds })} />
        </section>
        <section className="sa-card">
          <header className="sa-card-head"><h2>به‌روز بودن نسخه‌ها</h2></header>
          <label className="sa-field"><span>نسخه‌ای که قدیمی‌تر از این تعداد روز باشد «نیاز به به‌روزرسانی» دارد</span><input className="input num" type="number" min={30} max={730} value={form.staleDays} onChange={(e) => { if (e.target.value !== '' && Number.isFinite(e.target.valueAsNumber)) set({ staleDays: e.target.valueAsNumber }) }} /></label>
        </section>
        <section className="sa-card">
          <header className="sa-card-head"><h2>تنظیمات دیگر بخش</h2></header>
          <ul className="sa-rows">
            <li><Link href="/admin/sections/software"><span className="sa-grow"><b>آدرس بخش و سئو</b><small>تغییر مسیر /software، عنوان و توضیح متا</small></span><span className="sa-link">باز کردن</span></Link></li>
            <li><Link href="/admin/taxonomy?tax=software"><span className="sa-grow"><b>دسته‌بندی و زیردسته</b><small>پلتفرم‌ها و دسته‌ها؛ رنگ دسته، کاشی بالای صفحه را می‌سازد</small></span><span className="sa-link">باز کردن</span></Link></li>
            <li><Link href="/admin/mega-menu"><span className="sa-grow"><b>مگامنو و بنر تبلیغاتی</b><small>منوی بخش نرم‌افزار و بنر ستون کناری</small></span><span className="sa-link">باز کردن</span></Link></li>
            <li><Link href="/admin/downloads"><span className="sa-grow"><b>لینک‌ها و گزارش خرابی</b><small>لینک‌های امن و گزارش کاربران</small></span><span className="sa-link">باز کردن</span></Link></li>
          </ul>
        </section>
      </div>
    </div>
  </fieldset></SoftwareShell></div>
}
