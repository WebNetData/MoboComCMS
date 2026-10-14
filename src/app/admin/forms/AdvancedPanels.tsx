'use client'

import { useEffect, useState } from 'react'
import {
  CHOICE_TYPES, CONTENT_TYPES, DEFAULT_SLOT, OPS, OP_LABEL, WEBHOOK_EVENTS, WIDTHS, WIDTH_LABEL,
  type Condition, type FieldWidth, type FormConfirmation, type FormDefinition, type FormField, type FormNotification, type FormSettings, type FormWebhook, type SlotRule,
} from '@/modules/forms/domain/forms'
import { MERGE_TAGS, staffEditable, type FieldStat } from '@/modules/forms/domain/advanced'
import type { Row } from './shared'

const fa = (n: number) => n.toLocaleString('fa-IR')
const DAYS: [number, string][] = [[6, 'شنبه'], [0, 'یکشنبه'], [1, 'دوشنبه'], [2, 'سه‌شنبه'], [3, 'چهارشنبه'], [4, 'پنجشنبه'], [5, 'جمعه']]
const EVENT_LABEL: Record<(typeof WEBHOOK_EVENTS)[number], string> = { submitted: 'ارسال فرم', paid: 'پرداخت', stage: 'تغییر وضعیت کار' }

/** The width of a field on the form's twelve-column grid. */
export function WidthSelect({ value, onChange }: { value: FieldWidth | undefined; onChange: (width: FieldWidth | undefined) => void }) {
  return <label className="sa-field"><span>عرض</span><select className="input" value={value || 'full'} onChange={(e) => onChange(e.target.value === 'full' ? undefined : e.target.value as FieldWidth)}>{WIDTHS.map((width) => <option key={width} value={width}>{WIDTH_LABEL[width]}</option>)}</select></label>
}

/** Inspector: an appointment's hours and capacity, the columns of repeating rows, and quiz points of options. */
export function AdvancedFieldProps({ field, patch, quiz }: { field: FormField; patch: (value: Partial<FormField>) => void; quiz: boolean }) {
  const rule: SlotRule = { ...DEFAULT_SLOT, ...(field.slot || {}) }
  const slot = (value: Partial<SlotRule>) => patch({ slot: { ...rule, ...value } })
  const options = field.options.map((option) => option.trim()).filter(Boolean)
  return <>
    {field.type === 'slot' && <fieldset className="fb-logic"><legend>زمان‌بندی نوبت</legend>
      <div className="fp-checks" role="group" aria-label="روزهای باز">{DAYS.map(([day, name]) => <label key={day} className="sa-check"><input type="checkbox" checked={rule.days.includes(day)} onChange={(e) => slot({ days: e.target.checked ? [...rule.days, day] : rule.days.filter((item) => item !== day) })} />{name}</label>)}</div>
      <div className="fb-two">
        <label className="sa-field"><span>از ساعت</span><input className="input" type="time" value={rule.from} onChange={(e) => slot({ from: e.target.value })} /></label>
        <label className="sa-field"><span>تا ساعت</span><input className="input" type="time" value={rule.to} onChange={(e) => slot({ to: e.target.value })} /></label>
        <label className="sa-field"><span>طول هر نوبت (دقیقه)</span><input className="input" type="number" min={5} max={480} value={rule.minutes} onChange={(e) => slot({ minutes: Number(e.target.value) })} /></label>
        <label className="sa-field"><span>ظرفیت هر نوبت (نفر)</span><input className="input" type="number" min={1} max={500} value={rule.capacity} onChange={(e) => slot({ capacity: Number(e.target.value) })} /></label>
        <label className="sa-field"><span>تا چند روز آینده</span><input className="input" type="number" min={1} max={365} value={rule.horizon} onChange={(e) => slot({ horizon: Number(e.target.value) })} /></label>
      </div>
      <p className="sa-hint">هر نوبت با ارسال فرم رزرو می‌شود و بیش از ظرفیت پر نمی‌شود؛ با رد شدن یا حذف پاسخ، جای آن آزاد می‌شود. ساعت‌ها به وقت تهران است.</p>
    </fieldset>}
    {field.type === 'repeater' && <>
      <label className="sa-field"><span>ستون‌های هر ردیف (هر خط یکی، حداکثر ۶)</span><textarea className="input" rows={4} value={(field.columns || []).join('\n')} onChange={(e) => patch({ columns: e.target.value.split('\n') })} /></label>
      <div className="fb-two">
        <label className="sa-field"><span>حداقل ردیف</span><input className="input" type="number" min={0} max={30} value={field.min ?? 0} onChange={(e) => patch({ min: Number(e.target.value) })} /></label>
        <label className="sa-field"><span>حداکثر ردیف</span><input className="input" type="number" min={1} max={30} value={field.max ?? 10} onChange={(e) => patch({ max: Number(e.target.value) })} /></label>
      </div>
    </>}
    {field.type === 'signature' && <p className="sa-hint">بازدیدکننده با ماوس یا انگشت امضا می‌کند؛ تصویر امضا مثل ضمیمه فقط برای مدیران قابل دیدن است.</p>}
    {field.type === 'jdate' && <p className="sa-hint">تقویم شمسی نشان داده می‌شود؛ در خروجی‌ها تاریخ میلادی همان روز ذخیره می‌شود.</p>}
    {quiz && CHOICE_TYPES.includes(field.type) && <fieldset className="fb-logic"><legend>امتیاز گزینه‌ها (آزمون)</legend>
      {options.map((option, index) => <label key={`${index}-${option}`} className="fp-price"><span>{option}</span><input className="input" dir="ltr" inputMode="numeric" value={field.scores?.[index] || ''} placeholder="0" onChange={(e) => { const scores = options.map((_, at) => (at === index ? Math.trunc(Number(e.target.value)) || 0 : field.scores?.[at] || 0)); patch({ scores: scores.some((score) => score !== 0) ? scores : undefined }) }} /></label>)}
      <p className="sa-hint">امتیازها به بازدیدکننده فرستاده نمی‌شود؛ فقط جمع امتیاز پس از ارسال نشان داده می‌شود.</p>
    </fieldset>}
  </>
}

function Conditions({ fields, when, logic, onChange }: { fields: FormField[]; when: Condition[]; logic: 'all' | 'any'; onChange: (when: Condition[], logic: 'all' | 'any') => void }) {
  const answerable = fields.filter((field) => !CONTENT_TYPES.includes(field.type))
  if (!answerable.length) return null
  return <div className="fa-when">
    <span>{when.length ? 'فقط وقتی' : 'همیشه'}</span>
    {when.length > 1 && <select className="input" aria-label="منطق" value={logic} onChange={(e) => onChange(when, e.target.value === 'any' ? 'any' : 'all')}><option value="all">همهٔ شرط‌ها</option><option value="any">یکی از شرط‌ها</option></select>}
    {when.map((condition, index) => <div key={index} className="fb-cond">
      <select className="input" aria-label="فیلد" value={condition.field} onChange={(e) => onChange(when.map((item, i) => (i === index ? { ...item, field: e.target.value } : item)), logic)}>{answerable.map((field) => <option key={field.id} value={field.id}>{field.label}</option>)}</select>
      <select className="input" aria-label="شرط" value={condition.op} onChange={(e) => onChange(when.map((item, i) => (i === index ? { ...item, op: e.target.value as Condition['op'] } : item)), logic)}>{OPS.map((op) => <option key={op} value={op}>{OP_LABEL[op]}</option>)}</select>
      {condition.op !== 'filled' && condition.op !== 'empty' && <input className="input" aria-label="مقدار" value={condition.value || ''} onChange={(e) => onChange(when.map((item, i) => (i === index ? { ...item, value: e.target.value } : item)), logic)} />}
      <button type="button" className="btn btn-ghost btn-sm" aria-label="حذف شرط" onClick={() => onChange(when.filter((_, i) => i !== index), logic)}>×</button>
    </div>)}
    {when.length < 5 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange([...when, { field: answerable[0].id, op: 'filled' }], logic)}>+ شرط</button>}
  </div>
}

/** Settings: the layout, drafts, a quiz, messages that depend on the answers, webhooks, and who may work on the form. */
export function AdvancedSettings({ form, s, set }: { form: FormDefinition; s: FormSettings; set: (patch: Partial<FormSettings>) => void }) {
  const [staff, setStaff] = useState<{ id: number; name: string; role: string; manager: boolean }[] | null>(null)
  useEffect(() => { void fetch('/api/admin/forms?staff=1', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((body) => setStaff(body?.staff || [])).catch(() => setStaff([])) }, [])
  // Somebody named on the form who can no longer open form answers (their role changed, or the account was closed).
  const gone = staff ? s.handlers.filter((id) => !staff.some((member) => member.id === id)) : []
  const edit = <T,>(list: T[], index: number, value: Partial<T>) => list.map((item, i) => (i === index ? { ...item, ...value } : item))
  const note = (value: Partial<FormNotification>, index: number) => set({ notifications: edit(s.notifications, index, value) })
  const confirm = (value: Partial<FormConfirmation>, index: number) => set({ confirmations: edit(s.confirmations, index, value) })
  const hook = (value: Partial<FormWebhook>, index: number) => set({ webhooks: edit(s.webhooks, index, value) })
  return <>
    <section className="sa-card">
      <header className="sa-card-head"><h2>چیدمان و تجربه</h2></header>
      <div className="fa-layouts" role="radiogroup" aria-label="چیدمان">
        <button type="button" role="radio" aria-checked={s.style.layout !== 'conversational'} className="fa-layout" onClick={() => set({ style: { ...s.style, layout: 'classic' } })}><i className="is-classic" aria-hidden="true"><b /><b /><b /><em /></i><span><b>کلاسیک</b><small>همهٔ فیلدهای هر مرحله کنار هم، با ستون‌بندی</small></span></button>
        <button type="button" role="radio" aria-checked={s.style.layout === 'conversational'} className="fa-layout" onClick={() => set({ style: { ...s.style, layout: 'conversational' } })}><i className="is-conv" aria-hidden="true"><b /><em /></i><span><b>گفت‌وگویی</b><small>هر بار یک پرسش، با Enter جلو می‌رود</small></span></button>
      </div>
      <label className="sa-check"><input type="checkbox" checked={s.saveDraft} onChange={(e) => set({ saveDraft: e.target.checked })} /> ذخیرهٔ پیش‌نویس در مرورگر بازدیدکننده <small className="sa-hint">اگر صفحه را ببندد، بعداً از همان‌جا ادامه می‌دهد (رمز، فایل، امضا و نوبت ذخیره نمی‌شود).</small></label>
    </section>

    <section className="sa-card">
      <header className="sa-card-head"><h2>آزمون و امتیاز</h2>{s.quiz.enabled && <span className="sa-tag is-deal">فعال</span>}</header>
      <label className="sa-check"><input type="checkbox" checked={s.quiz.enabled} onChange={(e) => set({ quiz: { ...s.quiz, enabled: e.target.checked } })} /> این فرم امتیاز دارد <small className="sa-hint">امتیاز هر گزینه را در «ساخت فرم» روی فیلدهای انتخابی بدهید.</small></label>
      {s.quiz.enabled && <div className="ad-fields">
        <label className="sa-field"><span>حد قبولی (۰ = بدون قبول/رد)</span><input className="input" type="number" min={0} value={s.quiz.passScore} onChange={(e) => set({ quiz: { ...s.quiz, passScore: Number(e.target.value) || 0 } })} /></label>
        <label className="sa-check"><input type="checkbox" checked={s.quiz.showResult} onChange={(e) => set({ quiz: { ...s.quiz, showResult: e.target.checked } })} /> امتیاز بعد از ارسال به بازدیدکننده نشان داده شود</label>
      </div>}
    </section>

    <section className="sa-card">
      <header className="sa-card-head"><h2>پیام تأیید شرطی</h2><button type="button" className="btn btn-ghost btn-sm" disabled={s.confirmations.length >= 6} onClick={() => set({ confirmations: [...s.confirmations, { message: '', redirectUrl: '', when: [], logic: 'all' }] })}>+ پیام</button></header>
      <p className="sa-hint">اولین پیامی که شرطش برقرار باشد نشان داده می‌شود؛ اگر هیچ‌کدام نبود، «پیام موفقیت» فرم. در متن می‌توانید برچسب بگذارید.</p>
      {s.confirmations.map((item, index) => <div key={index} className="fa-item">
        <label className="sa-field"><span>متن پیام</span><textarea className="input" rows={2} maxLength={1000} value={item.message} onChange={(e) => confirm({ message: e.target.value }, index)} /></label>
        <label className="sa-field"><span>انتقال به نشانی (اختیاری)</span><input className="input" dir="ltr" value={item.redirectUrl} onChange={(e) => confirm({ redirectUrl: e.target.value }, index)} /></label>
        <Conditions fields={form.fields} when={item.when} logic={item.logic} onChange={(when, logic) => confirm({ when, logic }, index)} />
        <button type="button" className="sa-link is-danger" onClick={() => set({ confirmations: s.confirmations.filter((_, i) => i !== index) })}>حذف این پیام</button>
      </div>)}
    </section>

    <section className="sa-card">
      <header className="sa-card-head"><h2>اعلان‌های ایمیلی شرطی</h2><button type="button" className="btn btn-ghost btn-sm" disabled={s.notifications.length >= 6} onClick={() => set({ notifications: [...s.notifications, { name: `اعلان ${fa(s.notifications.length + 1)}`, to: '', subject: 'پاسخ تازه در «{form_title}»', body: '{all_fields}', when: [], logic: 'all' }] })}>+ اعلان</button></header>
      <p className="sa-hint">برای مسیر دادن پاسخ به بخش درست (مثلاً اگر «موضوع = فروش» به ایمیل فروش) یا ایمیل اختصاصی به فرستنده. برای فرم پرداختی، پس از پرداخت فرستاده می‌شود.</p>
      {s.notifications.map((item, index) => <div key={index} className="fa-item">
        <div className="ad-fields">
          <label className="sa-field"><span>نام</span><input className="input" value={item.name} maxLength={60} onChange={(e) => note({ name: e.target.value }, index)} /></label>
          <label className="sa-field"><span>گیرنده‌ها</span><input className="input" dir="ltr" value={item.to} placeholder="sales@example.com, {field:email}" onChange={(e) => note({ to: e.target.value }, index)} /></label>
        </div>
        <label className="sa-field"><span>موضوع</span><input className="input" value={item.subject} maxLength={200} onChange={(e) => note({ subject: e.target.value }, index)} /></label>
        <label className="sa-field"><span>متن</span><textarea className="input" rows={4} maxLength={4000} value={item.body} onChange={(e) => note({ body: e.target.value }, index)} /></label>
        <Conditions fields={form.fields} when={item.when} logic={item.logic} onChange={(when, logic) => note({ when, logic }, index)} />
        <button type="button" className="sa-link is-danger" onClick={() => set({ notifications: s.notifications.filter((_, i) => i !== index) })}>حذف این اعلان</button>
      </div>)}
      <details className="fa-tags"><summary>برچسب‌های قابل استفاده در متن‌ها</summary><dl>{MERGE_TAGS.map(([tag, meaning]) => <div key={tag}><dt dir="ltr">{tag}</dt><dd>{meaning}</dd></div>)}{form.fields.filter((field) => !CONTENT_TYPES.includes(field.type)).map((field) => <div key={field.id}><dt dir="ltr">{`{field:${field.id}}`}</dt><dd>{field.label}</dd></div>)}</dl></details>
    </section>

    <section className="sa-card">
      <header className="sa-card-head"><h2>وب‌هوک</h2><button type="button" className="btn btn-ghost btn-sm" disabled={s.webhooks.length >= 3} onClick={() => set({ webhooks: [...s.webhooks, { url: '', secret: '', events: ['submitted'] }] })}>+ وب‌هوک</button></header>
      <p className="sa-hint">با هر رویداد، پاسخ‌ها به‌صورت JSON به نشانی شما (فقط https و نشانی عمومی) فرستاده می‌شود. اگر «کلید امضا» بدهید، سربرگ <code dir="ltr">x-mobocom-signature</code> با HMAC-SHA256 می‌آید. رمزها هرگز فرستاده نمی‌شوند.</p>
      {s.webhooks.map((item, index) => <div key={index} className="fa-item">
        <label className="sa-field"><span>نشانی</span><input className="input" dir="ltr" value={item.url} placeholder="https://example.com/hooks/form" onChange={(e) => hook({ url: e.target.value }, index)} /></label>
        <label className="sa-field"><span>کلید امضا (اختیاری)</span><input className="input" dir="ltr" value={item.secret} maxLength={120} autoComplete="off" onChange={(e) => hook({ secret: e.target.value }, index)} /></label>
        <div className="fp-checks" role="group" aria-label="رویدادها"><span>رویدادها</span>{WEBHOOK_EVENTS.map((event) => <label key={event} className="sa-check"><input type="checkbox" checked={item.events.includes(event)} onChange={(e) => { const next = e.target.checked ? [...item.events, event] : item.events.filter((name) => name !== event); hook({ events: next.length ? next : ['submitted'] }, index) }} />{EVENT_LABEL[event]}</label>)}</div>
        <button type="button" className="sa-link is-danger" onClick={() => set({ webhooks: s.webhooks.filter((_, i) => i !== index) })}>حذف این وب‌هوک</button>
      </div>)}
    </section>

    <section className="sa-card">
      <header className="sa-card-head"><h2>کارشناسان این فرم</h2><span className="sa-tag">{s.handlers.length ? `${fa(s.handlers.length)} نفر` : 'همهٔ کارشناسان'}</span></header>
      <p className="sa-hint">اگر کسی را انتخاب نکنید، هر کارمندِ دارای دسترسی «پاسخ‌ها و درخواست‌های فرم» این فرم را می‌بیند. با انتخاب، فقط همین افراد (و مدیران فرم‌ها) پاسخ‌ها را می‌بینند، خبردار می‌شوند و کار به آن‌ها سپرده می‌شود. فقط کسانی اینجا هستند که این دسترسی را دارند.</p>
      {gone.length > 0 && <div className="fa-gone" role="alert"><b>{fa(gone.length)} نفر از کارشناسان این فرم دیگر دسترسی ندارند</b> (نقششان عوض شده یا حسابشان غیرفعال است). تا آن‌ها را برندارید فرم ذخیره نمی‌شود. <button type="button" className="sa-link" onClick={() => set({ handlers: s.handlers.filter((id) => !gone.includes(id)) })}>برداشتن آن‌ها</button></div>}
      {staff === null ? <p className="sa-hint">در حال بارگذاری کارمندان…</p>
        : !staff.length ? <p className="fa-gone">هیچ کارمندی دسترسی «پاسخ‌ها و درخواست‌های فرم» ندارد. در <a className="sa-link" href="/admin/roles">نقش‌ها و دسترسی‌ها</a> یک نقش با این دسترسی بسازید و در بخش کاربران به کارمندها بدهید.</p>
        : <div className="fa-people" role="group" aria-label="کارشناسان">{staff.map((member) => <label key={member.id} className={`fa-person${s.handlers.includes(member.id) ? ' is-on' : ''}`}>
            <input type="checkbox" checked={s.handlers.includes(member.id)} onChange={(e) => set({ handlers: e.target.checked ? [...s.handlers, member.id] : s.handlers.filter((id) => id !== member.id) })} />
            <span><b>{member.name}</b><small>{member.role}{member.manager ? ' · مدیر فرم‌ها (همهٔ فرم‌ها را می‌بیند)' : ''}</small></span>
          </label>)}</div>}
      <p className="sa-hint">کارمند تازه؟ در <a className="sa-link" href="/admin/roles">نقش‌ها و دسترسی‌ها</a> دسترسی «پاسخ‌ها و درخواست‌های فرم» را به نقشش بدهید تا اینجا دیده شود.</p>
    </section>
  </>
}

type Api = <T>(url: string, method: 'GET' | 'PATCH' | 'DELETE', body?: unknown) => Promise<{ ok: true; data: T } | { ok: false; error: string }>
type Stats = { answers: number; fields: FieldStat[]; quiz: { taken: number; average: number; max: number } | null }

/** How the answers spread, field by field. */
export function FieldStatsView({ formId, api }: { formId: number; api: Api }) {
  const [stats, setStats] = useState<Stats | null>(null)
  useEffect(() => { void api<Stats>(`/api/admin/forms/submissions?formId=${formId}&view=fields`, 'GET').then((result) => { if (result.ok) setStats(result.data) }) }, [formId, api])
  if (!stats) return <p className="sa-hint">در حال بارگذاری آمار…</p>
  if (!stats.fields.length) return <p className="sa-hint">این فرم فیلد قابل شمارش (انتخابی، امتیاز یا عدد) ندارد.</p>
  return <div className="fa-stats">
    {stats.quiz && <article className="fa-stat"><h3>آزمون</h3><p className="fa-big num">{fa(stats.quiz.average)}<small> میانگین از {fa(stats.quiz.max)}</small></p><small>{fa(stats.quiz.taken)} شرکت‌کننده</small></article>}
    {stats.fields.map((field) => <article key={field.id} className="fa-stat">
      <h3>{field.label}</h3><small>{fa(field.answered)} پاسخ از {fa(stats.answers)}</small>
      {field.kind === 'choices' ? <ul>{field.options.map((option) => { const share = field.answered ? Math.round((option.count / field.answered) * 100) : 0; return <li key={option.label}><span>{option.label}</span><i aria-hidden="true"><em style={{ width: `${share}%` }} /></i><b className="num">{fa(option.count)} · {fa(share)}٪</b></li> })}</ul>
        : <p className="fa-big num">{fa(field.average)}<small> میانگین · کمترین {fa(field.min)} · بیشترین {fa(field.max)}</small></p>}
    </article>)}
  </div>
}

/** Staff correct the plain answers of one submission, and hand the work to a named colleague. */
export function EditAndAssign({ row, fields, manager, api, onChanged, onNotice }: { row: Row; fields: FormField[]; manager: boolean; api: Api; onChanged: () => void; onNotice: (tone: 'ok' | 'error', text: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [staff, setStaff] = useState<{ id: number; name: string }[] | null>(null)
  const editable = fields.filter((field) => staffEditable(field) && field.type !== 'checkbox' && field.type !== 'checkboxes')
  const current = (id: string) => String(row.answers.find((answer) => answer.id === id)?.value ?? '')
  async function save() {
    const answers = Object.fromEntries(Object.entries(draft).filter(([id, value]) => value !== current(id)))
    if (!Object.keys(answers).length) { setEditing(false); return }
    const result = await api('/api/admin/forms/submissions', 'PATCH', { id: row.id, answers })
    onNotice(result.ok ? 'ok' : 'error', result.ok ? 'پاسخ اصلاح شد.' : result.error)
    if (result.ok) { setEditing(false); setDraft({}); onChanged() }
  }
  async function assign(to: number) {
    const result = await api('/api/admin/forms/submissions', 'PATCH', { id: row.id, work: { assignTo: to } })
    onNotice(result.ok ? 'ok' : 'error', result.ok ? 'کار سپرده شد.' : result.error)
    if (result.ok) onChanged()
  }
  return <div className="fa-edit">
    <div className="sa-row-actions">
      {editable.length > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(!editing)}>{editing ? 'بستن ویرایش' : 'اصلاح پاسخ‌ها'}</button>}
      {manager && row.payStatus !== 'UNPAID' && <label className="fa-assign">سپردن به <select className="input" value={row.assigneeId || ''} onFocus={() => { if (!staff) void api<{ staff: { id: number; name: string }[] }>('/api/admin/forms?staff=1', 'GET').then((result) => setStaff(result.ok ? result.data.staff : [])) }} onChange={(e) => { if (e.target.value) void assign(Number(e.target.value)) }}><option value="">{row.assignee || 'انتخاب کارمند'}</option>{(staff || []).map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>}
      {row.scoreMax > 0 && <span className="sa-state is-info">امتیاز: {fa(row.score)} از {fa(row.scoreMax)}</span>}
    </div>
    {editing && <div className="fa-edit-grid">
      {editable.map((field) => <label key={field.id} className="sa-field"><span>{field.label}</span>
        {CHOICE_TYPES.includes(field.type) ? <select className="input" value={draft[field.id] ?? current(field.id)} onChange={(e) => setDraft({ ...draft, [field.id]: e.target.value })}><option value="">—</option>{field.options.map((option) => <option key={option}>{option}</option>)}</select>
          : field.type === 'textarea' ? <textarea className="input" rows={2} value={draft[field.id] ?? current(field.id)} onChange={(e) => setDraft({ ...draft, [field.id]: e.target.value })} />
          : <input className="input" dir="auto" value={draft[field.id] ?? current(field.id)} onChange={(e) => setDraft({ ...draft, [field.id]: e.target.value })} />}
      </label>)}
      <div className="sa-row-actions"><button type="button" className="btn btn-primary btn-sm" onClick={() => void save()}>ذخیرهٔ اصلاح</button><small className="sa-hint">مبلغ، نوبت، رمز و فایل قابل تغییر نیست. اصلاح با نام شما ثبت می‌شود.</small></div>
    </div>}
  </div>
}
