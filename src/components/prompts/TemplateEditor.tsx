'use client'
import { useEffect, useRef, useState } from 'react'
import { DEFAULT_INPUT, INPUT_KEYS, KIND_LABEL, PROMPT_KINDS, TONES, FORMATS, assemblePrompt, type PromptKind } from '@/modules/prompts/domain/prompts'
import Icon from '@/components/site/Icon'
import { promptRequest } from './browser'
import type { EditableTemplate } from './admin-model'
import ShowcaseFields from './ShowcaseFields'
import PublicationPanel from './PublicationPanel'
import s from './PromptMaster.module.css'
import ItemAudiencePanel from '@/components/admin/ItemAudiencePanel'
import PaidAccessPanel from '@/components/admin/PaidAccessPanel'
export default function TemplateEditor({ initial, categories, done, cancel, canManage, reviewAuthors }: { initial: EditableTemplate; categories: { code: string; name: string }[]; done: () => void; cancel: () => void; canManage: boolean; reviewAuthors: boolean }) {
  const [form, setForm] = useState(initial), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus({ preventScroll: true }); heading.current?.scrollIntoView({ block: 'start' }) }, [])
  const dirty = JSON.stringify(form) !== JSON.stringify(initial), blocked = initial.status === 'TRASHED' || (!canManage && reviewAuthors && initial.status === 'PUBLISHED')
  useEffect(() => { if (!dirty) return; const warn = (event: BeforeUnloadEvent) => { event.preventDefault() }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn) }, [dirty])
  const close = () => { if (!dirty || window.confirm('تغییرات ذخیره نشده است؛ ویرایشگر بسته شود؟')) cancel() }
  const change = (key: keyof EditableTemplate, value: string | number | boolean) => setForm(old => ({ ...old, [key]: value }))
  let defaults: Record<string, string> = {}; try { defaults = JSON.parse(form.defaults) } catch { /* default empty */ }
  function changeDefault(key: string, value: string) { change('defaults', JSON.stringify({ ...defaults, [key]: value })) }
  async function save(e: React.FormEvent) {
    e.preventDefault(); if (busy || blocked) return; setBusy(true); setError('')
    try { await promptRequest('/api/admin/prompts', { ...form, action: 'save' }); done() }
    catch (e) { setError(e instanceof Error ? e.message : 'ذخیره انجام نشد') } finally { setBusy(false) }
  }
  const preview = assemblePrompt({ ...DEFAULT_INPUT, ...defaults, kind: form.kind as PromptKind, idea: form.example || 'ایدهٔ نمونهٔ شما در اینجا قرار می‌گیرد.' }, { content: form.content })
  return <section className={s.adminEditor} aria-labelledby="prompt-template-editor"><header className={s.editorHeading}><span className={s.editorMark}><Icon name="edit" size={23}/></span><div><h2 id="prompt-template-editor" ref={heading} tabIndex={-1}>{form.id ? 'ویرایش الگوی پرامپت' : 'الگوی جدید'}</h2><p>دستور دقیق، نمونهٔ واقعی و انتشار روشن؛ هر بخش را جدا آماده کن.</p></div><span className={s.editingVersion}>{form.version?'نسخهٔ '+form.version.toLocaleString('fa-IR'):'پیش‌نویس تازه'}</span></header>{blocked&&<p className={s.error}>این الگو در وضعیت فعلی قابل ویرایش نیست؛ از مدیر این بخش بخواهید آن را بررسی کند.</p>}<form onSubmit={save}>
    <fieldset disabled={busy || blocked} className={s.editorLayout}><legend className={s.srOnly}>مشخصات الگو</legend><div className={s.editorMain}><h3 className={s.editorSectionTitle}><Icon name="file" size={18}/>هویت و کاربرد</h3>
      <div className={s.twoFields}><label className={s.field}>عنوان الگو<input value={form.title} onChange={e => change('title', e.target.value)} minLength={3} maxLength={120} required /></label><label className={s.field}>نشانی انگلیسی<input value={form.slug} onChange={e => change('slug', e.target.value)} dir="ltr" readOnly={!!form.id} pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={100} required /><small>{form.id ? 'برای حفظ لینک عمومی، نشانی ثبت‌شده ثابت می‌ماند.' : 'مثلاً creative-product-photo؛ پیش از ثبت قابل ویرایش است.'}</small></label></div>
      <label className={s.field}>توضیح کاربرد<textarea rows={2} value={form.summary} onChange={e => change('summary', e.target.value)} maxLength={500} /></label>
      <div className={s.twoFields}><label className={s.field}>نوع پرامپت<select value={form.kind} onChange={e => change('kind', e.target.value)}>{PROMPT_KINDS.map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select></label><label className={s.field}>دسته<select value={form.category} onChange={e => change('category', e.target.value)}><option value="">بدون دسته</option>{!categories.some(c => c.code === form.category) && form.category && <option value={form.category}>{form.category} (مقدار قبلی)</option>}{categories.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}</select></label></div>
      <h3 className={s.editorSectionTitle}><Icon name="code" size={18}/>دستور و متغیرها</h3><label className={s.field}>متن الگوی پرامپت<textarea rows={9} value={form.content} onChange={e => change('content', e.target.value)} minLength={20} maxLength={12000} dir="auto" required /><small>متن سادهٔ دستور است. متغیر {'{{idea}}'} الزامی است؛ متغیرها هنگام ساخت با ورودی کاربر جایگزین می‌شوند.</small></label>
      <div className={s.placeholderTools} aria-label="افزودن متغیر به الگو">{INPUT_KEYS.map(key => <button type="button" key={key} className={s.secondary} onClick={() => change('content', form.content + ' {{' + key + '}}')}><bdi>{`{{${key}}}`}</bdi></button>)}</div>
      <label className={s.field}>ایدهٔ نمونه<textarea value={form.example} onChange={e => change('example', e.target.value)} maxLength={4000} rows={3} placeholder="این نمونه هنگام استفاده از الگو در استودیو قابل ویرایش است." /></label>
      <ShowcaseFields value={form.showcase || '{}'} kind={form.kind} onChange={value=>change('showcase',value)}/>
      <label className={s.field}>برچسب‌ها<input value={form.tags} onChange={e => change('tags', e.target.value)} maxLength={300} placeholder="طراحی، تبلیغات، عکاسی" /></label>
      <details className={s.advanced}><summary>مقادیر اولیهٔ استودیو</summary><div className={s.advancedBody}><div className={s.twoFields}><label className={s.field}>نقش اولیه<input value={defaults.role || ''} onChange={e => changeDefault('role', e.target.value)} maxLength={300} /></label><label className={s.field}>مخاطب اولیه<input value={defaults.audience || ''} onChange={e => changeDefault('audience', e.target.value)} maxLength={300} /></label><label className={s.field}>لحن اولیه<select value={defaults.tone || DEFAULT_INPUT.tone} onChange={e => changeDefault('tone', e.target.value)}>{TONES.map(t => <option key={t}>{t}</option>)}</select></label><label className={s.field}>قالب اولیه<select value={defaults.format || DEFAULT_INPUT.format} onChange={e => changeDefault('format', e.target.value)}>{FORMATS.map(f => <option key={f}>{f}</option>)}</select></label></div><label className={s.field}>سبک اولیه<input value={defaults.style || ''} onChange={e => changeDefault('style', e.target.value)} maxLength={300} /></label></div></details>
      </div><PublicationPanel form={form} initial={initial} canManage={canManage} reviewAuthors={reviewAuthors} blocked={blocked} change={change}/>
    </fieldset>
    {canManage && <ItemAudiencePanel type="prompt" id={form.id || null} noun="این پرامپت را" />}
    {canManage && <PaidAccessPanel ownerType="prompt" ownerId={form.id || null} noun="پرامپت" />}
    <details className={s.advanced}><summary>پیش‌نمایش خروجی ساختاریافته</summary><pre className={s.previewText} dir="auto">{preview}</pre></details>
    {error && <div className={s.error} role="alert">{error}</div>}<div className={s.historyButtons}><button className={s.primary} disabled={busy || blocked} type="submit"><Icon name="check" size={17} />{busy ? 'در حال ذخیره…' : form.status==='PENDING'&&!canManage?'ذخیره و ارسال برای بازبینی':form.status==='PUBLISHED'?'ذخیره و انتشار':'ذخیرهٔ الگو'}</button><button type="button" className={s.secondary} onClick={close} disabled={busy}>بستن ویرایشگر</button></div>
  </form></section>
}
