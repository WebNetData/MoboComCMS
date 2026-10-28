'use client'

import SectionSettingsHistoryLink from '@/components/admin/SectionSettingsHistoryLink'
import Link from '@/components/AppLink'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  MAX_CUSTOM_POST_STYLES, POST_STYLE_BASES, POST_STYLE_BASE_KEYS, builtinStyleId, newCustomStyleId,
  type CustomPostStyle, type PostStyleBase, type PostStyleSettings,
} from '@/modules/journal/domain/post-styles'
import type { JournalSettings } from '@/modules/journal/domain/journal'
import { useSectionLists } from '../../cms/useSectionLists'
import { JournalShell, Notice, send, useJson } from '../shared'
import PostStyleThumb from '../PostStyleThumb'
import MyPostTemplates, { createPostTemplate } from '../MyPostTemplates'
import css from '../post-styles.module.css'

type LayoutOption = { id: string; fa: string; group: string; status?: string; base?: string; sidebar?: boolean; desc?: string }
const SWATCHES = ['#2563eb', '#7c3aed', '#db2777', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0891b2']
const CORNERS = [['round', 'گرد'], ['soft', 'نرم'], ['sharp', 'تیز']] as const
const ALIGNS = [['start', 'کنار'], ['center', 'میانه']] as const

/**
 * «استایل صفحهٔ نوشته»: the designed styles, the owner's own styles (made from one of them), the style or builder
 * layout of each kind of article, and the default. Saved in the magazine's settings (history and revision claim).
 */
export default function PostStylesPage() {
  const { data, error } = useJson<{ settingsRevision: string; settings: JournalSettings; previewSlug: string }>('/api/admin/journal/settings')
  const formats = useSectionLists('journal', true).POST_FORMAT || []
  const [form, setForm] = useState<PostStyleSettings | null>(null)
  const [baseline, setBaseline] = useState<PostStyleSettings | null>(null)
  const [revision, setRevision] = useState('')
  const [editing, setEditing] = useState('')
  const [layouts, setLayouts] = useState<LayoutOption[]>([])
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (data) { setForm((current) => current ?? data.settings.postStyle); setBaseline((current) => current ?? data.settings.postStyle); setRevision((current) => current || data.settingsRevision || '') } }, [data])
  const loadLayouts = useCallback(() => {
    void fetch('/api/admin/builder/post-template?options=post', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null))
      .then((body) => setLayouts((body?.options || []).filter((option: LayoutOption) => option.group !== 'style' && option.group !== 'mystyle'))).catch(() => undefined)
  }, [])
  useEffect(() => { loadLayouts() }, [loadLayouts])
  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(baseline), [form, baseline])

  if (!form) return <JournalShell title="استایل صفحهٔ نوشته">{error ? <Notice tone="error">{error}</Notice> : <div className="sa-skeleton" aria-busy="true" />}</JournalShell>
  // The server normalises on save; here a name may hold a space typed between words.
  const set = (next: PostStyleSettings) => { setMessage(null); setForm(next) }
  const saved = (id: string) => !!baseline && (id.startsWith('ps-') || baseline.custom.some((style) => style.id === id))
  const previewHref = (id: string) => (data?.previewSlug ? `/blog/${data.previewSlug}?style=${id}` : '')
  const currentDefault = form.defaultId || 'ps-classic'
  const custom = form.custom.find((style) => style.id === editing) || null
  const changeCustom = (patch: Partial<CustomPostStyle>) => custom && set({ ...form, custom: form.custom.map((style) => (style.id === custom.id ? { ...style, ...patch } : style)) })
  const addCustom = (base: PostStyleBase) => {
    if (form.custom.length >= MAX_CUSTOM_POST_STYLES) { setMessage({ tone: 'error', text: `حداکثر ${MAX_CUSTOM_POST_STYLES.toLocaleString('fa-IR')} استایل شخصی` }); return }
    const style: CustomPostStyle = { id: newCustomStyleId(), name: `${POST_STYLE_BASES[base].fa} من`, base, accent: '', align: base === 'editorial' ? 'center' : 'start', width: 'wide', leadIn: base === 'editorial', corners: base === 'editorial' || base === 'cinematic' ? 'soft' : 'round' }
    set({ ...form, custom: [...form.custom, style] })
    setEditing(style.id)
  }
  const copyCustom = (source: CustomPostStyle) => {
    if (form.custom.length >= MAX_CUSTOM_POST_STYLES) { setMessage({ tone: 'error', text: `حداکثر ${MAX_CUSTOM_POST_STYLES.toLocaleString('fa-IR')} استایل شخصی` }); return }
    const style = { ...source, id: newCustomStyleId(), name: `${source.name} (کپی)`.slice(0, 60) }
    set({ ...form, custom: [...form.custom, style] })
    setEditing(style.id)
  }
  const fromReady = async (id: string, fa: string) => {
    setMessage(null)
    try { window.location.assign(`/admin/builder/${await createPostTemplate(`${fa} من`, id)}`) } catch (error) { setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'ساخته نشد' }) }
  }
  const removeCustom = (id: string) => {
    if (!confirm('این استایل حذف شود؟ نوشته‌هایی که آن را دارند به استایل پیش‌فرض برمی‌گردند.')) return
    const byFormat = Object.fromEntries(Object.entries(form.byFormat).filter(([, value]) => value !== id))
    set({ ...form, custom: form.custom.filter((style) => style.id !== id), byFormat, defaultId: form.defaultId === id ? '' : form.defaultId })
    setEditing('')
  }
  const nameOf = (id: string) => (id.startsWith('ps-') ? POST_STYLE_BASES[id.slice(3) as PostStyleBase]?.fa : form.custom.find((style) => style.id === id)?.name || layouts.find((layout) => layout.id === id)?.fa) || ''

  async function save() {
    if (!form) return
    setBusy(true)
    const response = await send<{ settingsRevision: string; settings: JournalSettings }>('/api/admin/journal/settings', 'POST', { postStyle: form }, revision ? { 'if-match': revision } : {})
    setBusy(false)
    if (!response.ok) { setMessage({ tone: 'error', text: response.error }); return }
    setForm(response.data.settings.postStyle)
    setBaseline(response.data.settings.postStyle)
    setRevision(response.data.settingsRevision)
    setMessage({ tone: 'ok', text: 'ذخیره شد؛ صفحهٔ نوشته‌ها با این استایل‌ها نمایش داده می‌شود.' })
  }

  const choiceSelect = (value: string, onChange: (id: string) => void, label: string) => (
    <select className="input" aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">پیش‌فرض مجله ({nameOf(currentDefault)})</option>
      <optgroup label="استایل‌های آماده">{POST_STYLE_BASE_KEYS.map((base) => <option key={base} value={builtinStyleId(base)}>{POST_STYLE_BASES[base].fa}</option>)}</optgroup>
      {form.custom.length > 0 && <optgroup label="استایل‌های من">{form.custom.map((style) => <option key={style.id} value={style.id}>{style.name}</option>)}</optgroup>}
      {layouts.length > 0 && <optgroup label="قالب‌های صفحه‌ساز">{layouts.map((layout) => <option key={layout.id} value={layout.id}>{layout.fa}{layout.status === 'draft' ? ' (پیش‌نویس)' : ''}</option>)}</optgroup>}
    </select>
  )
  const thumbFor = (id: string) => {
    if (!id) id = currentDefault
    if (id.startsWith('ps-')) return <PostStyleThumb base={id.slice(3) as PostStyleBase} />
    const mine = form.custom.find((style) => style.id === id)
    if (mine) return <PostStyleThumb base={mine.base} accent={mine.accent} align={mine.align} />
    const layout = layouts.find((entry) => entry.id === id)
    return layout?.base ? <PostStyleThumb base={layout.base as PostStyleBase} sidebar={layout.sidebar} /> : <PostStyleThumb base="" layout />
  }

  return <JournalShell title="استایل صفحهٔ نوشته" actions={<><SectionSettingsHistoryLink section="journal" /><button type="button" className="btn btn-primary" disabled={busy || !dirty} onClick={() => void save()}>{busy ? 'در حال ذخیره…' : 'ذخیره'}</button></>}>
    <div className={css.page}>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      <div className={css.intro}>
        <p><b>هر نوشته با یک استایل نمایش داده می‌شود.</b> پیش‌فرض مجله را از استایل‌های آماده انتخاب کنید، از هر کدام نسخهٔ خودتان را با رنگ، چیدمان و عرض دلخواه بسازید و برای هر نوع نوشته (نقد، خبر، ویدیو…) استایل یا قالب جدا بگذارید. هنگام نوشتن هم می‌توانید برای همان نوشته استایل دیگری انتخاب کنید.</p>
        {data?.previewSlug ? <a className="btn btn-ghost" href={`/blog/${data.previewSlug}`} target="_blank" rel="noreferrer">دیدن آخرین نوشته</a> : null}
      </div>

      <section className={css.block} aria-labelledby="ps-ready">
        <header className={css.blockHead}><h2 id="ps-ready">استایل‌های آماده</h2><small>یکی را پیش‌فرض مجله کنید؛ پیش‌نمایش روی آخرین نوشته باز می‌شود</small></header>
        <ul className={css.gallery} role="list">
          {POST_STYLE_BASE_KEYS.map((base) => {
            const id = builtinStyleId(base), current = currentDefault === id
            return <li key={base} className={css.card} data-current={current}>
              {current && <span className={css.badge}>پیش‌فرض مجله</span>}
              <PostStyleThumb base={base} />
              <span className={css.cardText}><b>{POST_STYLE_BASES[base].fa}</b><small>{POST_STYLE_BASES[base].descFa}</small></span>
              <span className={css.cardActions}>
                {!current && <button type="button" className="btn btn-primary" onClick={() => set({ ...form, defaultId: base === 'classic' ? '' : id })}>پیش‌فرض کن</button>}
                {previewHref(id) && <a className="btn btn-ghost" href={previewHref(id)} target="_blank" rel="noreferrer">پیش‌نمایش<span className="sr-only"> {POST_STYLE_BASES[base].fa}</span></a>}
                <button type="button" className="btn btn-ghost" onClick={() => addCustom(base)}>نسخهٔ من<span className="sr-only"> از {POST_STYLE_BASES[base].fa}</span></button>
              </span>
            </li>
          })}
        </ul>
      </section>

      <section className={css.block} aria-labelledby="ps-mine">
        <header className={css.blockHead}><h2 id="ps-mine">استایل‌های من</h2><small>بر پایهٔ یک استایل آماده، با رنگ و چیدمان خودتان</small></header>
        <ul className={css.gallery} role="list">
          {form.custom.map((style) => {
            const current = currentDefault === style.id
            return <li key={style.id} className={css.card} data-current={current || editing === style.id}>
              {current && <span className={css.badge}>پیش‌فرض مجله</span>}
              <PostStyleThumb base={style.base} accent={style.accent} align={style.align} />
              <span className={css.cardText}><b>{style.name}</b><small>بر پایهٔ «{POST_STYLE_BASES[style.base].fa}»</small></span>
              <span className={css.cardActions}>
                <button type="button" className="btn btn-primary" aria-expanded={editing === style.id} onClick={() => setEditing(editing === style.id ? '' : style.id)}>{editing === style.id ? 'بستن' : 'طراحی'}<span className="sr-only"> {style.name}</span></button>
                {!current && <button type="button" className="btn btn-ghost" onClick={() => set({ ...form, defaultId: style.id })}>پیش‌فرض کن</button>}
                <button type="button" className="btn btn-ghost" onClick={() => copyCustom(style)}>کپی<span className="sr-only"> {style.name}</span></button>
                <button type="button" className="btn btn-ghost" onClick={() => removeCustom(style.id)}>حذف<span className="sr-only"> {style.name}</span></button>
                {saved(style.id) && previewHref(style.id) && <a className="btn btn-ghost" href={previewHref(style.id)} target="_blank" rel="noreferrer">پیش‌نمایش<span className="sr-only"> {style.name}</span></a>}
              </span>
            </li>
          })}
          <li><button type="button" className={css.newCard} onClick={() => addCustom('classic')}><span aria-hidden="true">＋</span><b>استایل تازه</b><small>یا از دکمهٔ «نسخهٔ من» زیر هر استایل آماده</small></button></li>
        </ul>

        {custom && <div className={css.designer}>
          <div className={css.fields}>
            <label className={css.field}><span>نام استایل</span><input className="input" value={custom.name} maxLength={60} onChange={(event) => changeCustom({ name: event.target.value })} /></label>
            <div className={css.field}><span id="ps-colour">رنگ اصلی</span>
              <div className={css.colour} role="group" aria-labelledby="ps-colour">
                <span className={css.swatches}>{SWATCHES.map((hex) => <button key={hex} type="button" aria-label={`رنگ ${hex}`} aria-pressed={custom.accent === hex} style={{ background: hex }} onClick={() => changeCustom({ accent: hex })} />)}</span>
                <input type="color" aria-label="رنگ دلخواه" value={custom.accent || '#2563eb'} onChange={(event) => changeCustom({ accent: event.target.value })} />
                <button type="button" className="btn btn-ghost" aria-pressed={!custom.accent} onClick={() => changeCustom({ accent: '' })}>رنگ سایت</button>
              </div>
              <small>هر رنگی خوانا می‌ماند: برای پوستهٔ روشن و تیره به‌اندازهٔ لازم تیره یا روشن می‌شود.</small>
            </div>
            <fieldset className={css.bases}><legend className="sr-only">طرح پایه</legend>
              {POST_STYLE_BASE_KEYS.map((base) => <label key={base}><input type="radio" name="ps-base" checked={custom.base === base} onChange={() => changeCustom({ base })} /><PostStyleThumb base={base} accent={custom.accent} align={custom.align} />{POST_STYLE_BASES[base].fa}</label>)}
            </fieldset>
            <div className={css.field}><span id="ps-align">چینش تیتر</span><span className={css.segment} role="group" aria-labelledby="ps-align">{ALIGNS.map(([value, label]) => <button key={value} type="button" aria-pressed={custom.align === value} onClick={() => changeCustom({ align: value })}>{label}</button>)}</span></div>
            <div className={css.field}><span id="ps-corners">گوشه‌ها</span><span className={css.segment} role="group" aria-labelledby="ps-corners">{CORNERS.map(([value, label]) => <button key={value} type="button" aria-pressed={custom.corners === value} onClick={() => changeCustom({ corners: value })}>{label}</button>)}</span></div>
            <label className={`${css.field} sa-check`}><span><input type="checkbox" checked={custom.leadIn} onChange={(event) => changeCustom({ leadIn: event.target.checked })} /> پاراگراف آغازین برجسته</span><small>اولین بند متن درشت‌تر و با خط رنگی کنارش.</small></label>
            <div className={css.designerActions}>
              <button type="button" className="btn btn-ghost" onClick={() => setEditing('')}>تمام</button>
              <button type="button" className="btn btn-ghost" onClick={() => removeCustom(custom.id)}>حذف این استایل</button>
            </div>
          </div>
          <div className={css.preview}>
            <PostStyleThumb base={custom.base} accent={custom.accent} align={custom.align} />
            <p>{saved(custom.id) && !dirty ? 'پیش‌نمایش واقعی روی آخرین نوشته:' : 'پس از ذخیره، پیش‌نمایش واقعی روی آخرین نوشته باز می‌شود.'}</p>
            {saved(custom.id) && !dirty && previewHref(custom.id) && <a className="btn btn-ghost" href={previewHref(custom.id)} target="_blank" rel="noreferrer">پیش‌نمایش {custom.name}</a>}
          </div>
        </div>}
      </section>

      {layouts.some((layout) => layout.group === 'builtin') && <section className={css.block} aria-labelledby="ps-templates">
        <header className={css.blockHead}><h2 id="ps-templates">قالب‌های آمادهٔ نوشته</h2><small>چیدمان کامل صفحه با بلوک‌های زنده، هر کدام با یکی از استایل‌ها؛ برای یک نوشته یا یک نوع نوشته انتخابشان کنید</small></header>
        <ul className={css.gallery} role="list">
          {layouts.filter((layout) => layout.group === 'builtin').map((layout) => <li key={layout.id} className={css.card}>
            <span className={css.badgeTpl}>قالب</span>
            <PostStyleThumb base={(layout.base || 'classic') as PostStyleBase} sidebar={layout.sidebar} />
            <span className={css.cardText}><b>{layout.fa}</b>{layout.desc ? <small>{layout.desc}</small> : null}</span>
            <span className={css.cardActions}>
              {previewHref(layout.id) && <a className="btn btn-ghost" href={previewHref(layout.id)} target="_blank" rel="noreferrer">پیش‌نمایش<span className="sr-only"> {layout.fa}</span></a>}
              <button type="button" className="btn btn-ghost" onClick={() => void fromReady(layout.id, layout.fa)}>نسخهٔ من<span className="sr-only"> از {layout.fa}</span></button>
            </span>
          </li>)}
        </ul>
        <p className="sa-hint">«نسخهٔ من» یک کپی قابل‌ویرایش از قالب در «قالب‌های من» می‌سازد و آن را در صفحه‌ساز باز می‌کند.</p>
      </section>}

      <MyPostTemplates drawings={layouts.filter((layout) => layout.group === 'theme')} presets={layouts.filter((layout) => layout.group === 'builtin').map((layout) => ({ id: layout.id, fa: layout.fa }))} onChanged={loadLayouts} />

      <section className={css.block} aria-labelledby="ps-formats">
        <header className={css.blockHead}><h2 id="ps-formats">استایل هر نوع نوشته</h2><small>مثلاً نقدها سینمایی و خبرها دوستونه؛ نوشته‌ای که استایل خودش را دارد همان را نگه می‌دارد</small></header>
        <div className={css.formats}>
          {formats.map((entry) => {
            const value = form.byFormat[entry.code] || ''
            return <div key={entry.code} className={css.formatRow}>
              <b>{entry.icon ? <span aria-hidden="true">{entry.icon}</span> : null}{entry.name}</b>
              {choiceSelect(value, (id) => { const byFormat = { ...form.byFormat }; if (id) byFormat[entry.code] = id; else delete byFormat[entry.code]; set({ ...form, byFormat }) }, `استایل نوشته‌های ${entry.name}`)}
              <span className={css.formatThumb}>{thumbFor(value)}</span>
            </div>
          })}
        </div>
        <p className="sa-hint">نوع‌های نوشته را در <Link href="/admin/journal/formats" className="sa-link">قالب‌ها</Link> مدیریت کنید.</p>
      </section>

      <div className={css.layouts}>
        <p><b>راهنمای کوتاه:</b> «استایل» ظاهر سربرگ و متن نوشته است و «قالب» چیدمان کامل صفحه (ستون کناری، بلوک‌ها، HTML). قالب‌های خودتان را در «قالب‌های من» بسازید؛ در صفحه‌ساز از نوار بالا «استایل نوشته» را برای قالب انتخاب کنید. هر استایل یا قالبی را برای یک نوشته (در فرم نوشته) یا یک نوع نوشته (همین صفحه) بگذارید.</p>
        <a className="btn btn-ghost" href="#ps-my-templates">قالب‌های من</a>
      </div>

      {dirty && <div className={css.saveBar} role="status"><span>تغییرها هنوز ذخیره نشده‌اند.</span><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'در حال ذخیره…' : 'ذخیره'}</button></div>}
    </div>
  </JournalShell>
}
