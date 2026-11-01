'use client'
import { useEffect, useRef, useState } from 'react'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import { DEFAULT_INPUT, KIND_ICON, KIND_LABEL, PROMPT_KINDS, type PromptInput, type PromptKind, type TemplateView, restoreInput } from '@/modules/prompts/domain/prompts'
import PromptFields from './PromptFields'
import PromptOutput, { type PromptResult } from './PromptOutput'
import { promptRequest } from './browser'
import s from './PromptMaster.module.css'

type Props = { policy: { allowGuests: boolean; aiAvailable: boolean; aiDailyLimit: number }; loggedIn: boolean; initialKind: PromptKind; template: TemplateView | null; examples: { title: string; example: string; kind: string }[]; generationId: string }
function initialInput(kind: PromptKind, template: TemplateView | null): PromptInput {
  let defaults = {}
  try { defaults = template ? JSON.parse(template.defaults) : {} } catch { /* empty defaults */ }
  return { ...DEFAULT_INPUT, ...defaults, kind, templateSlug: template?.slug || '', idea: template?.example || '' }
}
export default function PromptStudio({ policy, loggedIn, initialKind, template, examples, generationId }: Props) {
  const [input, setInput] = useState(() => initialInput(initialKind, template)), [result, setResult] = useState<PromptResult | null>(null), [output, setOutput] = useState('')
  const [engine, setEngine] = useState<'structured' | 'ai'>('structured'), [consent, setConsent] = useState(false), [saveHistory, setSaveHistory] = useState(true)
  const [busy, setBusy] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const active = useRef<AbortController | null>(null)
  useEffect(() => () => active.current?.abort(), [])
  useEffect(() => {
    if (!generationId || !loggedIn) return
    const controller = new AbortController()
    promptRequest<{ item: { input: string; output: string; engine: string; model: string; id: number; version: number } }>('/api/prompts/history?id=' + encodeURIComponent(generationId), undefined, controller.signal).then(({ item }) => {
      const restored = restoreInput(item.input)
      if (restored) { setInput(restored); setOutput(item.output); setResult({ ...item, input: restored, item }); setNotice('خروجی از تاریخچهٔ خصوصی باز شد') }
    }).catch(error => { if (!controller.signal.aborted) setError(error.message) })
    return () => controller.abort()
  }, [generationId, loggedIn])
  function change(key: keyof PromptInput, value: string) { setInput(old => ({ ...old, [key]: value })); setError('') }
  function kind(value: PromptKind) { setInput(old => ({ ...old, kind: value, target: 'عمومی', templateSlug: template?.kind === value ? template.slug : '' })); setError('') }
  async function generate(event: React.FormEvent) {
    event.preventDefault(); if (busy) return
    const controller = new AbortController(); active.current = controller; setBusy(true); setError(''); setNotice('')
    try { const data = await promptRequest<PromptResult>('/api/prompts/generate', { ...input, engine, consent, saveHistory }, controller.signal); setOutput(data.output); setResult(data); setNotice('پرامپت آماده است؛ می‌توانید آن را ویرایش کنید') }
    catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'ساخت پرامپت انجام نشد') }
    finally { setBusy(false) }
  }
  async function saveEdit() {
    if (!result?.item || saving) return
    setSaving(true); setError(''); setNotice('')
    try { const data = await promptRequest<{ item: { id: number; version: number } }>('/api/prompts/history', { action: 'edit', id: result.item.id, version: result.item.version, output }); setResult({ ...result, output, engine: 'EDITED', item: data.item }); setNotice('ویرایش در تاریخچهٔ خصوصی ذخیره شد') }
    catch (error) { setError(error instanceof Error ? error.message : 'ذخیره انجام نشد') } finally { setSaving(false) }
  }
  const canGenerate = loggedIn || policy.allowGuests
  return <>
    <div className={s.workspaceHead}><div><span><Icon name="sliders" size={17}/></span><h2>میزکار ساخت پرامپت</h2></div><span>ایده را بنویس، جزئیات را تنظیم کن، خروجی را بردار.</span></div>
    <div className={s.workspace} id="prompt-studio">
      <section className={s.panel} aria-labelledby="prompt-input-title">
        <div className={s.panelHead}><div><span className={s.panelIcon}><Icon name="sparkles" size={18} /></span><h2 id="prompt-input-title">چه چیزی می‌خواهی بسازی؟</h2></div><span className={s.subtle}>ایدهٔ شما، نقطهٔ شروع</span></div>
        <form onSubmit={generate} className={s.inputForm}>
          <fieldset className={s.kinds} disabled={busy}><legend className={s.srOnly}>نوع پرامپت</legend>{PROMPT_KINDS.map(value => <label key={value} className={input.kind === value ? s.kindSelected : ''}><input type="radio" name="prompt-kind" value={value} checked={input.kind === value} onChange={() => kind(value)} /><Icon name={KIND_ICON[value]} size={20} /><span>{KIND_LABEL[value]}</span></label>)}</fieldset>
          {input.templateSlug && <div className={s.templateNotice}><Icon name="layers" size={16} /><span>الگوی انتخابی: <b>{template?.slug === input.templateSlug ? template.title : 'الگوی قبلی'}</b></span><button type="button" className={s.textButton} onClick={() => change('templateSlug', '')} disabled={busy}>برداشتن الگو</button></div>}
          <label className={s.ideaField} htmlFor="prompt-idea"><span>ایده یا درخواستت را بنویس <small>حداقل ۵ نویسه</small></span><textarea id="prompt-idea" value={input.idea} onChange={e => change('idea', e.target.value)} maxLength={4000} minLength={5} rows={5} required disabled={busy} placeholder="مثلاً: یک کمپین خلاقانه برای معرفی برند قهوه طراحی کن؛ مخاطب من کسانی هستند که به تجربهٔ نوشیدن قهوه اهمیت می‌دهند…" aria-describedby="prompt-privacy" /></label><div className={s.ideaCounter}><span>هدف، مخاطب و جزئیات؛ هرچه روشن‌تر، بهتر.</span><bdi dir="ltr">{input.idea.length.toLocaleString('fa-IR')} / ۴٬۰۰۰</bdi></div>
          <div className={s.examples}><span>برای شروع:</span>{examples.filter(e => e.kind === input.kind).slice(0,3).map(e => <button key={e.title} type="button" onClick={() => change('idea', e.example)} disabled={busy}>{e.title}<Icon name="plus" size={13} /></button>)}</div>
          <PromptFields input={input} change={change} disabled={busy} />
          {policy.aiAvailable && <div className={s.engineChoice}><label><input type="checkbox" checked={engine === 'ai'} onChange={e => { setEngine(e.target.checked ? 'ai' : 'structured'); setConsent(false) }} disabled={busy || !loggedIn} /><span><b>بهبود با هوش مصنوعی</b><small>{loggedIn ? `تا ${policy.aiDailyLimit.toLocaleString('fa-IR')} بار در روز؛ پس از تأیید ارسال ورودی` : 'برای بهبود هوشمند وارد حساب شوید'}</small></span><Icon name="bolt" size={18} /></label>{engine === 'ai' && <label className={s.check}><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} disabled={busy} required />با ارسال این ورودی به سرویس هوش مصنوعی سایت موافقم.</label>}</div>}
          {loggedIn && <label className={s.check}><input type="checkbox" checked={saveHistory} onChange={e => setSaveHistory(e.target.checked)} disabled={busy} />ذخیره در تاریخچهٔ خصوصی من</label>}
          <p className={s.privacy} id="prompt-privacy"><Icon name="shield" size={14} />{engine === 'ai' ? 'رمز، کلید API و اطلاعات محرمانه را در ورودی ننویسید.' : 'در حالت ساختاریافته، ورودی شما به سرویس هوش مصنوعی ارسال نمی‌شود.'}</p>
          {error && <div className={s.error} role="alert"><Icon name="shield" size={18}/>{error}</div>}
          {canGenerate ? <button type="submit" className={`${s.primary} ${s.generate}`} disabled={busy || (engine === 'ai' && !consent)}><Icon name={busy ? 'clock' : 'sparkles'} size={20} />{busy ? 'در حال آماده‌کردن پرامپت…' : engine === 'ai' ? 'ساخت و بهبود هوشمند' : 'ساخت پرامپت'}<Icon name="arrow" size={18} /></button> : <Link className={`${s.primary} ${s.generate}`} href="/login?next=/prompts">ورود برای ساخت پرامپت</Link>}
          <div className={s.formFoot}><span>{engine === 'ai' ? 'بازبینی خلاق با سرویس هوشمند' : 'ساختار روشن، بدون نیاز به کلید API'}</span><Link href="/prompts/history">تاریخچهٔ من<Icon name="arrow" size={13} /></Link></div>
        </form>
      </section>
      <PromptOutput result={result} input={input} output={output} setOutput={setOutput} busy={busy} onSave={saveEdit} saving={saving} />
    </div>
    <p className={s.feedback} role="status">{notice}</p>
  </>
}
