'use client'

import Link from '@/components/AppLink'
import { useEffect, useState } from 'react'
import { JOURNAL_RAILS, type JournalSettings } from '@/modules/journal/domain/journal'
import { OrderedPicker, RailsEditor, type PickItem } from '../../cms/SectionAdmin'
import { JournalShell, Notice, send, useJson } from '../shared'

/** Journal (Liona) home: section order, main story, editor picks, block categories, listing and comments. */
export default function JournalSettingsPage() {
  const { data, error } = useJson<{ settings: JournalSettings; picker: { posts: { id: number; title: string; cover: string }[]; categories: { id: number; title: string }[] } }>('/api/admin/journal/settings')
  const [form, setForm] = useState<JournalSettings | null>(null)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (data) setForm(data.settings) }, [data])

  if (!form) return <JournalShell title="صفحهٔ اصلی و تنظیمات">{error ? <Notice tone="error">{error}</Notice> : <div className="sa-skeleton" aria-busy="true" />}</JournalShell>
  const set = (patch: Partial<JournalSettings>) => { setMessage(null); setForm({ ...form, ...patch }) }
  const posts: PickItem[] = (data?.picker.posts || []).map((row) => ({ id: row.id, title: row.title, image: row.cover }))
  const categories: PickItem[] = (data?.picker.categories || []).map((row) => ({ id: row.id, title: row.title, image: '' }))

  async function save() {
    if (!form) return
    setBusy(true)
    const response = await send<{ settings: JournalSettings }>('/api/admin/journal/settings', 'POST', form)
    setBusy(false)
    if (!response.ok) { setMessage({ tone: 'error', text: response.error }); return }
    setForm(response.data.settings)
    setMessage({ tone: 'ok', text: 'تنظیمات ذخیره شد و صفحهٔ اصلی مجله به‌روز است' })
  }

  return <JournalShell title="صفحهٔ اصلی و تنظیمات" actions={<><a href="/blog" target="_blank" rel="noreferrer" className="btn btn-ghost">پیش‌نمایش</a><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'در حال ذخیره…' : 'ذخیره'}</button></>}>
    {message && <Notice tone={message.tone}>{message.text}</Notice>}
    <div className="sa-cols">
      <div className="sa-stack">
        <section className="sa-card">
          <header className="sa-card-head"><h2>بخش‌های صفحهٔ اصلی</h2><small>ترتیب و نمایش</small></header>
          <RailsEditor rails={form.rails} labels={JOURNAL_RAILS} onChange={(rails) => set({ rails })} />
          <p className="sa-hint">اگر در <Link href="/admin/theme-builder" className="sa-link">سازندهٔ قالب</Link> صفحه‌ای برای مجله گذاشته باشید، آن صفحه جای این چیدمان را می‌گیرد.</p>
        </section>
        <section className="sa-card">
          <header className="sa-card-head"><h2>فهرست‌ها و دیدگاه‌ها</h2></header>
          <label className="sa-field"><span>تعداد مطلب در هر صفحه (دسته، جست‌وجو و آرشیو)</span><input className="input num" type="number" min={12} max={48} value={form.pageSize} onChange={(e) => set({ pageSize: Number(e.target.value) })} /></label>
          <label className="sa-check"><input type="checkbox" checked={form.autoApproveComments} onChange={(e) => set({ autoApproveComments: e.target.checked })} />انتشار خودکار دیدگاه اعضا (بدون بررسی)</label>
        </section>
      </div>
      <div className="sa-stack">
        <section className="sa-card">
          <header className="sa-card-head"><h2>مطلب اصلی اسلایدر</h2><small>اولی مطلب بزرگ، بقیه کنار آن؛ خالی = تازه‌ترین‌ها</small></header>
          <OrderedPicker items={posts} ids={form.heroIds} max={5} placeholder="افزودن مطلب…" onChange={(heroIds) => set({ heroIds })} />
        </section>
        <section className="sa-card">
          <header className="sa-card-head"><h2>انتخاب سردبیر</h2><small>تا ۴ مطلب؛ خالی = مطالب «ویژه»</small></header>
          <OrderedPicker items={posts} ids={form.editorIds} max={4} placeholder="افزودن مطلب…" onChange={(editorIds) => set({ editorIds })} />
        </section>
        <section className="sa-card">
          <header className="sa-card-head"><h2>دسته‌های بلوک‌ها</h2><small>بلوک اول، بلوک دوم، پنل؛ خالی = پرمطلب‌ترین دسته‌ها</small></header>
          <OrderedPicker items={categories} ids={form.blockCategoryIds} max={3} placeholder="افزودن دسته…" onChange={(blockCategoryIds) => set({ blockCategoryIds })} />
        </section>
        <section className="sa-card">
          <header className="sa-card-head"><h2>تنظیمات دیگر بخش</h2></header>
          <ul className="sa-rows"><li><Link href="/admin/sections/journal"><span className="sa-grow"><b>آدرس بخش و سئو</b><small>تغییر مسیر /blog، عنوان و توضیح متا</small></span><span className="sa-link">باز کردن</span></Link></li></ul>
        </section>
      </div>
    </div>
  </JournalShell>
}
