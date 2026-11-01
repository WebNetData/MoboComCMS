'use client'
import { useState } from 'react'
import { DEFAULT_INPUT, INPUT_KEYS, KIND_LABEL, PROMPT_KINDS, TONES, FORMATS, assemblePrompt, type PromptKind } from '@/modules/prompts/domain/prompts'
import Icon from '@/components/site/Icon'
import { promptRequest } from './browser'
import type { EditableTemplate } from './admin-model'
import s from './PromptMaster.module.css'
export default function TemplateEditor({ initial, categories, done, cancel }: { initial: EditableTemplate; categories: { code: string; name: string }[]; done: () => void; cancel: () => void }) {
  const [form, setForm] = useState(initial), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const change = (key: keyof EditableTemplate, value: string | number | boolean) => setForm(old => ({ ...old, [key]: value }))
  let defaults: Record<string, string> = {}; try { defaults = JSON.parse(form.defaults) } catch { /* default empty */ }
  function changeDefault(key: string, value: string) { change('defaults', JSON.stringify({ ...defaults, [key]: value })) }
  async function save(e: React.FormEvent) {
    e.preventDefault(); if (busy) return; setBusy(true); setError('')
    try { await promptRequest('/api/admin/prompts', { ...form, action: 'save' }); done() }
    catch (e) { setError(e instanceof Error ? e.message : 'ذخیره انجام نشد') } finally { setBusy(false) }
  }
  const preview = assemblePrompt({ ...DEFAULT_INPUT, ...defaults, kind: form.kind as PromptKind, idea: form.example || 'ایدهٔ نمونهٔ شما در اینجا قرار می‌گیرد.' }, { content: form.content })
  return <section className={s.adminEditor} aria-labelledby="prompt-template-editor"><h2 id="prompt-template-editor">{form.id ? 'ویرایش الگوی پرامپت' : 'الگوی جدید'}</h2><form onSubmit={save}>
    <fieldset disabled={busy} className={s.editorFields}><legend className={s.srOnly}>مشخصات الگو</legend>
      <div className={s.twoFields}><label className={s.field}>عنوان الگو<input value={form.title} onChange={e => change('title', e.target.value)} minLength={3} maxLength={120} required /></label><label className={s.field}>نشانی انگلیسی<input value={form.slug} onChange={e => change('slug', e.target.value)} dir="ltr" readOnly={!!form.id} pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={100} required /><small>{form.id ? 'برای حفظ لینک عمومی، نشانی ثبت‌شده ثابت می‌ماند.' : 'مثلاً creative-product-photo؛ پیش از ثبت قابل ویرایش است.'}</small></label></div>
      <label className={s.field}>توضیح کاربرد<textarea rows={2} value={form.summary} onChange={e => change('summary', e.target.value)} maxLength={500} /></label>
      <div className={s.twoFields}><label className={s.field}>نوع پرامپت<select value={form.kind} onChange={e => change('kind', e.target.value)}>{PROMPT_KINDS.map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select></label><label className={s.field}>دسته<select value={form.category} onChange={e => change('category', e.target.value)}><option value="">بدون دسته</option>{!categories.some(c => c.code === form.category) && form.category && <option value={form.category}>{form.category} (مقدار قبلی)</option>}{categories.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}</select></label></div>
      <label className={s.field}>متن الگوی پرامپت<textarea rows={9} value={form.content} onChange={e => change('content', e.target.value)} minLength={20} maxLength={12000} dir="auto" required /><small>متن سادهٔ دستور است. متغیر {'{{idea}}'} الزامی است؛ متغیرها هنگام ساخت با ورودی کاربر جایگزین می‌شوند.</small></label>
      <div className={s.placeholderTools} aria-label="افزودن متغیر به الگو">{INPUT_KEYS.map(key => <button type="button" key={key} className={s.secondary} onClick={() => change('content', form.content + ' {{' + key + '}}')}><bdi>{`{{${key}}}`}</bdi></button>)}</div>
      <label className={s.field}>ایدهٔ نمونه<textarea value={form.example} onChange={e => change('example', e.target.value)} maxLength={4000} rows={3} placeholder="این نمونه هنگام استفاده از الگو در استودیو قابل ویرایش است." /></label>
      <label className={s.field}>برچسب‌ها<input value={form.tags} onChange={e => change('tags', e.target.value)} maxLength={300} placeholder="طراحی، تبلیغات، عکاسی" /></label>
      <details className={s.advanced}><summary>مقادیر اولیهٔ استودیو</summary><div className={s.advancedBody}><div className={s.twoFields}><label className={s.field}>نقش اولیه<input value={defaults.role || ''} onChange={e => changeDefault('role', e.target.value)} maxLength={300} /></label><label className={s.field}>مخاطب اولیه<input value={defaults.audience || ''} onChange={e => changeDefault('audience', e.target.value)} maxLength={300} /></label><label className={s.field}>لحن اولیه<select value={defaults.tone || DEFAULT_INPUT.tone} onChange={e => changeDefault('tone', e.target.value)}>{TONES.map(t => <option key={t}>{t}</option>)}</select></label><label className={s.field}>قالب اولیه<select value={defaults.format || DEFAULT_INPUT.format} onChange={e => changeDefault('format', e.target.value)}>{FORMATS.map(f => <option key={f}>{f}</option>)}</select></label></div><label className={s.field}>سبک اولیه<input value={defaults.style || ''} onChange={e => changeDefault('style', e.target.value)} maxLength={300} /></label></div></details>
      <div className={s.twoFields}><label className={s.field}>وضعیت انتشار<select value={form.status} onChange={e => change('status', e.target.value)}><option value="DRAFT">پیش‌نویس</option><option value="PUBLISHED">منتشرشده</option></select></label><label className={s.field}>ترتیب نمایش<input type="number" value={form.sortOrder} min={-10000} max={10000} onChange={e => change('sortOrder', e.target.value)} required /></label></div><label className={s.check}><input type="checkbox" checked={form.featured} onChange={e => change('featured', e.target.checked)} />الگوی منتخب باشد</label>
    </fieldset>
    <details className={s.advanced}><summary>پیش‌نمایش خروجی ساختاریافته</summary><pre className={s.previewText} dir="auto">{preview}</pre></details>
    {error && <div className={s.error} role="alert">{error}</div>}<div className={s.historyButtons}><button className={s.primary} disabled={busy} type="submit"><Icon name="check" size={17} />{busy ? 'در حال ذخیره…' : 'ذخیرهٔ الگو'}</button><button type="button" className={s.secondary} onClick={cancel} disabled={busy}>بستن ویرایشگر</button></div>
  </form></section>
}
