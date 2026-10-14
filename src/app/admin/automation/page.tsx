'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ActionDef, Condition, Rule, TriggerDef } from '@/modules/automation/domain/automation'

type Saved = Rule & { id: number; runCount: number; lastRunAt: string | null }
type Run = { id: number; ruleId: number; rule: string; subject: string; status: string; detail: string; at: string }
type Recipe = { id: string; name: string; description: string; rule: Omit<Rule, 'id'> }
type Data = { rules: Saved[]; runs: Run[]; triggers: TriggerDef[]; actions: ActionDef[]; ops: { id: string; label: string }[]; recipes: Recipe[] }
type Preview = { kind: string; found: number; sample: { subject: string; facts: Record<string, unknown> }[]; note: string }

const fa = (n: number) => n.toLocaleString('fa-IR')
const when = (iso: string) => new Intl.DateTimeFormat('fa-IR-u-ca-persian', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tehran' }).format(new Date(iso))
const STATUS: Record<string, string> = { DONE: 'انجام شد', PARTIAL: 'نیمه‌کاره', FAILED: 'ناموفق' }
const blank = (trigger: string): Rule => ({ name: '', description: '', enabled: true, trigger, wait: 0, conditions: [], logic: 'all', actions: [], cooldownHours: 0 })

async function call<T>(method: 'GET' | 'POST', body?: unknown, query = ''): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const response = await fetch(`/api/admin/automation${query}`, { method, cache: 'no-store', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined }).catch(() => null)
  const data = await response?.json().catch(() => null)
  if (!response) return { ok: false, error: 'ارتباط با سرور برقرار نشد' }
  return response.ok ? { ok: true, data: data as T } : { ok: false, error: String(data?.error || 'انجام نشد') }
}

/**
 * Automation: rules of the form "when this happens — if these hold — do these". Start from a ready-made rule
 * or build one in three steps; see what a rule would find right now before saving; every run is written down.
 */
export default function AutomationAdmin() {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [draft, setDraft] = useState<Rule | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<{ ruleId: number; runs: Run[] } | null>(null)

  const load = useCallback(async () => {
    const result = await call<Data>('GET')
    if (result.ok) setData(result.data); else setError(result.error)
  }, [])
  useEffect(() => { void load() }, [load])

  const trigger = useMemo(() => data?.triggers.find((item) => item.id === draft?.trigger), [data, draft?.trigger])
  const groups = useMemo(() => [...new Set((data?.triggers || []).map((item) => item.group))], [data])
  if (error) return <div className="sa am" dir="rtl"><div role="alert" className="sa-notice is-error">{error}</div></div>
  if (!data) return <div className="sa am" dir="rtl"><div className="sa-skeleton" aria-busy="true" /></div>

  const triggerLabel = (id: string) => data.triggers.find((item) => item.id === id)?.label || id
  const actionLabel = (id: string) => data.actions.find((item) => item.id === id)?.label || id
  const set = (patch: Partial<Rule>) => { setDraft((current) => (current ? { ...current, ...patch } : current)); setPreview(null) }
  const pickTrigger = (id: string) => { const def = data.triggers.find((item) => item.id === id); set({ trigger: id, wait: def?.wait?.default ?? 0, conditions: [], actions: (draft?.actions || []).filter((action) => { const a = data.actions.find((item) => item.id === action.type); return a && (!a.needs || (def && a.needs.includes(def.subject))) }) }) }
  const allowed = data.actions.filter((action) => trigger && (!action.needs || action.needs.includes(trigger.subject)) && (!action.needsUser || trigger.fields.some((field) => field.key === 'user_name')))
  const today = new Date().toISOString().slice(0, 10)
  const runsToday = data.runs.filter((run) => run.at.slice(0, 10) === today)

  async function save() {
    if (!draft) return
    setBusy(true)
    const result = await call<Saved>('POST', draft)
    setBusy(false)
    if (!result.ok) { setNotice({ tone: 'error', text: result.error }); return }
    setNotice({ tone: 'ok', text: draft.id ? 'قانون به‌روز شد.' : 'قانون ساخته شد و از همین حالا اجرا می‌شود.' }); setDraft(null); setPreview(null); void load()
  }
  async function tryIt() {
    if (!draft) return
    setBusy(true)
    const result = await call<Preview>('POST', { op: 'preview', rule: draft })
    setBusy(false)
    if (result.ok) setPreview(result.data); else setNotice({ tone: 'error', text: result.error })
  }
  async function op(name: 'toggle' | 'delete', id: number) {
    if (name === 'delete' && !window.confirm('این قانون و گزارش اجراهایش حذف شود؟')) return
    const result = await call('POST', { op: name, id })
    setNotice(result.ok ? { tone: 'ok', text: name === 'delete' ? 'قانون حذف شد.' : 'وضعیت قانون عوض شد.' } : { tone: 'error', text: result.error })
    if (result.ok) void load()
  }
  async function openLog(ruleId: number) {
    if (log?.ruleId === ruleId) { setLog(null); return }
    const result = await call<{ runs: Run[] }>('GET', undefined, `?runs=${ruleId}`)
    if (result.ok) setLog({ ruleId, runs: result.data.runs })
  }

  return <div className="sa am" dir="rtl">
    <header className="sa-head"><div><h1>اتوماسیون</h1><p className="sa-hint">قانون‌هایی که خودشان کار می‌کنند: «وقتی این اتفاق افتاد — اگر این شرط‌ها برقرار بود — این کارها را بکن». هر دقیقه بررسی می‌شوند و هر اجرا ثبت می‌شود.</p></div>
      <div className="sa-head-actions"><button type="button" className="btn btn-primary" onClick={() => { setDraft(blank(data.triggers[0].id)); setPreview(null) }}>+ قانون تازه</button></div></header>
    {notice && <div role={notice.tone === 'error' ? 'alert' : 'status'} className={`sa-notice ${notice.tone === 'error' ? 'is-error' : 'is-ok'}`}>{notice.text}</div>}

    <div className="am-tiles">
      <div className="am-tile"><b className="num">{fa(data.rules.filter((rule) => rule.enabled).length)}</b><span>قانون فعال</span></div>
      <div className="am-tile"><b className="num">{fa(runsToday.length)}</b><span>اجرای امروز</span></div>
      <div className={`am-tile${runsToday.some((run) => run.status !== 'DONE') ? ' is-warn' : ''}`}><b className="num">{fa(runsToday.filter((run) => run.status !== 'DONE').length)}</b><span>اجرای ناقص امروز</span></div>
      <div className="am-tile"><b className="num">{fa(data.rules.reduce((sum, rule) => sum + rule.runCount, 0))}</b><span>کل اجراها</span></div>
    </div>

    {draft && <section className="sa-card am-builder" aria-label="سازندهٔ قانون">
      <header className="sa-card-head"><h2>{draft.id ? `ویرایش «${draft.name}»` : 'قانون تازه'}</h2><button type="button" className="btn btn-ghost btn-sm" onClick={() => { setDraft(null); setPreview(null) }}>بستن</button></header>
      <div className="am-name">
        <label className="sa-field"><span>نام قانون</span><input className="input" value={draft.name} maxLength={120} onChange={(e) => set({ name: e.target.value })} placeholder="مثلاً: یادآوری سبد رهاشده" /></label>
        <label className="sa-check"><input type="checkbox" checked={draft.enabled} onChange={(e) => set({ enabled: e.target.checked })} /> فعال</label>
      </div>

      <div className="am-step"><span className="am-step-no">۱</span><div>
        <h3>وقتی…</h3>
        <select className="input" value={draft.trigger} onChange={(e) => pickTrigger(e.target.value)} aria-label="رویداد">{groups.map((group) => <optgroup key={group} label={group}>{data.triggers.filter((item) => item.group === group).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</optgroup>)}</select>
        {trigger && <p className="sa-hint">{trigger.description}</p>}
        {trigger?.wait && <label className="sa-field am-wait"><span>{trigger.wait.label}</span><input className="input" type="number" dir="ltr" min={trigger.wait.min} max={trigger.wait.max} value={draft.wait} onChange={(e) => set({ wait: Number(e.target.value) })} /></label>}
      </div></div>

      <div className="am-step"><span className="am-step-no">۲</span><div>
        <h3>اگر… <small>(اختیاری)</small></h3>
        {draft.conditions.length > 1 && <select className="input am-logic" value={draft.logic} onChange={(e) => set({ logic: e.target.value === 'any' ? 'any' : 'all' })} aria-label="منطق"><option value="all">همهٔ شرط‌ها برقرار باشد</option><option value="any">یکی از شرط‌ها برقرار باشد</option></select>}
        {draft.conditions.map((condition, index) => <div key={index} className="am-cond">
          <select className="input" value={condition.field} aria-label="ویژگی" onChange={(e) => set({ conditions: draft.conditions.map((item, at) => (at === index ? { ...item, field: e.target.value } : item)) })}>{trigger?.fields.map((field) => <option key={field.key} value={field.key}>{field.label}</option>)}</select>
          <select className="input" value={condition.op} aria-label="مقایسه" onChange={(e) => set({ conditions: draft.conditions.map((item, at) => (at === index ? { ...item, op: e.target.value as Condition['op'] } : item)) })}>{data.ops.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
          {(() => { const field = trigger?.fields.find((item) => item.key === condition.field); return field?.options ? <select className="input" value={condition.value} aria-label="مقدار" onChange={(e) => set({ conditions: draft.conditions.map((item, at) => (at === index ? { ...item, value: e.target.value } : item)) })}><option value="">—</option>{field.options.map((option) => <option key={option}>{option}</option>)}</select> : <input className="input" value={condition.value} aria-label="مقدار" dir="auto" onChange={(e) => set({ conditions: draft.conditions.map((item, at) => (at === index ? { ...item, value: e.target.value } : item)) })} /> })()}
          <button type="button" className="btn btn-ghost btn-sm" aria-label="حذف شرط" onClick={() => set({ conditions: draft.conditions.filter((_, at) => at !== index) })}>×</button>
        </div>)}
        {trigger && draft.conditions.length < 8 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ conditions: [...draft.conditions, { field: trigger.fields[0].key, op: 'eq', value: '' }] })}>+ شرط</button>}
        {!draft.conditions.length && <p className="sa-hint">بدون شرط، قانون برای هر بار این رویداد اجرا می‌شود.</p>}
      </div></div>

      <div className="am-step"><span className="am-step-no">۳</span><div>
        <h3>آنگاه…</h3>
        {draft.actions.map((action, index) => { const def = data.actions.find((item) => item.id === action.type); return <div key={index} className="am-action">
          <header><b>{def?.label || action.type}</b><button type="button" className="sa-link is-danger" onClick={() => set({ actions: draft.actions.filter((_, at) => at !== index) })}>حذف</button></header>
          <div className="am-params">{def?.fields.map((field) => <label key={field.key} className={`sa-field${field.key === 'text' ? ' is-wide' : ''}`}><span>{field.label}</span>
            {field.options ? <select className="input" value={action.params[field.key] || field.options[0]} onChange={(e) => set({ actions: draft.actions.map((item, at) => (at === index ? { ...item, params: { ...item.params, [field.key]: e.target.value } } : item)) })}>{field.options.map((option) => <option key={option} value={option}>{OPTION_LABEL[option] || option}</option>)}</select>
              : field.key === 'text' ? <textarea className="input" rows={3} dir="auto" value={action.params[field.key] || ''} onChange={(e) => set({ actions: draft.actions.map((item, at) => (at === index ? { ...item, params: { ...item.params, [field.key]: e.target.value } } : item)) })} />
              : <input className="input" dir={['url', 'href', 'to', 'percent', 'days', 'secret'].includes(field.key) ? 'ltr' : 'auto'} value={action.params[field.key] || ''} onChange={(e) => set({ actions: draft.actions.map((item, at) => (at === index ? { ...item, params: { ...item.params, [field.key]: e.target.value } } : item)) })} />}
          </label>)}</div>
        </div> })}
        {draft.actions.length < 8 && <select className="input am-add" value="" aria-label="افزودن اقدام" onChange={(e) => { if (e.target.value) set({ actions: [...draft.actions, { type: e.target.value, params: {} }] }) }}><option value="">+ افزودن اقدام…</option>{allowed.map((action) => <option key={action.id} value={action.id}>{action.label}</option>)}</select>}
        {trigger && <p className="am-tags">در متن‌ها می‌توانید بنویسید: {[...trigger.fields.map((field) => field.key), 'site'].map((key) => <code key={key} dir="ltr">{`{${key}}`}</code>)}</p>}
      </div></div>

      <div className="am-foot">
        <label className="sa-field am-cool"><span>برای یک مورد، دوباره اجرا شود پس از (ساعت)</span><input className="input" type="number" dir="ltr" min={0} value={draft.cooldownHours} onChange={(e) => set({ cooldownHours: Math.max(0, Number(e.target.value) || 0) })} /><small className="sa-hint">۰ یعنی برای هر رویداد یک بار؛ برای بررسی‌های زمان‌دار، برای هر مورد فقط یک بار.</small></label>
        <div className="sa-row-actions"><button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void tryIt()}>امتحان (بدون اجرا)</button><button type="button" className="btn btn-primary" disabled={busy || !draft.name.trim() || !draft.actions.length} onClick={() => void save()}>{busy ? '…' : 'ذخیرهٔ قانون'}</button></div>
      </div>
      {preview && <div className="am-preview" role="status"><b>{preview.found ? `الان ${fa(preview.found)} مورد با این قانون جور است` : 'الان موردی با این قانون جور نیست'}</b>{preview.note && <small>{preview.note}</small>}
        {preview.sample.length > 0 && <ul>{preview.sample.map((item) => <li key={item.subject}><code dir="ltr">{item.subject}</code> {['user_name', 'form_title', 'product_name', 'plan', 'department'].map((key) => item.facts[key]).filter(Boolean).join(' · ')}</li>)}</ul>}</div>}
    </section>}

    {!draft && <section className="am-section" aria-labelledby="am-recipes"><header><h2 id="am-recipes">قالب‌های آماده</h2><small>یکی را بزنید، اعداد و متن‌ها را به سلیقهٔ خودتان تغییر دهید و ذخیره کنید</small></header>
      <div className="am-recipes">{data.recipes.map((recipe) => <button key={recipe.id} type="button" className="am-recipe" onClick={() => { setDraft({ ...recipe.rule }); setPreview(null); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>
        <span className="am-chip">{triggerLabel(recipe.rule.trigger)}</span><b>{recipe.name}</b><small>{recipe.description}</small>
      </button>)}</div></section>}

    <section className="am-section" aria-labelledby="am-rules"><header><h2 id="am-rules">قانون‌های شما</h2><small>{fa(data.rules.length)} قانون</small></header>
      {!data.rules.length ? <p className="am-empty">هنوز قانونی ندارید. از یکی از قالب‌های آماده شروع کنید یا «قانون تازه» را بزنید.</p>
        : <div className="am-rules">{data.rules.map((rule) => <article key={rule.id} className={`am-rule${rule.enabled ? '' : ' is-off'}`}>
          <div className="am-rule-head"><label className="am-switch" title={rule.enabled ? 'فعال' : 'خاموش'}><input type="checkbox" checked={rule.enabled} onChange={() => void op('toggle', rule.id)} aria-label={`فعال بودن «${rule.name}»`} /><i aria-hidden="true" /></label><div><h3>{rule.name}</h3><small>{rule.runCount ? `${fa(rule.runCount)} اجرا · آخرین: ${rule.lastRunAt ? when(rule.lastRunAt) : '—'}` : 'هنوز اجرا نشده'}</small></div></div>
          <p className="am-flow"><span className="am-chip">وقتی</span>{triggerLabel(rule.trigger)}{rule.conditions.length > 0 && <><span className="am-chip">اگر</span>{fa(rule.conditions.length)} شرط</>}<span className="am-chip">آنگاه</span>{rule.actions.map((action) => actionLabel(action.type)).join('، ')}</p>
          <div className="sa-row-actions"><button type="button" className="btn btn-ghost btn-sm" onClick={() => { setDraft({ ...rule }); setPreview(null); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>ویرایش</button><button type="button" className="btn btn-ghost btn-sm" aria-expanded={log?.ruleId === rule.id} onClick={() => void openLog(rule.id)}>گزارش اجرا</button><button type="button" className="sa-link is-danger" onClick={() => void op('delete', rule.id)}>حذف</button></div>
          {log?.ruleId === rule.id && <RunList runs={log.runs} />}
        </article>)}</div>}
    </section>

    <section className="am-section" aria-labelledby="am-runs"><header><h2 id="am-runs">آخرین اجراها</h2></header>{data.runs.length ? <RunList runs={data.runs} withRule /> : <p className="am-empty">هنوز اجرایی ثبت نشده است.</p>}</section>
  </div>
}

const OPTION_LABEL: Record<string, string> = { managers: 'مدیران', handlers: 'کارشناسان همان فرم', support: 'پشتیبان‌ها', least_loaded: 'کارمند با کمترین کار باز', OPEN: 'در انتظار کارشناس', IN_PROGRESS: 'در حال انجام', DONE: 'انجام شد', REJECTED: 'رد شد' }

function RunList({ runs, withRule = false }: { runs: Run[]; withRule?: boolean }) {
  if (!runs.length) return <p className="am-empty">اجرایی ثبت نشده است.</p>
  return <ul className="am-runs">{runs.map((run) => <li key={run.id} className={`is-${run.status.toLowerCase()}`}>
    <span className="am-run-status">{STATUS[run.status] || run.status}</span>
    <span className="am-run-main">{withRule && <b>{run.rule}</b>}<code dir="ltr">{run.subject}</code><small>{run.detail}</small></span>
    <time>{when(run.at)}</time>
  </li>)}</ul>
}
