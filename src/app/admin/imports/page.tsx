'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Notice, Pager, fa, faDate } from '../store/shared'
import { JobReport, Messages, Stats, StatusChip, post } from './report'
import {
  ACTION_LABEL, type Analysis, type Attribute, type Destination, type DryRun, type FieldDef, type Finding, type Job, type OptionDef, type Policy, type PreviewCard, type Settings, type Template,
} from './types'
import './imports.css'
import ImportGuide from './ImportGuide'
import FieldInputsPanel from './FieldInputs'
import { inputMapping } from '@/modules/imports/domain/field-inputs'

const STEPS = ['مقصد', 'فایل', 'نگاشت فیلدها', 'روابط و ویژگی‌ها', 'پیش‌نمایش', 'اجرای آزمایشی', 'انتخاب فیلدها', 'تنظیمات ورود', 'شروع', 'گزارش']
const EXISTING: { value: Settings['existing']; label: string; hint: string }[] = [
  { value: 'skip', label: 'رد شوند', hint: 'رکوردهای موجود دست نمی‌خورند (پیش‌فرض امن)' },
  { value: 'update', label: 'فیلدهای انتخاب‌شده به‌روز شوند', hint: 'فقط فیلدهایی که «به‌روزرسانی» آن‌ها فعال است' },
  { value: 'fill-empty', label: 'فقط فیلدهای خالی پر شوند', hint: 'مقدار فعلی هیچ فیلدی بازنویسی نمی‌شود' },
  { value: 'replace', label: 'جایگزینی', hint: 'فیلدهای انتخاب‌شده بازنویسی و فهرست‌ها (مثل مشخصات) به‌جای ادغام، جایگزین می‌شوند' },
]
const STATE_LABEL: Record<string, string> = { IMPORTED: 'وارد می‌شود', IGNORED: 'نادیده', UNCHANGED: 'بدون تغییر', CREATED: 'ساخته می‌شود', NEW: 'جدید' }
const OUTCOME: Record<Finding['outcome'], string> = { ignored: 'نادیده گرفته می‌شود', added: 'به گروه ویژگی اضافه می‌شود', mapped: 'نگاشت شد', rejected: 'رکورد رد می‌شود', 'needs-mapping': 'نیاز به نگاشت' }

const emptySettings = (): Settings => ({
  sheet: '', source: 'default', fieldInputs: {}, variantInputs: {}, slugMode: 'title', slugRemove: [], mapping: {}, variantMapping: {}, policies: {}, variantPolicies: {}, existing: 'skip', protectEdits: true,
  variants: { mode: 'none', source: '', groupBy: '' }, attributes: [], specsSource: '', options: { copyAssets: false, mediaTransferMode: 'immediate', missingCategories: 'error', missingBrands: 'error', missingArtists: 'error', missingAlbums: 'error' },
})
const defaultPolicy = (field: FieldDef, mapped: boolean): Policy => ({ create: mapped, update: mapped && field.updatable !== false && field.updateByDefault !== false })

/** Policies for every mapped field, keeping the admin's earlier choices. */
function policiesFor(fields: FieldDef[], mapping: Record<string, string>, current: Record<string, Policy>): Record<string, Policy> {
  const out: Record<string, Policy> = {}
  for (const field of fields) {
    if (field.implicit) { out[field.key] = current[field.key] || { create: true, update: field.updateByDefault !== false }; continue }
    const mapped = !!mapping[field.key]
    out[field.key] = mapped ? (current[field.key] || defaultPolicy(field, true)) : { create: false, update: false }
  }
  return out
}

function optionDefaults(options: OptionDef[], current: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  for (const option of options) out[option.key] = option.key in current ? current[option.key] : option.default ?? (option.type === 'valueMap' ? {} : option.type === 'bool' ? false : '')
  return out
}

function useJson<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const reload = useCallback(async () => {
    if (!url) return
    const response = await fetch(url, { cache: 'no-store' }).catch(() => null)
    const body = await response?.json().catch(() => null)
    if (response?.ok) { setData(body); setError('') } else setError(body?.error || 'بارگذاری نشد')
  }, [url])
  useEffect(() => { void reload() }, [reload])
  return { data, error, reload }
}

// ------------------------------------------------------------------ page

export default function ImportsAdmin() {
  const [tab, setTab] = useState<'new' | 'history' | 'templates' | 'guide'>('new')
  const [openJob, setOpenJob] = useState<number | null>(null)
  const meta = useJson<{ destinations: Destination[]; statLabels: Record<string, string>; limits: Record<string, number> }>('/api/admin/imports?view=destinations')
  const [wizardKey, setWizardKey] = useState(0)
  return <div className="sa imp" dir="rtl">
    <header className="sa-head">
      <div><h1>ورود گروهی اطلاعات</h1><p className="sa-hint">ورود محصولات، مجله، سینما، بازی، نرم‌افزار، موسیقی، پرامپت مستر، هنرمندان و کسب‌وکارها از فایل JSON، CSV یا XLSX؛ با پیش‌نمایش، کنترل فیلدها و گزارش هر ردیف.</p></div>
      <div className="sa-head-actions"><button type="button" className="btn btn-primary" onClick={() => { setTab('new'); setWizardKey((k) => k + 1) }}>ورود تازه</button></div>
    </header>
    <nav className="sa-subtabs" aria-label="بخش‌ها">
      {([['new', 'ورود تازه'], ['history', 'تاریخچه'], ['templates', 'الگوها'], ['guide', 'راهنما و نمونه‌فایل']] as const).map(([id, label]) => <button key={id} type="button" className={tab === id ? 'is-active' : ''} aria-pressed={tab === id} onClick={() => { setTab(id); setOpenJob(null) }}>{label}</button>)}
    </nav>
    {meta.error && <Notice tone="error">{meta.error}</Notice>}
    {!meta.data ? <div className="sa-skeleton" style={{ height: 260 }} aria-busy="true" /> : <>
      {tab === 'new' && <Wizard key={wizardKey} destinations={meta.data.destinations} labels={meta.data.statLabels} limits={meta.data.limits} />}
      {tab === 'history' && (openJob ? <JobReport jobId={openJob} labels={meta.data.statLabels} onBack={() => setOpenJob(null)} /> : <History destinations={meta.data.destinations} onOpen={setOpenJob} />)}
      {tab === 'templates' && <Templates destinations={meta.data.destinations} />}
      {tab === 'guide' && <ImportGuide destinations={meta.data.destinations} />}
    </>}
  </div>
}

// ------------------------------------------------------------------ wizard

function Wizard({ destinations, labels, limits }: { destinations: Destination[]; labels: Record<string, string>; limits: Record<string, number> }) {
  const [step, setStep] = useState(0)
  const [dest, setDest] = useState<Destination | null>(null)
  const [job, setJob] = useState<Job | null>(null)
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [settings, setSettings] = useState<Settings>(emptySettings)
  const [templates, setTemplates] = useState<Template[]>([])
  const [templateId, setTemplateId] = useState<number | null>(null)
  const [previews, setPreviews] = useState<PreviewCard[] | null>(null)
  const [previewCount, setPreviewCount] = useState(10)
  const [dry, setDry] = useState<DryRun | null>(null)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null)

  /** Any change after a dry run makes it stale: the start is refused until it runs again. */
  const change = (next: Partial<Settings>) => { setSettings((s) => ({ ...s, ...next })); if (dry) setDirty(true) }
  const fail = (text: string) => setNotice({ tone: 'error', text })

  useEffect(() => {
    if (!dest) return
    void fetch(`/api/admin/imports?view=templates&adapter=${dest.id}`, { cache: 'no-store' }).then((r) => r.json()).then((b) => setTemplates(b.templates || [])).catch(() => undefined)
  }, [dest])

  const valueColumns = useMemo(() => (analysis?.columns || []).filter((c) => c.kind !== 'object' && c.kind !== 'objects' && !c.path.includes('[].')).map((c) => c.path), [analysis])
  const variantColumns = useMemo(() => {
    if (!analysis) return []
    if (settings.variants.mode === 'nested') return analysis.columns.filter((c) => c.path.startsWith(`${settings.variants.source}[].`) && c.kind !== 'objects').map((c) => c.path.slice(settings.variants.source.length + 3))
    return valueColumns
  }, [analysis, settings.variants, valueColumns])

  function applySuggestions(a: Analysis, base: Settings, d: Destination): Settings {
    const s = a.suggestions
    const mapping = Object.keys(base.mapping).length ? base.mapping : s.mapping
    const variants = base.variants.mode !== 'none' ? base.variants : s.variants
    const variantMapping = Object.keys(base.variantMapping).length ? base.variantMapping : s.variantMapping
    const attributes = base.attributes.length ? base.attributes : s.attributes
    return {
      ...base, sheet: a.sheet, mapping, variants, variantMapping, attributes,
      policies: policiesFor(d.fields, { ...inputMapping(mapping, base.fieldInputs), ...(base.slugMode === 'title' ? { slug: '@generated' } : {}) }, base.policies),
      variantPolicies: policiesFor(d.variantFields, inputMapping(variantMapping, base.variantInputs), base.variantPolicies),
      options: optionDefaults(d.options, base.options),
    }
  }

  async function upload(file: File, source: string) {
    if (!dest) return
    if (file.size > limits.uploadBytes) { fail(`حجم فایل بیش از ${fa(Math.round(limits.uploadBytes / 1048576))} مگابایت است`); return }
    setBusy('upload'); setNotice(null)
    // 8 MB pieces (the site caps one request at 10 MB); the server appends them in order.
    const CHUNK = 8 * 1024 * 1024
    let token = ''
    let body: { token?: string; done?: boolean; job: Job; rows: number; error?: string } | null = null
    for (let offset = 0; offset < file.size || offset === 0; offset += CHUNK) {
      const final = offset + CHUNK >= file.size
      const query = `adapter=${dest.id}&offset=${offset}${token ? `&token=${token}` : ''}${final ? '&final=1' : ''}`
      let response: Response | null = null
      // A dropped connection or a server hiccup: the same piece is sent again (the server appends by offset).
      for (let attempt = 0; attempt < 3; attempt++) {
        response = await fetch(`/api/admin/imports/upload?${query}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'x-file-name': encodeURIComponent(file.name) }, body: file.slice(offset, offset + CHUNK) }).catch(() => null)
        if (response && response.status < 500) break
      }
      body = await response?.json().catch(() => null)
      if (!response?.ok || !body) { setBusy(''); fail(body?.error || 'بارگذاری انجام نشد'); return }
      token = body.token || token
      if (final) break
    }
    if (!body?.done) { setBusy(''); fail('بارگذاری کامل نشد'); return }
    setJob(body.job)
    const analyzed = await post<Analysis>({ op: 'analyze', id: body.job.id })
    setBusy('')
    if (!analyzed.ok) { fail(analyzed.error); return }
    setAnalysis(analyzed.data)
    setSettings((s) => applySuggestions(analyzed.data, { ...s, source }, dest))
    setNotice({ tone: 'ok', text: `${fa(body.rows)} رکورد خوانده شد${analyzed.data.suggestions.variants.mode !== 'none' ? ' — ساختار تنوع‌ها تشخیص داده شد' : ''}.` })
    setStep(2)
  }

  async function changeSheet(sheet: string) {
    if (!job || !dest) return
    setBusy('sheet')
    const analyzed = await post<Analysis>({ op: 'analyze', id: job.id, sheet })
    setBusy('')
    if (!analyzed.ok) { fail(analyzed.error); return }
    setAnalysis(analyzed.data)
    setSettings(applySuggestions(analyzed.data, { ...emptySettings(), source: settings.source, sheet }, dest))
  }

  function loadTemplate(id: number | null) {
    setTemplateId(id)
    const tpl = templates.find((x) => x.id === id)
    if (!tpl || !dest) return
    const merged: Settings = { ...emptySettings(), ...tpl.settings, slugMode: tpl.settings.slugMode || 'source', sheet: settings.sheet, options: { ...(tpl.settings.options || {}) } } as Settings
    setSettings(analysis ? applySuggestions(analysis, merged, dest) : merged)
    setNotice({ tone: 'ok', text: `الگوی «${tpl.name}» بارگذاری شد؛ نگاشت‌ها را با ستون‌های این فایل بررسی کنید.` })
    if (dry) setDirty(true)
  }

  async function saveTemplate() {
    if (!dest) return
    const current = templates.find((tpl) => tpl.id === templateId)
    const name = window.prompt('نام الگو', current?.name || '')
    if (!name) return
    const result = await post<{ id: number; name: string }>({ op: 'template-save', adapter: dest.id, name, settings, templateId: current && current.name === name ? current.id : undefined })
    if (!result.ok) { fail(result.error); return }
    setTemplateId(result.data.id)
    setTemplates((list) => [...list.filter((tpl) => tpl.id !== result.data.id), { id: result.data.id, name: result.data.name, adapter: dest.id, settings, updatedAt: new Date().toISOString() }])
    setNotice({ tone: 'ok', text: `الگو «${result.data.name}» ذخیره شد (فقط تنظیمات؛ فایل و داده‌ها در الگو ذخیره نمی‌شوند).` })
  }

  async function runPreview() {
    if (!job) return
    setBusy('preview'); setNotice(null)
    const result = await post<{ previews: PreviewCard[] }>({ op: 'preview', id: job.id, settings, count: previewCount })
    setBusy('')
    if (!result.ok) { fail(result.error); return }
    setPreviews(result.data.previews)
  }

  async function runDry() {
    if (!job) return
    setBusy('dry'); setNotice(null)
    const saved = await post<Job>({ op: 'settings', id: job.id, settings, templateId })
    if (!saved.ok) { setBusy(''); fail(saved.error); return }
    const result = await post<{ summary: DryRun; previews: PreviewCard[] }>({ op: 'dry-run', id: job.id, settings })
    setBusy('')
    if (!result.ok) { fail(result.error); return }
    setDry(result.data.summary); setDirty(false)
    setPreviews(result.data.previews)
  }

  async function startImport() {
    if (!job || !dry || dirty) return
    const deleting = settings.options.missingVariants === 'delete'
    if (!window.confirm(`ورود ${fa(dry.total)} رکورد شروع شود؟${deleting ? '\n\nهشدار: تنوع‌هایی که در فایل نیستند حذف می‌شوند (تنوع‌های دارای سفارش فقط غیرفعال می‌شوند).' : ''}`)) return
    setBusy('start'); setNotice(null)
    const result = await post<Job>({ op: 'start', id: job.id, settings })
    setBusy('')
    if (!result.ok) { fail(result.error); return }
    setJob(result.data)
    setStep(9)
  }

  const canNext = [
    !!dest, !!analysis, true, true, true, !!dry && !dirty, true, true, false, false,
  ][step]

  return <div className="imp-wizard">
    <ol className="imp-steps" aria-label="مراحل">
      {STEPS.map((label, i) => <li key={label} className={i === step ? 'is-current' : i < step ? 'is-done' : ''}>
        <button type="button" disabled={i > step || step === 9 || (i >= 2 && !analysis)} onClick={() => setStep(i)} aria-current={i === step ? 'step' : undefined}><span className="num">{fa(i + 1)}</span>{label}</button>
      </li>)}
    </ol>
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

    {step === 0 && <section className="imp-grid" aria-label="انتخاب مقصد">
      {destinations.map((d) => <button key={d.id} type="button" disabled={!d.enabled} className={`sa-card imp-dest ${dest?.id === d.id ? 'is-active' : ''}`} aria-pressed={dest?.id === d.id} onClick={() => { setDest(d); setSettings({ ...emptySettings(), options: optionDefaults(d.options, emptySettings().options) }) }}>
        <b>{d.label}</b><span>{d.description}</span>
        <small>شناسایی رکورد موجود: {d.identity.join(' ← ')}</small>
        {!d.enabled && <small className="imp-off">{d.unavailableReason || 'این بخش در سایت خاموش است'}</small>}
      </button>)}
    </section>}

    {step === 1 && dest && <UploadStep dest={dest} busy={busy === 'upload'} limits={limits} templates={templates} templateId={templateId} onTemplate={loadTemplate} onUpload={upload} />}

    {step === 2 && dest && analysis && <section className="sa-card">
      <div className="sa-card-head">
        <h3>نگاشت فیلدها <small className="sa-hint">({fa(analysis.rows)} رکورد، {analysis.format.toUpperCase()})</small></h3>
        <div className="imp-actions">
          {analysis.sheets.length > 1 && <select className="select" aria-label="برگه" value={analysis.sheet} disabled={!!busy} onChange={(e) => changeSheet(e.target.value)}>{analysis.sheets.map((s) => <option key={s} value={s}>{s}</option>)}</select>}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { const mapping = analysis.suggestions.mapping; change({ mapping, policies: policiesFor(dest.fields, inputMapping(mapping, settings.fieldInputs), settings.policies) }) }}>نگاشت خودکار</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => change({ mapping: {}, fieldInputs: {}, variantInputs: {}, policies: policiesFor(dest.fields, {}, {}) })}>پاک‌کردن</button>
          <TemplateBar templates={templates} templateId={templateId} onLoad={loadTemplate} onSave={saveTemplate} />
        </div>
      </div>
      <div className="imp-slug-policy">
        <label className="sa-field"><span>نامک مطالب جدید</span><select className="select" value={settings.slugMode || 'source'} onChange={event => change({ slugMode: event.target.value === 'title' ? 'title' : 'source', policies: { ...settings.policies, slug: { create: event.target.value === 'title' || !!settings.mapping.slug, update: false } } })}><option value="title">ساخت از عنوان خود محتوا؛ بدون دامنهٔ منبع</option><option value="source">از ستون نامک؛ حذف دامنه و پارامترهای لینک</option></select></label>
        <label className="sa-field"><span>نام‌ها و عبارت‌های منبع برای حذف از نامک</span><input className="input" dir="auto" value={(settings.slugRemove || []).join(', ')} onChange={event => change({ slugRemove: event.target.value.split(/[,،]/).map(value => value.trim()) })} placeholder="نام سایت، example.com"/><small className="sa-hint">با ویرگول جدا کنید. نامک صفحات موجود بازنویسی نمی‌شود؛ نتیجه را در پیش‌نمایش بررسی کنید.</small></label>
      </div>
      <FieldInputsPanel dest={dest} analysis={analysis} settings={settings} change={change}/>
      <MappingTable fields={dest.fields.filter((f) => !f.implicit)} mapping={settings.mapping} columns={valueColumns} jsonColumns={analysis.columns.filter(column => column.kind === 'object' && !column.path.includes('[].')).map(column => column.path)} sample={(key) => analysis.columns.find((c) => c.path === settings.mapping[key])?.samples[0] || ''}
        onChange={(key, value) => { const mapping = { ...settings.mapping, [key]: value }; if (!value) delete mapping[key]; change({ mapping, policies: policiesFor(dest.fields, inputMapping(mapping, settings.fieldInputs), settings.policies) }) }} />
    </section>}

    {step === 3 && dest && analysis && <RelationsStep dest={dest} analysis={analysis} settings={settings} change={change} variantColumns={variantColumns} valueColumns={valueColumns} />}

    {step === 4 && <section className="imp-stack">
      <div className="sa-card imp-toolbar">
        <label className="sa-field"><span>تعداد نمونه</span><select className="select" value={previewCount} onChange={(e) => setPreviewCount(Number(e.target.value))}>{[5, 10, 20].map((n) => <option key={n} value={n}>{fa(n)} رکورد اول</option>)}</select></label>
        <button type="button" className="btn btn-primary" disabled={!!busy} onClick={runPreview}>{busy === 'preview' ? 'در حال آماده‌سازی…' : 'نمایش پیش‌نمایش'}</button>
        <p className="sa-hint">پیش‌نمایش هیچ چیزی ذخیره نمی‌کند و تصویری دانلود نمی‌کند؛ فیلدهای «نادیده» طبق انتخاب فیلدها وارد نمی‌شوند.</p>
      </div>
      {previews && <PreviewCards cards={previews} />}
    </section>}

    {step === 5 && <section className="imp-stack">
      <div className="sa-card imp-toolbar">
        <button type="button" className="btn btn-primary" disabled={!!busy} onClick={runDry}>{busy === 'dry' ? 'در حال بررسی همهٔ رکوردها…' : dry ? 'اجرای آزمایشی دوباره' : 'اجرای آزمایشی (بدون ذخیره)'}</button>
        <p className="sa-hint">همهٔ رکوردها با قوانین واقعی مقصد بررسی می‌شوند؛ هیچ دسته، برند، گروه ویژگی، تصویر یا رکوردی ساخته نمی‌شود.</p>
      </div>
      {dirty && <Notice tone="info">تنظیمات پس از آخرین اجرای آزمایشی تغییر کرده است؛ برای شروع، اجرای آزمایشی را دوباره انجام دهید.</Notice>}
      {dry && <DryRunView dry={dry} labels={labels} settings={settings} change={change} />}
    </section>}

    {step === 6 && dest && <FieldSelection dest={dest} settings={settings} change={change} />}

    {step === 7 && dest && <OptionsStep dest={dest} settings={settings} change={change} step={8} analysis={analysis} dry={dry} />}

    {step === 8 && dest && <section className="imp-stack">
      <PlanSummary dest={dest} settings={settings} dry={dry} labels={labels} />
      {(!dry || dirty) && <Notice tone="info">پیش از شروع، اجرای آزمایشی با همین تنظیمات لازم است. <button type="button" className="sa-link" disabled={!!busy} onClick={runDry}>{busy === 'dry' ? 'در حال اجرا…' : 'اجرای آزمایشی'}</button></Notice>}
      {dry && !dirty && dry.blocking.map((b) => <Notice key={b} tone="info">{b}</Notice>)}
      <div className="sa-card imp-toolbar">
        <button type="button" className="btn btn-primary" disabled={!dry || dirty || !!busy} onClick={startImport}>{busy === 'start' ? 'در حال شروع…' : 'شروع ورود اطلاعات'}</button>
        <p className="sa-hint">ورود در پس‌زمینه و در دسته‌های کوچک انجام می‌شود؛ می‌توانید این صفحه را ببندید و از «تاریخچه» پیگیری کنید.</p>
      </div>
    </section>}

    {step === 9 && job && <JobReport jobId={job.id} labels={labels} />}

    {step < 8 && <div className="imp-nav">
      <button type="button" className="btn btn-ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>قبلی</button>
      {step === 5 && !canNext && <span className="sa-hint">برای ادامه اجرای آزمایشی را انجام دهید</span>}
      <button type="button" className="btn btn-primary" disabled={!canNext} onClick={() => setStep(step + 1)}>بعدی</button>
    </div>}
  </div>
}

// ------------------------------------------------------------------ steps

function UploadStep({ dest, busy, limits, templates, templateId, onTemplate, onUpload }: { dest: Destination; busy: boolean; limits: Record<string, number>; templates: Template[]; templateId: number | null; onTemplate: (id: number | null) => void; onUpload: (file: File, source: string) => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [source, setSource] = useState('default')
  return <section className="sa-card sa-form imp-upload">
    <h3>فایل ورودی برای «{dest.label}»</h3>
    <label className="sa-field"><span>فایل (JSON، CSV یا XLSX)</span>
      <input className="input" type="file" accept=".json,.csv,.tsv,.txt,.xlsx" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      <small className="sa-hint">حداکثر {fa(Math.round(limits.uploadBytes / 1048576))} مگابایت، {fa(limits.rows)} رکورد، {fa(limits.columns)} ستون. فرمول‌ها و ماکروهای اکسل اجرا نمی‌شوند.</small>
    </label>
    <label className="sa-field"><span>نام منبع شناسه‌ها</span>
      <input className="input" dir="ltr" value={source} onChange={(e) => setSource(e.target.value)} placeholder="supplier-a" />
      <small className="sa-hint">شناسه‌های خارجی هر منبع جدا نگه‌داری می‌شوند (مثلاً supplier-a یا imdb)؛ ورود دوبارهٔ همین منبع رکورد تکراری نمی‌سازد.</small>
    </label>
    {templates.length > 0 && <label className="sa-field"><span>الگوی ذخیره‌شده (اختیاری)</span>
      <select className="select" value={templateId ?? ''} onChange={(e) => onTemplate(e.target.value ? Number(e.target.value) : null)}><option value="">بدون الگو</option>{templates.map((tpl) => <option key={tpl.id} value={tpl.id}>{tpl.name}</option>)}</select>
    </label>}
    <div><button type="button" className="btn btn-primary" disabled={!file || busy} onClick={() => file && onUpload(file, source)}>{busy ? 'در حال بارگذاری و بررسی…' : 'بارگذاری و تحلیل فایل'}</button></div>
  </section>
}

function TemplateBar({ templates, templateId, onLoad, onSave }: { templates: Template[]; templateId: number | null; onLoad: (id: number | null) => void; onSave: () => void }) {
  return <>
    {templates.length > 0 && <select className="select" aria-label="الگو" value={templateId ?? ''} onChange={(e) => onLoad(e.target.value ? Number(e.target.value) : null)}><option value="">الگو…</option>{templates.map((tpl) => <option key={tpl.id} value={tpl.id}>{tpl.name}</option>)}</select>}
    <button type="button" className="btn btn-ghost btn-sm" onClick={onSave}>ذخیره به‌عنوان الگو</button>
  </>
}

function MappingTable({ fields, mapping, columns, jsonColumns = [], sample, onChange }: { fields: FieldDef[]; mapping: Record<string, string>; columns: string[]; jsonColumns?: string[]; sample: (key: string) => string; onChange: (key: string, value: string) => void }) {
  return <div className="sa-table-wrap"><table className="data sa-table imp-map">
    <thead><tr><th>فیلد مقصد</th><th>ستون فایل</th><th>نمونهٔ مقدار</th></tr></thead>
    <tbody>{fields.map((field) => <tr key={field.key} className={mapping[field.key] ? 'is-mapped' : ''}>
      <td><b>{field.label}</b>{field.requiredOnCreate && <span className="imp-req" title="برای ساخت رکورد جدید لازم است">الزامی</span>}{field.updatable === false && <span className="imp-tag">فقط ساخت</span>}{field.hint && <small className="sa-hint">{field.hint}</small>}</td>
      <td><select className="select" aria-label={`ستون ${field.label}`} value={mapping[field.key] || ''} onChange={(e) => onChange(field.key, e.target.value)}>
        <option value="">— نگاشت نشود —</option>{[...columns, ...(field.type === 'json' ? jsonColumns : [])].map((c) => <option key={c} value={c}>{c}</option>)}
      </select></td>
      <td className="imp-sample" dir="auto">{mapping[field.key] ? sample(field.key) : ''}</td>
    </tr>)}</tbody>
  </table></div>
}

function RelationsStep({ dest, analysis, settings, change, variantColumns, valueColumns }: { dest: Destination; analysis: Analysis; settings: Settings; change: (next: Partial<Settings>) => void; variantColumns: string[]; valueColumns: string[] }) {
  const lists = analysis.columns.filter((c) => c.kind === 'objects' && !c.path.includes('[].')).map((c) => c.path)
  const objects = analysis.columns.filter((c) => (c.kind === 'object' || c.kind === 'objects') && !c.path.includes('[].')).map((c) => c.path)
  const setAttr = (i: number, next: Partial<Attribute>) => change({ attributes: settings.attributes.map((a, j) => (j === i ? { ...a, ...next } : a)) })
  const attrSources = settings.variants.mode === 'nested' ? variantColumns.map((c) => `${settings.variants.source}[].${c}`) : valueColumns
  return <section className="imp-stack">
    {dest.supports.variants && <div className="sa-card sa-form">
      <h3>{dest.variantLabel || 'تنوع‌ها'}</h3>
      <label className="sa-field"><span>ساختار فایل</span>
        <select className="select" value={settings.variants.mode} onChange={(e) => change({ variants: { ...settings.variants, mode: e.target.value as Settings['variants']['mode'] }, variantPolicies: policiesFor(dest.variantFields, settings.variantMapping, settings.variantPolicies) })}>
          <option value="none">بدون {dest.variantLabel || 'تنوع'}</option>
          <option value="nested">تو در تو (فهرستی داخل هر رکورد)</option>
          <option value="flat">مسطح (هر ردیف یک {dest.variantLabel ? 'مورد' : 'تنوع'}، گروه‌بندی با ستون والد)</option>
        </select>
      </label>
      {settings.variants.mode === 'nested' && <label className="sa-field"><span>فهرست تنوع‌ها در فایل</span>
        <select className="select" value={settings.variants.source} onChange={(e) => change({ variants: { ...settings.variants, source: e.target.value } })}><option value="">انتخاب کنید</option>{lists.map((c) => <option key={c} value={c}>{c}</option>)}</select>
      </label>}
      {settings.variants.mode === 'flat' && <label className="sa-field"><span>گروه‌بندی ردیف‌ها بر اساس</span>
        <select className="select" value={settings.variants.groupBy} onChange={(e) => change({ variants: { ...settings.variants, groupBy: e.target.value } })}><option value="">انتخاب کنید (مثلاً parent_sku)</option>{valueColumns.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        <small className="sa-hint">ردیف‌هایی که این ستون در آن‌ها یکسان است یک رکورد می‌شوند؛ مقدار خالی یا ناسازگار در اجرای آزمایشی گزارش می‌شود.</small>
      </label>}
      {settings.variants.mode !== 'none' && <>
        <h4>نگاشت فیلدهای {dest.variantLabel || 'تنوع'}</h4>
        <MappingTable fields={dest.variantFields} mapping={settings.variantMapping} columns={variantColumns} sample={() => ''}
          onChange={(key, value) => { const variantMapping = { ...settings.variantMapping, [key]: value }; if (!value) delete variantMapping[key]; change({ variantMapping, variantPolicies: policiesFor(dest.variantFields, variantMapping, settings.variantPolicies) }) }} />
      </>}
    </div>}
    {dest.supports.attributes && <div className="sa-card sa-form">
      <h3>ویژگی‌ها و مشخصات</h3>
      <p className="sa-hint">هر ستون به یک ویژگی گروه ویژگی محصول تبدیل می‌شود. «ویژگی تنوع» (مثل رنگ یا حافظه) ترکیب تنوع‌ها را می‌سازد؛ بقیه مشخصات ثابت محصول‌اند و برای هر تنوع تکرار نمی‌شوند. ویژگی‌ای که گروه محصول تعریف نکرده طبق تنظیمات پایین همین صفحه رفتار می‌کند.</p>
      {dest.supports.specs && <label className="sa-field"><span>ستون مشخصات (شیء یا فهرست name/value)</span>
        <select className="select" value={settings.specsSource} onChange={(e) => change({ specsSource: e.target.value })}><option value="">ندارد</option>{objects.map((c) => <option key={c} value={c}>{c}</option>)}</select>
      </label>}
      <table className="data sa-table imp-attrs">
        <thead><tr><th>ستون فایل</th><th>نام ویژگی</th><th>ویژگی تنوع</th><th /></tr></thead>
        <tbody>{settings.attributes.map((a, i) => <tr key={i}>
          <td><select className="select" aria-label="ستون" value={a.source} onChange={(e) => setAttr(i, { source: e.target.value })}><option value="">—</option>{attrSources.map((c) => <option key={c} value={c}>{c}</option>)}</select></td>
          <td><input className="input" aria-label="نام ویژگی" value={a.name} onChange={(e) => setAttr(i, { name: e.target.value })} /></td>
          <td><label className="imp-check"><input type="checkbox" checked={a.variation} disabled={settings.variants.mode === 'none'} onChange={(e) => setAttr(i, { variation: e.target.checked })} /> ترکیب تنوع</label></td>
          <td><button type="button" className="sa-link is-danger" onClick={() => change({ attributes: settings.attributes.filter((_x, j) => j !== i) })}>حذف</button></td>
        </tr>)}</tbody>
      </table>
      <div><button type="button" className="btn btn-ghost btn-sm" onClick={() => change({ attributes: [...settings.attributes, { source: '', name: '', variation: false }] })}>افزودن ویژگی</button></div>
    </div>}
    <OptionsStep dest={dest} settings={settings} change={change} step={4} analysis={analysis} dry={null} />
  </section>
}

function OptionsStep({ dest, settings, change, step, analysis, dry }: { dest: Destination; settings: Settings; change: (next: Partial<Settings>) => void; step: 4 | 8; analysis: Analysis | null; dry: DryRun | null }) {
  const options = dest.options.filter((o) => o.step === step && (!o.when || o.when.values.includes(settings.options[o.when.key])) && o.valuesOf !== '__options__' && o.valuesOf !== '__attributes__')
  const setOption = (key: string, value: unknown) => change({ options: { ...settings.options, [key]: value } })
  return <div className="sa-card sa-form">
    <h3>{step === 4 ? 'دسته‌ها، روابط و گروه ویژگی' : 'تنظیمات ورود'}</h3>
    {step === 8 && <fieldset className="imp-radios"><legend>رکوردهایی که از قبل وجود دارند</legend>
      {EXISTING.map((e) => <label key={e.value} className={settings.existing === e.value ? 'is-active' : ''}><input type="radio" name="existing" checked={settings.existing === e.value} onChange={() => change({ existing: e.value })} /><b>{e.label}</b><small>{e.hint}</small></label>)}
    </fieldset>}
    {step === 8 && <label className="imp-check"><input type="checkbox" checked={settings.protectEdits === true} onChange={event => change({ protectEdits: event.target.checked })} />حفظ ویرایش‌های محلی<small className="sa-hint">اگر محتوا، دسته‌ها، لینک‌ها یا قسمت‌ها پس از آخرین ورود تغییر کرده باشند، کل آن مورد رد می‌شود. موارد قدیمی بدون سابقهٔ مقایسه هم حفظ می‌شوند. برای بازنویسی عمدی، این گزینه را بردارید و اجرای آزمایشی را دوباره بررسی کنید.</small></label>}
    {options.map((o) => <OptionField key={o.key} dest={dest} option={o} value={settings.options[o.key]} onChange={(v) => setOption(o.key, v)} analysis={analysis} settings={settings} />)}
    {step === 8 && dry && <p className="sa-hint">پس از تغییر این تنظیمات، اجرای آزمایشی را دوباره انجام دهید.</p>}
  </div>
}

function OptionField({ dest, option, value, onChange, analysis, settings }: { dest: Destination; option: OptionDef; value: unknown; onChange: (v: unknown) => void; analysis: Analysis | null; settings: Settings }) {
  const [choices, setChoices] = useState(option.choices || [])
  useEffect(() => {
    if (!option.dynamic) return
    void fetch(`/api/admin/imports?view=choices&adapter=${dest.id}&key=${option.key}`, { cache: 'no-store' }).then((r) => r.json()).then((b) => setChoices(b.choices || [])).catch(() => undefined)
  }, [dest.id, option.dynamic, option.key])
  if (option.type === 'bool') return <label className={`imp-check ${option.destructive ? 'is-danger' : ''}`}><input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} /> {option.label}{option.hint && <small className="sa-hint">{option.hint}</small>}</label>
  if (option.type === 'valueMap') {
    const column = option.valuesOf ? settings.mapping[option.valuesOf] : ''
    const keys = column ? analysis?.distinct[column] || [] : []
    const map = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
    return <div className="sa-field"><span>{option.label}</span>
      {!keys.length ? <small className="sa-hint">{column ? 'مقادیر این ستون بیش از حد متنوع است یا خالی است.' : 'ابتدا ستون مربوط را نگاشت کنید.'}</small> :
        <table className="data sa-table imp-valuemap"><tbody>{keys.map((k) => <tr key={k}><td dir="auto">{k}</td><td>
          <select className="select" aria-label={k} value={String(map[k] ?? '')} onChange={(e) => onChange({ ...map, [k]: e.target.value || undefined })}><option value="">—</option>{choices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select>
        </td></tr>)}</tbody></table>}
      {option.hint && <small className="sa-hint">{option.hint}</small>}
    </div>
  }
  if (option.type === 'select') return <label className="sa-field"><span>{option.label}</span>
    <select className="select" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)}>{!choices.some((c) => c.value === String(value ?? '')) && <option value="">انتخاب کنید</option>}{choices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select>
    {option.hint && <small className="sa-hint">{option.hint}</small>}
  </label>
  return <label className="sa-field"><span>{option.label}</span><input className="input" type={option.type === 'number' ? 'number' : 'text'} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />{option.hint && <small className="sa-hint">{option.hint}</small>}</label>
}

function PreviewCards({ cards }: { cards: PreviewCard[] }) {
  if (!cards.length) return <p className="sa-empty">رکوردی برای نمایش نیست.</p>
  return <div className="imp-previews">{cards.map((card, i) => <article key={i} className={`sa-card imp-preview is-${card.action.toLowerCase()}`}>
    <header>
      {/* Only site images are shown; remote addresses are not fetched before the import. */}
      {card.image?.startsWith('/') ? <img src={card.image} alt="" /> : null}
      <div><h4>{card.title}</h4>{card.subtitle && <small className="sa-hint">{card.subtitle}</small>}</div>
      <span className={`imp-chip ${card.action === 'FAIL' ? 'is-bad' : card.action === 'SKIP' ? '' : 'is-ok'}`}>{ACTION_LABEL[card.action] || card.action}</span>
    </header>
    <dl className="imp-lines">{card.lines.map((l, j) => <div key={j} className={`is-${l.state.toLowerCase()}`}><dt>{l.label}</dt><dd dir="auto">{l.value}</dd><span className="imp-state">{STATE_LABEL[l.state]}</span></div>)}</dl>
    {card.children?.length ? <details><summary>{fa(card.children.length)} زیرمورد</summary>{card.children.map((c, j) => <div key={j} className="imp-child"><b>{c.title}</b><dl className="imp-lines">{c.lines.map((l, k) => <div key={k} className={`is-${l.state.toLowerCase()}`}><dt>{l.label}</dt><dd dir="auto">{l.value}</dd><span className="imp-state">{STATE_LABEL[l.state]}</span></div>)}</dl></div>)}</details> : null}
    <Messages messages={card.messages} />
  </article>)}</div>
}

function DryRunView({ dry, labels, settings, change }: { dry: DryRun; labels: Record<string, string>; settings: Settings; change: (next: Partial<Settings>) => void }) {
  const attrMap = (settings.options.attributeMap || {}) as Record<string, string>
  const optionMap = (settings.options.optionMap || {}) as Record<string, string>
  return <>
    <div className="sa-kpis imp-kpis">
      <div className="sa-kpi"><span>کل رکوردها</span><b className="num">{fa(dry.total)}</b></div>
      <div className="sa-kpi"><span>معتبر</span><b className="num">{fa(dry.valid)}</b></div>
      <div className="sa-kpi"><span>با هشدار</span><b className="num">{fa(dry.warnings)}</b></div>
      <div className="sa-kpi"><span>نامعتبر</span><b className="num">{fa(dry.invalid)}</b></div>
    </div>
    <div className="sa-card"><h3>آنچه انجام می‌شود</h3>
      <Stats stats={{ create: dry.actions.CREATE || 0, update: dry.actions.UPDATE || 0, skip: dry.actions.SKIP || 0, duplicates: dry.duplicates, ...dry.counters }} labels={labels} />
    </div>
    {dry.blocking.map((b) => <Notice key={b} tone="info">{b}</Notice>)}
    {dry.findings.length > 0 && <div className="sa-card sa-table-wrap">
      <div className="sa-card-head"><h3>ویژگی‌های ناشناخته و گزینه‌های جدید</h3></div>
      <table className="data sa-table">
        <thead><tr><th>نوع</th><th>ویژگی</th><th>مقدار</th><th>گروه ویژگی</th><th>محصول</th><th>نتیجه با تنظیمات فعلی</th><th>نگاشت دستی</th></tr></thead>
        <tbody>{dry.findings.map((f, i) => <tr key={i}>
          <td>{f.type === 'unknownAttribute' ? 'ویژگی ناشناخته' : 'گزینهٔ جدید'}{f.variation ? ' (تنوع)' : ''}</td>
          <td>{f.label}</td><td dir="auto">{f.value}</td><td>{f.group}</td>
          <td>{f.products.join('، ')}{f.count > f.products.length ? ` و ${fa(f.count - f.products.length)} مورد دیگر` : ''}</td>
          <td><span className={`imp-chip ${f.outcome === 'rejected' || f.outcome === 'needs-mapping' ? 'is-bad' : f.outcome === 'ignored' ? '' : 'is-ok'}`}>{OUTCOME[f.outcome]}</span></td>
          <td>{f.type === 'newOption' && f.mapKey && f.options?.length ? <select className="select" aria-label={`نگاشت ${f.value}`} value={optionMap[f.mapKey] || ''} onChange={(e) => { const next = { ...optionMap }; if (e.target.value) next[f.mapKey!] = e.target.value; else delete next[f.mapKey!]; change({ options: { ...settings.options, optionMap: next } }) }}>
            <option value="">—</option>{f.options.map((o) => <option key={o} value={o}>{o}</option>)}</select>
            : f.type === 'unknownAttribute' && f.mapKey ? <input className="input" dir="ltr" placeholder="کلید ویژگی گروه" aria-label={`نگاشت ${f.label}`} value={attrMap[f.mapKey] || ''} onChange={(e) => { const next = { ...attrMap }; const v = e.target.value.trim().toLowerCase(); if (v) next[f.mapKey!] = v; else delete next[f.mapKey!]; change({ options: { ...settings.options, attributeMap: next } }) }} /> : '—'}</td>
        </tr>)}</tbody>
      </table>
      <p className="sa-hint">پس از نگاشت یا تغییر رفتار (مرحلهٔ «روابط و ویژگی‌ها»)، اجرای آزمایشی را دوباره انجام دهید.</p>
    </div>}
    {dry.problems.length > 0 && <div className="sa-card sa-table-wrap">
      <div className="sa-card-head"><h3>رکوردهای دارای خطا یا هشدار</h3></div>
      <table className="data sa-table"><thead><tr><th>رکورد</th><th>ردیف</th><th>عنوان</th><th>نتیجه</th><th>پیام‌ها</th></tr></thead>
        <tbody>{dry.problems.slice(0, 200).map((p) => <tr key={p.index}><td className="num">{fa(p.index + 1)}</td><td className="num">{p.rows.slice(0, 3).map((n) => fa(n)).join('، ')}</td><td>{p.title}</td><td>{ACTION_LABEL[p.action] || p.action}</td><td><Messages messages={p.messages} /></td></tr>)}</tbody>
      </table>
    </div>}
  </>
}

function PolicyRows({ fields, policies, mapping, onChange, implicitNote }: { fields: FieldDef[]; policies: Record<string, Policy>; mapping: Record<string, string>; onChange: (key: string, p: Policy) => void; implicitNote?: boolean }) {
  const shown = fields.filter((f) => mapping[f.key] || (f.implicit && implicitNote))
  if (!shown.length) return <p className="sa-empty">فیلدی نگاشت نشده است.</p>
  return <table className="data sa-table imp-policy">
    <thead><tr><th>فیلد</th><th>ساخت رکورد جدید</th><th>به‌روزرسانی رکورد موجود</th><th>نتیجه</th></tr></thead>
    <tbody>{shown.map((f) => {
      const p = policies[f.key] || { create: false, update: false }
      const state = p.create && p.update ? 'ساخت و به‌روزرسانی' : p.create ? 'فقط ساخت' : p.update ? 'فقط به‌روزرسانی' : 'نادیده (Ignore)'
      return <tr key={f.key} className={!p.create && !p.update ? 'is-ignored' : ''}>
        <td><b>{f.label}</b>{f.requiredOnCreate && !p.create && <small className="imp-warn">بدون این فیلد رکورد جدید ساخته نمی‌شود</small>}{f.implicit && <small className="sa-hint">فقط وقتی پیکربندی شده باشد</small>}</td>
        <td><label className="imp-check"><input type="checkbox" checked={p.create} onChange={(e) => onChange(f.key, { ...p, create: e.target.checked })} /> ساخت</label></td>
        <td><label className="imp-check"><input type="checkbox" checked={p.update} disabled={f.updatable === false} onChange={(e) => onChange(f.key, { ...p, update: e.target.checked })} /> به‌روزرسانی</label>{f.updatable === false && <small className="sa-hint">فقط هنگام ساخت</small>}</td>
        <td>{state}</td>
      </tr>
    })}</tbody>
  </table>
}

function FieldSelection({ dest, settings, change }: { dest: Destination; settings: Settings; change: (next: Partial<Settings>) => void }) {
  return <section className="imp-stack">
    <div className="sa-card sa-table-wrap"><div className="sa-card-head"><h3>فیلدهای {dest.entity}</h3>
      <div className="imp-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => change({ policies: Object.fromEntries(Object.entries(settings.policies).map(([k, p]) => [k, { ...p, update: false }])) })}>غیرفعال کردن همهٔ به‌روزرسانی‌ها</button>
      </div></div>
      <PolicyRows fields={dest.fields} policies={settings.policies} mapping={{ ...inputMapping(settings.mapping, settings.fieldInputs), ...(settings.slugMode === 'title' ? { slug: '@generated' } : {}) }} implicitNote onChange={(key, p) => change({ policies: { ...settings.policies, [key]: p } })} />
      <p className="sa-hint">این انتخاب در خود موتور ورود اعمال می‌شود: فیلدی که «ساخت» آن خاموش است در رکورد جدید نوشته نمی‌شود و فیلدی که «به‌روزرسانی» آن خاموش است مقدار فعلی رکورد موجود را هرگز تغییر نمی‌دهد (مثلاً با خاموش کردن قیمت، قیمت فعلی دست نمی‌خورد).</p>
    </div>
    {settings.variants.mode !== 'none' && dest.variantFields.length > 0 && <div className="sa-card sa-table-wrap"><div className="sa-card-head"><h3>فیلدهای {dest.variantLabel || 'تنوع'}</h3></div>
      <PolicyRows fields={dest.variantFields} policies={settings.variantPolicies} mapping={inputMapping(settings.variantMapping, settings.variantInputs)} onChange={(key, p) => change({ variantPolicies: { ...settings.variantPolicies, [key]: p } })} />
    </div>}
  </section>
}

function PlanSummary({ dest, settings, dry, labels }: { dest: Destination; settings: Settings; dry: DryRun | null; labels: Record<string, string> }) {
  const describe = (fields: FieldDef[], policies: Record<string, Policy>, mapping: Record<string, string>) => fields.filter((f) => mapping[f.key] || f.implicit).map((f) => {
    const p = policies[f.key] || { create: false, update: false }
    return [f.label, `ساخت: ${p.create ? 'بله' : 'خیر'} · به‌روزرسانی: ${p.update ? 'بله' : 'خیر'}`] as const
  })
  const optionLabel = (o: OptionDef) => { const v = settings.options[o.key]; return o.choices?.find((c) => c.value === String(v))?.label ?? (typeof v === 'boolean' ? (v ? 'بله' : 'خیر') : typeof v === 'object' ? `${fa(Object.keys(v || {}).length)} مورد` : String(v ?? '')) }
  return <div className="sa-card imp-plan"><h3>برنامهٔ ورود (همین تنظیمات اجرا می‌شود)</h3>
    <dl>
      <div><dt>مقصد</dt><dd>{dest.label}</dd></div>
      <div><dt>منبع شناسه‌ها</dt><dd dir="ltr">{settings.source}</dd></div>
      <div><dt>رکوردهای موجود</dt><dd>{EXISTING.find((e) => e.value === settings.existing)?.label}</dd></div>
      {settings.variants.mode !== 'none' && <div><dt>{dest.variantLabel || 'تنوع‌ها'}</dt><dd>{settings.variants.mode === 'nested' ? `تو در تو (${settings.variants.source})` : `مسطح، گروه‌بندی با ${settings.variants.groupBy}`}</dd></div>}
      {dest.options.filter((o) => !o.when || o.when.values.includes(settings.options[o.when.key])).map((o) => <div key={o.key}><dt>{o.label}</dt><dd>{optionLabel(o)}</dd></div>)}
    </dl>
    <h4>فیلدها</h4>
    <dl>{describe(dest.fields, settings.policies, { ...inputMapping(settings.mapping, settings.fieldInputs), ...(settings.slugMode === 'title' ? { slug: '@generated' } : {}) }).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
    {settings.variants.mode !== 'none' && <><h4>فیلدهای {dest.variantLabel || 'تنوع'}</h4><dl>{describe(dest.variantFields, settings.variantPolicies, inputMapping(settings.variantMapping, settings.variantInputs)).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl></>}
    {dry && <><h4>نتیجهٔ اجرای آزمایشی ({faDate(dry.at, true)})</h4><Stats stats={{ total: dry.total, valid: dry.valid, warnings: dry.warnings, invalid: dry.invalid, create: dry.actions.CREATE || 0, update: dry.actions.UPDATE || 0, skip: dry.actions.SKIP || 0, ...dry.counters }} labels={labels} /></>}
  </div>
}

// ------------------------------------------------------------------ history and templates

function History({ destinations, onOpen }: { destinations: Destination[]; onOpen: (id: number) => void }) {
  const [page, setPage] = useState(1)
  const [adapter, setAdapter] = useState('')
  const [status, setStatus] = useState('')
  const list = useJson<{ jobs: Job[]; pages: number; total: number }>(`/api/admin/imports?view=jobs&page=${page}&adapter=${adapter}&status=${status}`)
  const [notice, setNotice] = useState('')
  async function remove(job: Job) {
    if (!window.confirm(`ورود اطلاعات #${job.id} و تاریخچهٔ رکوردهایش حذف شود؟ رکوردهای واردشده در سایت باقی می‌مانند.`)) return
    const result = await post({ op: 'delete', id: job.id })
    if (!result.ok) { setNotice(result.error); return }
    void list.reload()
  }
  const name = (id: string) => destinations.find((d) => d.id === id)?.label || id
  return <section className="sa-card sa-table-wrap">
    <div className="sa-card-head"><h3>تاریخچه{list.data ? ` (${fa(list.data.total)})` : ''}</h3>
      <div className="imp-actions">
        <select className="select" aria-label="مقصد" value={adapter} onChange={(e) => { setAdapter(e.target.value); setPage(1) }}><option value="">همهٔ مقصدها</option>{destinations.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select>
        <select className="select" aria-label="وضعیت" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}><option value="">همهٔ وضعیت‌ها</option>{['DRAFT', 'QUEUED', 'RUNNING', 'PAUSED', 'DONE', 'DONE_WITH_ERRORS', 'FAILED', 'CANCELLED', 'ROLLED_BACK'].map((s) => <option key={s} value={s}>{s}</option>)}</select>
      </div></div>
    {notice && <Notice tone="error">{notice}</Notice>}
    {list.error && <Notice tone="error">{list.error}</Notice>}
    {!list.data ? <div className="sa-skeleton" style={{ height: 160 }} /> : !list.data.jobs.length ? <p className="sa-empty">هنوز ورودی انجام نشده است.</p> :
      <table className="data sa-table"><thead><tr><th>#</th><th>مقصد</th><th>فایل</th><th>وضعیت</th><th>پیشرفت</th><th>نتیجه</th><th>تاریخ</th><th /></tr></thead>
        <tbody>{list.data.jobs.map((job) => <tr key={job.id}>
          <td className="num">{fa(job.id)}</td><td>{name(job.adapter)}</td><td dir="auto">{job.fileName}</td><td><StatusChip status={job.status} /></td>
          <td className="num">{fa(job.stats.processed || 0)} / {fa(job.total)}</td>
          <td className="num">{fa(job.stats.created || 0)} ساخت · {fa(job.stats.updated || 0)} به‌روز · {fa(job.stats.failed || 0)} خطا</td>
          <td>{faDate(job.createdAt, true)}</td>
          <td className="sp-row-actions"><button type="button" className="sa-link" onClick={() => onOpen(job.id)}>گزارش</button>{!['QUEUED', 'RUNNING', 'ROLLING_BACK'].includes(job.status) && <button type="button" className="sa-link is-danger" onClick={() => remove(job)}>حذف</button>}</td>
        </tr>)}</tbody></table>}
    {list.data && <Pager page={page} pages={list.data.pages} onPage={setPage} />}
  </section>
}

function Templates({ destinations }: { destinations: Destination[] }) {
  const list = useJson<{ templates: Template[] }>('/api/admin/imports?view=templates')
  const [notice, setNotice] = useState('')
  async function remove(tpl: Template) {
    if (!window.confirm(`الگوی «${tpl.name}» حذف شود؟`)) return
    const result = await post({ op: 'template-delete', templateId: tpl.id })
    if (!result.ok) { setNotice(result.error); return }
    void list.reload()
  }
  return <section className="sa-card sa-table-wrap">
    <div className="sa-card-head"><h3>الگوهای ورود</h3></div>
    <p className="sa-hint">الگو نگاشت ستون‌ها، انتخاب فیلدها (ساخت/به‌روزرسانی)، ویژگی‌ها و تنظیمات را نگه می‌دارد — نه فایل یا داده‌ها را. در مرحلهٔ «نگاشت فیلدها» الگو بسازید.</p>
    {notice && <Notice tone="error">{notice}</Notice>}
    {!list.data ? <div className="sa-skeleton" style={{ height: 120 }} /> : !list.data.templates.length ? <p className="sa-empty">الگویی ذخیره نشده است.</p> :
      <table className="data sa-table"><thead><tr><th>نام</th><th>مقصد</th><th>فیلدهای نگاشت‌شده</th><th>آخرین تغییر</th><th /></tr></thead>
        <tbody>{list.data.templates.map((tpl) => <tr key={tpl.id}><td><b>{tpl.name}</b></td><td>{destinations.find((d) => d.id === tpl.adapter)?.label || tpl.adapter}</td><td className="num">{fa(Object.keys(tpl.settings.mapping || {}).length)}</td><td>{faDate(tpl.updatedAt, true)}</td><td><button type="button" className="sa-link is-danger" onClick={() => remove(tpl)}>حذف</button></td></tr>)}</tbody></table>}
  </section>
}
