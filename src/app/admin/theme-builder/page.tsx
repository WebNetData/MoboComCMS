'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from '@/components/AppLink'
import { useRouter } from '@/platform/routing/navigation'
import { useI18n } from '@/i18n/LocaleProvider'
import {
  THEME_TEMPLATE_TYPES, THEME_TYPE_LABELS, describeTarget,
  type ConditionRule, type Placement, type ThemeTemplateMeta, type ThemeTemplateType,
} from '@/modules/site/domain/theme-templates'

type Category = { id: number; name: string; nameEn: string; parentId: number | null; slug: string }
type Preset = { id: string; fa: string; en: string; descFa: string; descEn: string; sections: number }
type Payload = { templates: ThemeTemplateMeta[]; postCategories: Category[]; productCategories: Category[]; presets: Record<ThemeTemplateType, Preset[]> }
type L = (en: string, fa: string) => string

const TYPE_GLYPH: Record<ThemeTemplateType, string> = { header: '▔', footer: '▁', page: '▣', 'single-post': '¶', 'single-product': '◈' }

/** Which rule kinds a template type offers. */
const RULE_KINDS: Record<Exclude<ThemeTemplateType, 'page'>, string[]> = {
  header: ['all', 'home', 'blog', 'shop', 'pages', 'sections', 'section', 'posts', 'post-category', 'products', 'product-kind', 'product-category'],
  footer: ['all', 'home', 'blog', 'shop', 'pages', 'sections', 'section', 'posts', 'post-category', 'products', 'product-kind', 'product-category'],
  'single-post': ['posts', 'post-category'],
  'single-product': ['products', 'product-kind', 'product-category'],
}

const KIND_LABEL = (L: L): Record<string, string> => ({
  all: L('Entire site', 'کل سایت'),
  home: L('Home page', 'صفحه اصلی'),
  blog: L('Journal landing', 'صفحه اصلی مجله'),
  shop: L('Shop landing', 'صفحه فروشگاه'),
  pages: L('All CMS pages', 'همه صفحه‌های محتوایی'),
  sections: L('All sections', 'همه بخش‌ها'),
  section: L('A section…', 'یک بخش…'),
  posts: L('All posts', 'همه پست‌ها'),
  'post-category': L('Posts in category…', 'پست‌های دستهٔ…'),
  products: L('All products', 'همه محصولات'),
  'product-kind': L('Products of kind…', 'محصولات نوع…'),
  'product-category': L('Products in category…', 'محصولات دستهٔ…'),
})

const catLabel = (fa: boolean, c: Category) => (fa ? c.name : c.nameEn || c.name)

function fmtDate(value: string, fa: boolean) {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(fa ? 'fa-IR' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function ThemeBuilderPage() {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const L = useCallback<L>((en, persian) => (fa ? persian : en), [fa])
  const router = useRouter()
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<'all' | ThemeTemplateType>('all')
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<ThemeTemplateMeta | null>(null)
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => {
    const response = await fetch('/api/admin/theme-templates', { cache: 'no-store' })
    const body = await response.json().catch(() => null)
    if (response.ok) { setData(body); setError('') } else setError(body?.error || L('Could not load templates.', 'بارگذاری قالب‌ها ممکن نشد.'))
  }, [L])
  useEffect(() => { void load() }, [load])

  const names = useMemo(() => ({
    post: new Map((data?.postCategories || []).map((c) => [c.id, catLabel(fa, c)])),
    product: new Map((data?.productCategories || []).map((c) => [c.id, catLabel(fa, c)])),
  }), [data, fa])

  const patch = async (id: string, body: Record<string, unknown>) => {
    setBusy(id); setError('')
    const response = await fetch('/api/admin/theme-templates', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...body }) })
    const result = await response.json().catch(() => null)
    setBusy('')
    if (!response.ok) { setError(result?.error || L('Update failed.', 'به‌روزرسانی انجام نشد.')); return false }
    await load()
    return true
  }

  const duplicate = async (id: string) => {
    setBusy(id)
    const response = await fetch('/api/admin/theme-templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'duplicate', id }) })
    const result = await response.json().catch(() => null)
    setBusy('')
    if (!response.ok) setError(result?.error || L('Could not duplicate.', 'کپی ممکن نشد.'))
    await load()
  }

  const remove = async (meta: ThemeTemplateMeta) => {
    if (!window.confirm(L(`Delete “${meta.nameEn || meta.name}”? This cannot be undone.`, `«${meta.name}» حذف شود؟ این کار برگشت‌پذیر نیست.`))) return
    setBusy(meta.id)
    const response = await fetch(`/api/admin/theme-templates?id=${encodeURIComponent(meta.id)}`, { method: 'DELETE' })
    const result = await response.json().catch(() => null)
    setBusy('')
    if (!response.ok) setError(result?.error || L('Could not delete.', 'حذف ممکن نشد.'))
    await load()
  }

  const templates = data?.templates || []
  const shown = filter === 'all' ? templates : templates.filter((entry) => entry.type === filter)
  const published = (type: ThemeTemplateType) => templates.filter((entry) => entry.type === type && entry.status === 'published')
  const placed = (kind: Placement['kind']) => templates.find((entry) => entry.type === 'page' && entry.status === 'published' && entry.placement.kind === kind)

  const overview: { label: string; value: string; href?: string; empty: boolean }[] = [
    { label: L('Header', 'هدر'), value: published('header').map((e) => L(e.nameEn || e.name, e.name)).join('، ') || L('Theme default', 'پیش‌فرض قالب'), empty: !published('header').length },
    { label: L('Footer', 'فوتر'), value: published('footer').map((e) => L(e.nameEn || e.name, e.name)).join('، ') || L('Theme default', 'پیش‌فرض قالب'), empty: !published('footer').length },
    { label: L('Home page', 'صفحه اصلی'), value: placed('home') ? L(placed('home')!.nameEn || placed('home')!.name, placed('home')!.name) : L('Home builder / default', 'صفحه‌ساز خانه / پیش‌فرض'), href: '/', empty: !placed('home') },
    { label: L('Journal landing', 'صفحه اصلی مجله'), value: placed('blog') ? L(placed('blog')!.nameEn || placed('blog')!.name, placed('blog')!.name) : L('Journal builder / default', 'صفحه‌ساز مجله / پیش‌فرض'), href: '/blog', empty: !placed('blog') },
    { label: L('Shop landing', 'صفحه فروشگاه'), value: placed('shop') ? L(placed('shop')!.nameEn || placed('shop')!.name, placed('shop')!.name) : L('Default store grid', 'فهرست پیش‌فرض'), href: '/products', empty: !placed('shop') },
    { label: L('Sections', 'بخش‌ها'), value: templates.filter((e) => e.type === 'page' && e.status === 'published' && e.placement.kind === 'section').map((e) => `/${e.placement.slug}`).join('  ') || L('None yet', 'هنوز ندارد'), empty: !templates.some((e) => e.type === 'page' && e.placement.kind === 'section' && e.status === 'published') },
  ]

  return <div className="tb-page">
    <header className="tb-hero">
      <div>
        <span className="tb-eyebrow">قالب‌ساز</span>
        <h1>{L('Theme builder', 'سازندهٔ قالب سایت')}</h1>
        <p>{L('Design headers, footers, full pages, sections and single-post / product layouts — then decide where each one appears.', 'هدر، فوتر، صفحه‌های کامل، بخش‌ها و قالب پست و محصول را طراحی کنید و تعیین کنید هر کدام کجا نمایش داده شود.')}</p>
      </div>
      <button type="button" className="btn btn-primary tb-new" onClick={() => setCreating(true)}>＋ {L('New template', 'قالب جدید')}</button>
    </header>

    {error && <p role="alert" className="tb-alert">{error}</p>}

    <section className="tb-overview" aria-label={L('What your site uses now', 'وضعیت فعلی سایت')}>
      {overview.map((item) => <div className={`tb-overview-card${item.empty ? ' is-default' : ''}`} key={item.label}>
        <small>{item.label}</small>
        <strong>{item.value}</strong>
        {item.href && <a href={item.href} target="_blank" rel="noreferrer">{L('View ↗', 'مشاهده ↗')}</a>}
      </div>)}
    </section>

    <nav className="tb-tabs" role="tablist">
      {(['all', ...THEME_TEMPLATE_TYPES] as const).map((type) => {
        const count = type === 'all' ? templates.length : templates.filter((entry) => entry.type === type).length
        return <button key={type} type="button" role="tab" aria-selected={filter === type} className={filter === type ? 'is-active' : ''} onClick={() => setFilter(type)}>
          {type === 'all' ? L('All', 'همه') : L(THEME_TYPE_LABELS[type].en, THEME_TYPE_LABELS[type].fa)}
          <span>{count}</span>
        </button>
      })}
    </nav>

    {!data && !error && <div className="tb-empty">{L('Loading…', 'در حال بارگذاری…')}</div>}
    {data && !shown.length && <div className="tb-empty">
      <b>{L('No templates here yet', 'هنوز قالبی اینجا نیست')}</b>
      <p>{L('Start from a blank canvas or a ready-made design.', 'از یک صفحهٔ خالی یا یک طرح آماده شروع کنید.')}</p>
      <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>＋ {L('New template', 'قالب جدید')}</button>
    </div>}

    <div className="tb-grid">
      {shown.map((meta) => {
        const label = THEME_TYPE_LABELS[meta.type]
        const live = meta.status === 'published'
        const path = meta.type === 'page'
          ? meta.placement.kind === 'home' ? '/' : meta.placement.kind === 'blog' ? '/blog' : meta.placement.kind === 'shop' ? '/products' : meta.placement.kind === 'section' ? `/${meta.placement.slug}` : ''
          : ''
        return <article className={`tb-card t-${meta.type}${live ? ' is-live' : ''}`} key={meta.id} aria-busy={busy === meta.id}>
          <div className="tb-card-art" aria-hidden="true"><span>{TYPE_GLYPH[meta.type]}</span></div>
          <div className="tb-card-body">
            <div className="tb-card-top">
              <span className="tb-type">{L(label.en, label.fa)}</span>
              <label className="tb-switch" title={live ? L('Published — click to unpublish', 'منتشرشده — برای غیرفعال‌کردن کلیک کنید') : L('Draft — click to publish', 'پیش‌نویس — برای انتشار کلیک کنید')}>
                <input type="checkbox" checked={live} disabled={busy === meta.id} onChange={(event) => void patch(meta.id, { status: event.target.checked ? 'published' : 'draft' })} />
                <span>{live ? L('Live', 'فعال') : L('Draft', 'پیش‌نویس')}</span>
              </label>
            </div>
            <h3>{L(meta.nameEn || meta.name, meta.name)}</h3>
            <div className="tb-rules">
              {meta.type === 'page'
                ? <span className={`tb-chip${meta.placement.kind === 'none' ? ' is-muted' : ''}`}>{meta.placement.kind === 'none' ? L('Not placed', 'بدون جایگاه') : meta.placement.kind === 'home' ? L('Home page', 'صفحه اصلی') : meta.placement.kind === 'blog' ? L('Journal landing', 'صفحه اصلی مجله') : meta.placement.kind === 'shop' ? L('Shop landing', 'صفحه فروشگاه') : <span dir="ltr">/{meta.placement.slug}</span>}</span>
                : meta.conditions.length
                  ? meta.conditions.map((rule) => <span className={`tb-chip${rule.mode === 'exclude' ? ' is-exclude' : ''}`} key={rule.mode + rule.target}>{rule.mode === 'exclude' ? '− ' : ''}{describeTarget(rule.target, fa, names)}</span>)
                  : <span className="tb-chip is-muted">{L('No display rules — never shown automatically', 'بدون شرط — خودکار نمایش داده نمی‌شود')}</span>}
              {meta.sticky && <span className="tb-chip">{L('Sticky', 'چسبان')}</span>}
            </div>
            <footer>
              <small>{L('Updated', 'ویرایش')} {fmtDate(meta.updatedAt, fa)}</small>
              <div className="tb-actions">
                <Link className="btn btn-primary btn-sm" href={`/admin/builder/${meta.id}`}>{L('Edit design', 'ویرایش طرح')}</Link>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(meta)}>{meta.type === 'page' ? L('Placement', 'جایگاه') : L('Display rules', 'شرط نمایش')}</button>
                {live && path && <a className="btn btn-ghost btn-sm" href={path} target="_blank" rel="noreferrer">↗</a>}
                <button type="button" className="btn btn-ghost btn-sm" aria-label={L('Duplicate', 'کپی')} title={L('Duplicate', 'کپی')} onClick={() => void duplicate(meta.id)}>⧉</button>
                <button type="button" className="btn btn-ghost btn-sm tb-danger" aria-label={L('Delete', 'حذف')} title={L('Delete', 'حذف')} onClick={() => void remove(meta)}>✕</button>
              </div>
            </footer>
          </div>
        </article>
      })}
    </div>

    <section className="tb-help">
      <h2>{L('How it works', 'چطور کار می‌کند؟')}</h2>
      <ol>
        <li>{L('Create a template and design it in the visual builder (drag blocks, sections and columns).', 'یک قالب بسازید و در صفحه‌ساز بصری طراحی کنید (کشیدن بلوک، بخش و ستون).')}</li>
        <li>{L('Set its display rules (e.g. “posts in Gaming”) or, for pages, its placement (home, journal, shop or a /section URL).', 'شرط نمایش (مثلاً «پست‌های دستهٔ گیمینگ») یا برای صفحه‌ها جایگاه را تعیین کنید (خانه، مجله، فروشگاه یا آدرس ‎/بخش).')}</li>
        <li>{L('Publish it. The most specific rule wins; a post or product can still pick another layout manually in its builder.', 'منتشر کنید. دقیق‌ترین شرط برنده است؛ هر پست یا محصول می‌تواند در صفحه‌ساز خودش قالب دیگری را دستی انتخاب کند.')}</li>
      </ol>
    </section>

    {creating && data && <CreateDialog L={L} presets={data.presets} onClose={() => setCreating(false)} onCreated={(meta) => router.push(`/admin/builder/${meta.id}`)} />}
    {editing && data && <RulesDialog
      L={L} fa={fa} meta={editing} data={data}
      onClose={() => setEditing(null)}
      onSave={async (body) => { if (await patch(editing.id, body)) setEditing(null) }}
    />}
  </div>
}

function CreateDialog({ L, presets, onClose, onCreated }: { L: L; presets: Record<ThemeTemplateType, Preset[]>; onClose: () => void; onCreated: (meta: ThemeTemplateMeta) => void }) {
  const [type, setType] = useState<ThemeTemplateType | null>(null)
  const [name, setName] = useState('')
  const [nameEn, setNameEn] = useState('')
  const [preset, setPreset] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const create = async () => {
    if (!type || !name.trim()) return
    setBusy(true); setError('')
    const response = await fetch('/api/admin/theme-templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, name, nameEn, preset }) })
    const result = await response.json().catch(() => null)
    setBusy(false)
    if (response.ok && result?.template) onCreated(result.template)
    else setError(result?.error || L('Could not create the template.', 'ساخت قالب ممکن نشد.'))
  }

  return <div className="tb-modal" role="dialog" aria-modal="true" onClick={onClose}>
    <div className="tb-modal-box" onClick={(event) => event.stopPropagation()}>
      <header>
        <h2>{type ? L(`New ${THEME_TYPE_LABELS[type].en.toLowerCase()} template`, `قالب ${THEME_TYPE_LABELS[type].fa} جدید`) : L('What do you want to build?', 'چه چیزی می‌خواهید بسازید؟')}</h2>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label={L('Close', 'بستن')}>✕</button>
      </header>
      {!type ? <div className="tb-type-grid">
        {THEME_TEMPLATE_TYPES.map((entry) => <button type="button" key={entry} className={`tb-type-tile t-${entry}`} onClick={() => { setType(entry); setPreset('') }}>
          <span className="tb-type-glyph" aria-hidden="true">{TYPE_GLYPH[entry]}</span>
          <b>{L(THEME_TYPE_LABELS[entry].en, THEME_TYPE_LABELS[entry].fa)}</b>
          <small>{L(THEME_TYPE_LABELS[entry].descEn, THEME_TYPE_LABELS[entry].descFa)}</small>
        </button>)}
      </div> : <>
        <div className="tb-form-row">
          <label><span>{L('Name (FA)', 'نام (فارسی)')}</span><input className="input" autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder={type === 'single-post' ? 'مثلاً: قالب نقد فیلم' : type === 'page' ? 'مثلاً: بخش گیمینگ' : ''} /></label>
          <label><span>{L('Name (EN)', 'نام (انگلیسی)')}</span><input className="input" dir="ltr" value={nameEn} onChange={(event) => setNameEn(event.target.value)} /></label>
        </div>
        <h3>{L('Start from', 'نقطهٔ شروع')}</h3>
        <div className="tb-preset-grid">
          <button type="button" className={`tb-preset${preset === '' ? ' is-selected' : ''}`} onClick={() => setPreset('')}>
            <span className="tb-preset-art is-blank" aria-hidden="true">＋</span>
            <b>{L('Blank canvas', 'بوم خالی')}</b>
            <small>{L('Build everything from scratch', 'همه‌چیز را از صفر بسازید')}</small>
          </button>
          {(presets[type] || []).map((entry) => <button type="button" key={entry.id} className={`tb-preset${preset === entry.id ? ' is-selected' : ''}`} onClick={() => setPreset(entry.id)}>
            <span className="tb-preset-art" aria-hidden="true">{Array.from({ length: Math.min(4, entry.sections) }, (_, i) => <i key={i} />)}</span>
            <b>{L(entry.en, entry.fa)}</b>
            <small>{L(entry.descEn, entry.descFa)}</small>
          </button>)}
        </div>
        {error && <p role="alert" className="tb-alert">{error}</p>}
        <footer className="tb-modal-foot">
          <button type="button" className="btn btn-ghost" onClick={() => setType(null)}>← {L('Back', 'بازگشت')}</button>
          <button type="button" className="btn btn-primary" disabled={busy || !name.trim()} onClick={() => void create()}>{busy ? L('Creating…', 'در حال ساخت…') : L('Create & open builder', 'ساخت و باز کردن صفحه‌ساز')}</button>
        </footer>
      </>}
    </div>
  </div>
}

type RuleDraft = { mode: 'include' | 'exclude'; kind: string; value: string }

function toDraft(rule: ConditionRule): RuleDraft {
  const [kind, value = ''] = rule.target.split(':')
  return { mode: rule.mode, kind, value }
}
function fromDraft(rule: RuleDraft): ConditionRule | null {
  const needsValue = ['section', 'post-category', 'product-category', 'product-kind'].includes(rule.kind)
  if (needsValue && !rule.value) return null
  return { mode: rule.mode, target: needsValue ? `${rule.kind}:${rule.value}` : rule.kind }
}

function RulesDialog({ L, fa, meta, data, onClose, onSave }: { L: L; fa: boolean; meta: ThemeTemplateMeta; data: Payload; onClose: () => void; onSave: (body: Record<string, unknown>) => Promise<void> }) {
  const [rules, setRules] = useState<RuleDraft[]>(() => meta.conditions.map(toDraft))
  const [priority, setPriority] = useState(meta.priority)
  const [sticky, setSticky] = useState(meta.sticky)
  const [placement, setPlacement] = useState<Placement>(meta.placement)
  const [saving, setSaving] = useState(false)
  const kinds = meta.type === 'page' ? [] : RULE_KINDS[meta.type]
  const labels = KIND_LABEL(L)
  const sections = data.templates.filter((entry) => entry.type === 'page' && entry.placement.kind === 'section')

  const save = async () => {
    setSaving(true)
    if (meta.type === 'page') await onSave({ placement })
    else await onSave({ conditions: rules.map(fromDraft).filter(Boolean), priority, sticky })
    setSaving(false)
  }

  const valueField = (rule: RuleDraft, index: number) => {
    const set = (value: string) => setRules((list) => list.map((entry, i) => (i === index ? { ...entry, value } : entry)))
    if (rule.kind === 'post-category') return <select className="select" value={rule.value} onChange={(event) => set(event.target.value)}>
      <option value="">{L('Choose a category', 'انتخاب دسته')}</option>
      {data.postCategories.map((c) => <option key={c.id} value={c.id}>{catLabel(fa, c)}</option>)}
    </select>
    if (rule.kind === 'product-category') return <select className="select" value={rule.value} onChange={(event) => set(event.target.value)}>
      <option value="">{L('Choose a category', 'انتخاب دسته')}</option>
      {data.productCategories.map((c) => <option key={c.id} value={c.id}>{catLabel(fa, c)}</option>)}
    </select>
    if (rule.kind === 'product-kind') return <select className="select" value={rule.value} onChange={(event) => set(event.target.value)}>
      <option value="">{L('Choose', 'انتخاب')}</option>
      <option value="VIRTUAL">{L('Digital products', 'محصولات مجازی')}</option>
      <option value="PHYSICAL">{L('Physical products', 'محصولات فیزیکی')}</option>
    </select>
    if (rule.kind === 'section') return <select className="select" value={rule.value} onChange={(event) => set(event.target.value)}>
      <option value="">{L('Choose a section', 'انتخاب بخش')}</option>
      <optgroup label={L('Built-in modules', 'ماژول‌های داخلی')}>
        {[['software', L('Software', 'نرم‌افزار')], ['games', L('Games', 'بازی')], ['music', L('Music', 'موزیک')], ['cinema', L('Films & series', 'فیلم و سریال')], ['forum', L('Forum', 'تالار گفتمان')], ['vip', L('VIP membership', 'اشتراک ویژه')], ['search', L('Search', 'جست‌وجو')], ['compare', L('Compare', 'مقایسه')]].map(([slug, name]) => <option key={slug} value={slug} data-vip={slug === 'vip' ? '' : undefined}>/{slug} — {name}</option>)}
      </optgroup>
      {sections.length > 0 && <optgroup label={L('Your sections', 'بخش‌های شما')}>{sections.map((s) => <option key={s.id} value={s.placement.slug}>/{s.placement.slug} — {fa ? s.name : s.nameEn || s.name}</option>)}</optgroup>}
    </select>
    return null
  }

  return <div className="tb-modal" role="dialog" aria-modal="true" onClick={onClose}>
    <div className="tb-modal-box tb-rules-box" onClick={(event) => event.stopPropagation()}>
      <header>
        <h2>{meta.type === 'page' ? L('Where is this page used?', 'این صفحه کجا استفاده شود؟') : L('Where should this template appear?', 'این قالب کجا نمایش داده شود؟')}</h2>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label={L('Close', 'بستن')}>✕</button>
      </header>

      {meta.type === 'page' ? <div className="tb-placement">
        {([
          ['none', L('Not placed (draft area)', 'بدون جایگاه'), L('Only reachable from the builder.', 'فقط از صفحه‌ساز قابل دسترسی است.')],
          ['home', L('Home page', 'صفحه اصلی سایت'), L('Replaces the home page at /', 'جایگزین صفحه اصلی در آدرس /')],
          ['blog', L('Journal landing', 'صفحه اصلی مجله'), L('Replaces /blog (search and category pages stay)', 'جایگزین ‎/blog (جست‌وجو و دسته‌ها باقی می‌مانند)')],
          ['shop', L('Shop landing', 'صفحه اصلی فروشگاه'), L('Replaces /products (category filters stay)', 'جایگزین ‎/products (فیلتر دسته‌ها باقی می‌ماند)')],
          ['section', L('A section with its own URL', 'یک بخش با آدرس اختصاصی'), L('For example /gaming or /podcast (/music, /cinema and /games are built-in modules)', 'مثلاً ‎/gaming یا ‎/podcast (‏‎/music، ‎/cinema و ‎/games ماژول داخلی هستند)')],
        ] as [Placement['kind'], string, string][]).map(([kind, title, text]) => <label key={kind} className={`tb-place${placement.kind === kind ? ' is-selected' : ''}`}>
          <input type="radio" name="placement" checked={placement.kind === kind} onChange={() => setPlacement((p) => ({ ...p, kind }))} />
          <span><b>{title}</b><small>{text}</small></span>
        </label>)}
        {placement.kind === 'section' && <div className="tb-section-fields">
          <label><span>{L('Address', 'آدرس')}</span>
            <div className="tb-url" dir="ltr"><span>{typeof window !== 'undefined' ? window.location.host : ''}/</span><input className="input" value={placement.slug} placeholder="gaming" onChange={(event) => setPlacement((p) => ({ ...p, slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))} /></div>
          </label>
          <div className="tb-builtin-sections" role="group" aria-label={L('Replace a built-in section landing', 'جایگزینی صفحهٔ اصلی بخش‌های داخلی')}>
            <small>{L('Or replace the landing page of a built-in section:', 'یا صفحهٔ اصلی یکی از بخش‌های داخلی را جایگزین کنید:')}</small>
            {([['software', L('Software', 'نرم‌افزار')], ['games', L('Games', 'بازی')], ['music', L('Music', 'موزیک')], ['cinema', L('Films & series', 'فیلم و سریال')], ['forum', L('Forum', 'تالار گفتمان')], ['vip', L('VIP', 'اشتراک ویژه')]] as [string, string][]).map(([slug, name]) => <button key={slug} data-vip={slug === 'vip' ? '' : undefined} type="button" className={`btn btn-sm ${placement.slug === slug ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setPlacement((p) => ({ ...p, slug }))}>{name}</button>)}
          </div>
          <label><span>{L('Journal category of this section (optional)', 'دستهٔ مجلهٔ این بخش (اختیاری)')}</span>
            <select className="select" value={placement.postCategoryId ?? ''} onChange={(event) => setPlacement((p) => ({ ...p, postCategoryId: event.target.value ? Number(event.target.value) : null }))}>
              <option value="">{L('— none —', '— هیچ —')}</option>
              {data.postCategories.map((c) => <option key={c.id} value={c.id}>{catLabel(fa, c)}</option>)}
            </select>
          </label>
          <label><span>{L('Store category of this section (optional)', 'دستهٔ فروشگاهِ این بخش (اختیاری)')}</span>
            <select className="select" value={placement.productCategoryId ?? ''} onChange={(event) => setPlacement((p) => ({ ...p, productCategoryId: event.target.value ? Number(event.target.value) : null }))}>
              <option value="">{L('— none —', '— هیچ —')}</option>
              {data.productCategories.map((c) => <option key={c.id} value={c.id}>{catLabel(fa, c)}</option>)}
            </select>
          </label>
          <p className="muted text-sm">{L('“Posts” and “Products” blocks set to “This section” show items from these categories.', 'بلوک‌های «مجله» و «محصولات» با فیلتر «همین بخش» مطالب و محصولات همین دسته‌ها را نشان می‌دهند.')}</p>
        </div>}
        {meta.status !== 'published' && <p className="tb-note">{L('The placement takes effect once the template is published.', 'جایگاه پس از انتشار قالب اعمال می‌شود.')}</p>}
      </div> : <>
        <div className="tb-rule-list">
          {rules.map((rule, index) => <div className={`tb-rule${rule.mode === 'exclude' ? ' is-exclude' : ''}`} key={index}>
            <select className="select tb-rule-mode" value={rule.mode} onChange={(event) => setRules((list) => list.map((entry, i) => (i === index ? { ...entry, mode: event.target.value === 'exclude' ? 'exclude' : 'include' } : entry)))}>
              <option value="include">{L('Show on', 'نمایش در')}</option>
              <option value="exclude">{L('Hide on', 'به‌جز')}</option>
            </select>
            <select className="select" value={rule.kind} onChange={(event) => setRules((list) => list.map((entry, i) => (i === index ? { ...entry, kind: event.target.value, value: '' } : entry)))}>
              {kinds.map((kind) => <option key={kind} value={kind}>{labels[kind]}</option>)}
            </select>
            {valueField(rule, index)}
            <button type="button" className="btn btn-ghost btn-sm tb-danger" aria-label={L('Remove rule', 'حذف شرط')} onClick={() => setRules((list) => list.filter((_, i) => i !== index))}>✕</button>
          </div>)}
          {!rules.length && <p className="muted text-sm">{L('No rules — this template is never applied automatically (it can still be chosen manually).', 'بدون شرط — خودکار اعمال نمی‌شود (هنوز می‌توان آن را دستی انتخاب کرد).')}</p>}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRules((list) => [...list, { mode: 'include', kind: kinds[0], value: '' }])}>＋ {L('Add rule', 'افزودن شرط')}</button>
        </div>
        <div className="tb-form-row">
          <label><span>{L('Priority (when two templates match equally)', 'اولویت (وقتی دو قالب هم‌سطح منطبق باشند)')}</span><input className="input" type="number" min={-100} max={100} value={priority} onChange={(event) => setPriority(Number(event.target.value) || 0)} /></label>
          {meta.type === 'header' && <label className="tb-check"><input type="checkbox" checked={sticky} onChange={(event) => setSticky(event.target.checked)} /><span>{L('Sticky header (stays on top while scrolling)', 'هدر چسبان (هنگام اسکرول بالای صفحه می‌ماند)')}</span></label>}
        </div>
        <p className="muted text-sm">{L('The most specific matching rule wins: a section or category beats “all posts”, which beats “entire site”.', 'دقیق‌ترین شرط برنده است: بخش یا دسته از «همهٔ پست‌ها» و آن هم از «کل سایت» مهم‌تر است.')}</p>
      </>}

      <footer className="tb-modal-foot">
        <button type="button" className="btn btn-ghost" onClick={onClose}>{L('Cancel', 'انصراف')}</button>
        <button type="button" className="btn btn-primary" disabled={saving || (placement.kind === 'section' && !placement.slug)} onClick={() => void save()}>{saving ? L('Saving…', 'در حال ذخیره…') : L('Save', 'ذخیره')}</button>
      </footer>
    </div>
  </div>
}
