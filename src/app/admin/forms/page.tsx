'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from '@/components/AppLink'
import PublicForm from '@/components/site/PublicForm'
import { normalizeForm, publicForm, type FormDefinition } from '@/modules/forms/domain/forms'
import { formShortcode } from '@/modules/forms/domain/embed'
import Builder from './Builder'
import Inbox from './Inbox'
import SettingsPanel from './SettingsPanel'
import { blankForm, settingsOf, type SavedForm, type Template } from './shared'

type Tab = 'build' | 'settings' | 'preview' | 'inbox'
const TABS: [Tab, string][] = [['build', 'ساخت فرم'], ['settings', 'تنظیمات'], ['preview', 'پیش‌نمایش'], ['inbox', 'پاسخ‌ها']]
const fa = (n: number) => n.toLocaleString('fa-IR')

export default function FormsAdmin() {
  const [forms, setForms] = useState<SavedForm[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [form, setForm] = useState<FormDefinition | null>(null)
  const [tab, setTab] = useState<Tab>('build')
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [picking, setPicking] = useState(false)
  // Somebody who only works on answers gets the answers, not the builder.
  const [canBuild, setCanBuild] = useState(true)
  const [me, setMe] = useState(0)
  // The work queue: the answers of every form at once.
  const [queue, setQueue] = useState(false)
  useEffect(() => { if (!canBuild) { setTab('inbox'); setPicking(false) } }, [canBuild, form?.id])

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/forms', { cache: 'no-store' })
    if (!r.ok) throw new Error('دریافت فرم‌ها ممکن نشد؛ دسترسی مدیریت صفحات لازم است.')
    const data: { forms: SavedForm[]; templates: Template[]; canBuild?: boolean; me?: number } = await r.json()
    setForms(data.forms); setTemplates(data.templates); setCanBuild(data.canBuild !== false); setMe(data.me || 0)
    // Handlers start at the queue, while a link to a particular form keeps its context.
    if (data.canBuild === false) {
      const wanted = new URLSearchParams(window.location.search)
      const selected = data.forms.some((item) => item.id === Number(wanted.get('form')))
      setQueue(wanted.get('tab') === 'queue' || !selected)
    }
    return data.forms
  }, [])
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search)
    load().then((list) => {
      const id = Number(wanted.get('form'))
      const start = list.find((f) => f.id === id) || list[0]
      if (wanted.get('tab') === 'queue') setQueue(true)
      if (start) { setForm(structuredClone(start)); if (wanted.get('tab') === 'inbox') setTab('inbox') } else setPicking(true)
    }).catch((e) => setNotice({ tone: 'error', text: e.message })).finally(() => setLoading(false))
  }, [load])
  useEffect(() => { const guard = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = '' } }; window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard) }, [dirty])

  const say = useCallback((tone: 'ok' | 'error', text: string) => setNotice({ tone, text }), [])
  const edit = (next: FormDefinition) => { setForm(next); setDirty(true); setNotice(null) }
  const confirmLeave = () => !dirty || window.confirm('تغییرات ذخیره‌نشده کنار گذاشته شوند؟')
  function open(value: FormDefinition) { if (!confirmLeave()) return; setQueue(false); setForm(structuredClone(value)); setDirty(false); setTab('build'); setNotice(null); setPicking(false) }

  // The same checks the server applies, so problems show before the request.
  const problem = useMemo(() => { if (!form) return ''; try { normalizeForm(form); return '' } catch (e) { return e instanceof Error ? e.message : '' } }, [form])

  async function save() {
    if (!form) return
    setBusy(true)
    const r = await fetch('/api/admin/forms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) }).catch(() => null)
    const data = await r?.json().catch(() => null)
    setBusy(false)
    if (!r?.ok) { say('error', data?.error || 'ذخیره ناموفق'); return }
    setForm(data); setDirty(false); await load()
    say('ok', data.published ? 'فرم ذخیره و منتشر شد.' : 'پیش‌نویس فرم ذخیره شد.')
  }
  async function op(kind: 'duplicate' | 'delete') {
    if (!form?.id) return
    if (kind === 'delete' && !window.confirm(`فرم «${form.title}» با همهٔ پاسخ‌ها و ضمیمه‌هایش برای همیشه حذف شود؟`)) return
    const r = await fetch('/api/admin/forms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: kind, id: form.id }) })
    const data = await r.json().catch(() => null)
    if (!r.ok) { say('error', data?.error || 'انجام نشد'); return }
    const list = await load()
    if (kind === 'duplicate') { setForm(structuredClone(data)); setDirty(false); say('ok', 'کپی ساخته شد.') } else { setForm(list[0] ? structuredClone(list[0]) : null); setDirty(false); if (!list.length) setPicking(true); say('ok', 'فرم حذف شد.') }
  }
  function fromTemplate(template: Template | null) {
    if (!confirmLeave()) return
    const base = template ? structuredClone(template.form) : blankForm()
    // A template's address may already exist; the admin can change it before saving.
    if (template && forms.some((f) => f.slug === base.slug)) base.slug = `${base.slug}-${Date.now().toString(36).slice(-4)}`
    setForm(base as FormDefinition); setDirty(true); setTab('build'); setPicking(false); setNotice(null)
  }

  if (loading) return <div className="sa" dir="rtl"><div className="sa-skeleton" aria-busy="true" /></div>
  const saved = forms.find((f) => f.id === form?.id)
  const counterForm = !queue && saved && !settingsOf(saved).payment.enabled ? saved : null
  return <div className="sa fb-page" dir="rtl">
    <header className="sa-head"><div><h1>{canBuild ? 'فرم‌ساز' : 'درخواست‌های فرم'}</h1><p className="sa-hint">{canBuild ? 'فرم بسازید، پاسخ‌ها را در «صف کار» یا زبانهٔ «پاسخ‌ها»ی هر فرم پیگیری کنید.' : 'درخواست‌هایی که به شما سپرده شده؛ هر کدام را بردارید، انجام دهید و به کاربر خبر بدهید.'}</p></div>
      <div className="sa-head-actions">
        {forms.some((item) => !settingsOf(item).payment.enabled) && <Link className="btn btn-ghost" href={counterForm ? `/admin/forms/counter?form=${counterForm.id}` : '/admin/forms/counter'} onClick={(event) => { if (!confirmLeave()) event.preventDefault() }}>ثبت حضوری</Link>}
        {canBuild && <><button type="button" className="btn btn-ghost" onClick={() => setPicking(true)}>+ فرم تازه</button>
          <button type="button" className="btn btn-primary" disabled={busy || !form || !dirty} onClick={() => void save()}>{busy ? 'در حال ذخیره…' : dirty ? 'ذخیرهٔ فرم' : 'ذخیره شد'}</button></>}
      </div></header>
    {notice && <div role={notice.tone === 'error' ? 'alert' : 'status'} className={`sa-notice ${notice.tone === 'error' ? 'is-error' : 'is-ok'}`}>{notice.text}</div>}

    {picking && <section className="sa-card fb-templates" aria-label="شروع فرم تازه">
      <header className="sa-card-head"><h2>از کجا شروع کنیم؟</h2>{forms.length > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPicking(false)}>بستن</button>}</header>
      <div className="fb-tpl-grid">
        <button type="button" onClick={() => fromTemplate(null)}><b>فرم خالی</b><small>نام، ایمیل و پیام؛ هر چه خواستید اضافه کنید.</small></button>
        {templates.map((t) => <button type="button" key={t.id} onClick={() => fromTemplate(t)}><b>{t.name}</b><small>{t.description}</small></button>)}
      </div>
    </section>}

    <div className="fb-layout fb-forms-layout">
      <aside className="fb-forms" aria-label="فرم‌ها">
        <button type="button" className={`fb-queue${queue ? ' is-active' : ''}`} onClick={() => { if (confirmLeave()) { setQueue(true); setDirty(false) } }}><strong>صف کار</strong><small>درخواست‌های همهٔ فرم‌ها · {fa(forms.reduce((sum, f) => sum + f.counts.new, 0))} جدید</small></button>
        {forms.map((f) => <button key={f.id} type="button" className={!queue && f.id === form?.id ? 'is-active' : ''} onClick={() => open(f)}><strong>{f.title}</strong><small>{f.published ? 'منتشرشده' : 'پیش‌نویس'} · {fa(f.counts.total)} پاسخ{f.counts.new ? ` · ${fa(f.counts.new)} جدید` : ''}</small></button>)}
        {!forms.length && <p className="sa-hint">هنوز فرمی ندارید.</p>}
      </aside>

      {queue && <div className="fb-main"><div className="fb-title"><div><h2>صف کار</h2><small>درخواست‌های همهٔ فرم‌هایی که به شما سپرده شده است</small></div></div><Inbox formId={0} fields={[]} forms={forms} me={me} manager={canBuild} onNotice={say} /></div>}

      {!queue && form && <div className="fb-main">
        <div className="fb-title"><div><h2>{form.title || 'فرم بدون عنوان'}</h2>{form.id ? <small dir="ltr">/forms/{form.slug}</small> : <small>ذخیره نشده</small>}</div>
          {form.id && <div className="sa-row-actions">{form.published && <Link href={`/forms/${form.slug}`} target="_blank" className="btn btn-ghost btn-sm">مشاهده ↗</Link>}{form.published && <button type="button" className="btn btn-ghost btn-sm" title={`${formShortcode(form.slug)} را در متن هر نوشته، صفحه یا محصول بگذارید؛ در ویرایشگر دیداری بلوک «فرم» هم هست.`} onClick={() => { void navigator.clipboard?.writeText(formShortcode(form.slug)).then(() => say('ok', `کد درج کپی شد: ${formShortcode(form.slug)} — آن را در متن هر نوشته یا صفحه بگذارید.`)).catch(() => say('ok', `کد درج: ${formShortcode(form.slug)}`)) }}>کپی کد درج</button>}<button type="button" className="btn btn-ghost btn-sm" onClick={() => void op('duplicate')}>کپی</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => void op('delete')}>حذف</button></div>}</div>
        <div className="sa-tabs fb-tabs" role="tablist">{TABS.filter(([id]) => canBuild || id === 'inbox').map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'is-active' : ''} onClick={() => setTab(id)}>{label}{id === 'inbox' && saved?.counts.new ? <span className="fb-badge">{fa(saved.counts.new)}</span> : null}</button>)}</div>
        {problem && dirty && tab !== 'inbox' && <p className="fb-problem" role="status">⚠ {problem}</p>}

        {tab === 'build' && <Builder form={form} onChange={edit} />}
        {tab === 'settings' && <SettingsPanel form={form} onChange={edit} />}
        {tab === 'preview' && (problem ? <p className="sa-hint">پیش‌نمایش پس از رفع خطای بالا نمایش داده می‌شود: {problem}</p> : <><p className="sa-hint">پیش‌نمایش زنده؛ شرط‌ها و مرحله‌ها کار می‌کنند اما فرم ارسال نمی‌شود.</p><PublicForm key={JSON.stringify(form)} form={publicForm({ ...form, settings: settingsOf(form) })} preview /></>)}
        {tab === 'inbox' && (form.id ? <Inbox formId={form.id} fields={form.fields} forms={forms} me={me} manager={canBuild} onNotice={say} /> : <p className="sa-hint">ابتدا فرم را ذخیره کنید.</p>)}
      </div>}
    </div>
  </div>
}
