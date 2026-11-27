'use client'

import { useState } from 'react'
import type { ActionSignal, DeskCommand, DeskTargets, ManagementAction, ReviewHistory } from '@/modules/ai/domain/management'
import s from './page.module.css'

const endpoint = '/api/admin/ai/management/reviews/actions'
const signalCommands: Record<ActionSignal, DeskCommand[]> = {
  'support.stale': ['TICKET_NOTE', 'TICKET_REPLY'],
  'store.fulfilment': ['ORDER_NOTE', 'ORDER_ASSIGN'],
  'pay.delivery': ['PAY_ASSESSMENT'],
}
const actionSectionLabels: Record<ActionSignal, string> = {
  'support.stale': 'پشتیبانی', 'store.fulfilment': 'فروشگاه', 'pay.delivery': 'موبوکام پی',
}
const commandLabels: Record<DeskCommand, string> = {
  TICKET_NOTE: 'یادداشت داخلی تیکت', TICKET_REPLY: 'پاسخ پیشنهادی به کاربر',
  ORDER_NOTE: 'یادداشت داخلی سفارش', ORDER_ASSIGN: 'واگذاری سفارش', PAY_ASSESSMENT: 'ثبت ارزیابی پرداخت',
}
const assessmentLabels = { CONFIRMED: 'تأیید شده', UNCONFIRMED: 'تأیید نشده', NEEDS_REVIEW: 'نیازمند بررسی' } as const
const receiptDate = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tehran' })
const localDraft: Record<DeskCommand, string> = {
  TICKET_NOTE: 'لطفاً وضعیت این درخواست را بررسی و نتیجهٔ پیگیری را ثبت کنید.',
  TICKET_REPLY: 'سلام، درخواست شما در حال بررسی است. پس از تکمیل بررسی، نتیجه را از همین مسیر اطلاع می‌دهیم.',
  ORDER_NOTE: 'لطفاً وضعیت آماده‌سازی این سفارش را بررسی و نتیجه را ثبت کنید.',
  ORDER_ASSIGN: 'واگذاری سفارش برای پیگیری ثبت شود.',
  PAY_ASSESSMENT: 'ارزیابی پرداخت بر اساس بررسی سامانهٔ مرجع ثبت شود.',
}
type Review = { id: number; version: number }

async function request(body: Record<string, unknown>) {
  const response = await fetch(endpoint, { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new Error(payload?.error || payload?.message || 'درخواست انجام نشد')
  }
  return response.json()
}

export default function ReviewedAction({ signalId, review, busy, saved, onSaved }: {
  signalId: ActionSignal; review: Review; busy: boolean; saved?: ManagementAction
  onSaved: (history: ReviewHistory, message: string) => void
}) {
  const [expanded, setExpanded] = useState(Boolean(saved))
  const [targets, setTargets] = useState<DeskTargets>()
  const [targetId, setTargetId] = useState('')
  const [command, setCommand] = useState<DeskCommand>(signalCommands[signalId][0])
  const [text, setText] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [assessment, setAssessment] = useState<keyof typeof assessmentLabels>('NEEDS_REVIEW')
  const [externallyChecked, setExternallyChecked] = useState(false)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)
  const selected = targets?.targets.find(item => item.id === targetId)
  const stage = saved?.result ? 'done' : saved && !editing ? 'prepared' : 'edit'
  const isPublic = command === 'TICKET_REPLY'
  const actionBusy = busy || working
  const canPrepare = selected?.commands.includes(command) && text.trim() &&
    (command !== 'ORDER_ASSIGN' || assigneeId) &&
    (command !== 'PAY_ASSESSMENT' || assessment !== 'CONFIRMED' || externallyChecked)

  async function loadTargets() {
    setExpanded(true)
    if (saved && !editing) return
    await refreshTargets()
  }

  async function refreshTargets() {
    setWorking(true); setError('')
    try {
      const result = await request({ action: 'targets', id: review.id, version: review.version, signalId }) as DeskTargets
      const target = result.targets.find(item => item.id === (saved?.target.id || targetId)) ?? result.targets[0]
      const next = target?.commands.find(item => item === (saved?.command || command)) ?? target?.commands[0] ?? command
      setTargets(result)
      setTargetId(target?.id || '')
      setCommand(next)
      setText(saved?.command === next ? saved.text : text || localDraft[next])
      setAssigneeId(saved?.assigneeId ? String(saved.assigneeId) : '')
      setAssessment(saved?.assessment ?? 'NEEDS_REVIEW')
      setExternallyChecked(false)
      if (!result.targets.length) setError('موردی برای این پیشنهاد در دسترس نیست')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'موردها دریافت نشدند') }
    finally { setWorking(false) }
  }

  async function suggest() {
    if (!selected || !['TICKET_NOTE', 'TICKET_REPLY'].includes(command)) return
    setWorking(true); setError('')
    try {
      const result = await request({ action: 'suggest', id: review.id, version: review.version, signalId, targetId: selected.id, stamp: selected.stamp, command }) as { text?: string }
      if (!result.text) throw new Error('پیش‌نویس از سرویس دریافت نشد')
      setText(result.text)
    } catch (reason) { setError(`${reason instanceof Error ? reason.message : 'پیش‌نویس ساخته نشد'}؛ متن جایگزین محلی را ویرایش کنید`) }
    finally { setWorking(false) }
  }

  async function prepare() {
    if (!selected || !canPrepare) return
    setWorking(true); setError('')
    try {
      const result = await request({ action: 'prepare', id: review.id, version: review.version, signalId, targetId: selected.id, stamp: selected.stamp, command, text: text.trim(), ...(command === 'ORDER_ASSIGN' ? { assigneeId: Number(assigneeId) } : {}), ...(command === 'PAY_ASSESSMENT' ? { assessment, externallyChecked } : {}) }) as ReviewHistory
      setEditing(false)
      onSaved(result, 'پیش‌نویس برای بازبینی ذخیره شد')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'پیش‌نویس ذخیره نشد') }
    finally { setWorking(false) }
  }

  async function execute() {
    setWorking(true); setError('')
    try {
      const result = await request({ action: 'execute', id: review.id, version: review.version, signalId, confirmed: true }) as ReviewHistory
      onSaved(result, 'اقدام ثبت شد')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'اقدام ثبت نشد') }
    finally { setWorking(false) }
  }

  return <section className={s.actionPanel} aria-label={`اقدام بازبینی‌شدهٔ ${actionSectionLabels[signalId]} در بررسی ${review.id}`}>
    <button className="btn btn-ghost" type="button" aria-expanded={expanded} onClick={() => expanded ? setExpanded(false) : void loadTargets()} disabled={actionBusy}>
      {expanded ? 'بستن اقدام' : saved ? 'نمایش اقدام ثبت‌شده' : 'آماده‌سازی اقدام'}</button>
    {expanded && <div className={s.actionBody}>
      <h4>اقدام روی مورد مشخص</h4>
      {error && <p role="alert" className={s.notice}>{error}</p>}
      {stage === 'edit' && <>
        <label>مورد<select value={targetId} onChange={event => {
          const nextTarget = targets?.targets.find(target => target.id === event.target.value)
          setTargetId(event.target.value)
          setExternallyChecked(false)
          if (nextTarget && !nextTarget.commands.includes(command)) {
            setCommand(nextTarget.commands[0])
            setText(localDraft[nextTarget.commands[0]])
          }
        }} disabled={!targets?.targets.length || actionBusy}>
          {!targets?.targets.length && <option value="">در حال دریافت…</option>}
          {targets?.targets.map(target => <option key={target.id} value={target.id}>{target.label}</option>)}
        </select></label>
        {selected && <ul className={s.targetFacts}>{selected.facts.map(fact => <li key={fact}>{fact}</li>)}</ul>}
        <label>نوع اقدام<select value={command} onChange={event => { const next = event.target.value as DeskCommand; setCommand(next); setText(localDraft[next]) }} disabled={!selected || actionBusy}>
          {(selected?.commands ?? [command]).map(value => <option key={value} value={value}>{commandLabels[value]}</option>)}
        </select></label>
        {command === 'ORDER_ASSIGN' && <label>مسئول جدید<select value={assigneeId} onChange={event => setAssigneeId(event.target.value)}>
          <option value="">انتخاب مسئول</option>{targets?.assignees.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
        </select></label>}
        {command === 'PAY_ASSESSMENT' && <>
          <label>ارزیابی<select value={assessment} onChange={event => setAssessment(event.target.value as keyof typeof assessmentLabels)}>
            {Object.entries(assessmentLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select></label>
          {assessment === 'CONFIRMED' && <label className={s.actionCheck}><input type="checkbox" checked={externallyChecked} onChange={event => setExternallyChecked(event.target.checked)} /> پرداخت را در سامانهٔ مرجع بررسی کردم</label>}
          <p className={s.actionHint}>نتیجهٔ بررسی در تاریخچهٔ مدیریت ثبت می‌شود.</p>
        </>}
        {command === 'TICKET_NOTE' && <p className={s.actionHint}>یادداشت فقط برای کارکنان قابل مشاهده است.</p>}
        {isPublic && <p className={s.actionHint}>متن پاسخ برای کاربر ارسال می‌شود و پیش از ارسال، متن دقیق را بازبینی کنید.</p>}
        {command !== 'ORDER_ASSIGN' && <label>{isPublic ? 'متن پاسخ' : 'متن یادداشت یا توضیح'}<textarea value={text} minLength={2} maxLength={850} rows={4} onChange={event => setText(event.target.value)} disabled={actionBusy} /></label>}
        {(command === 'TICKET_NOTE' || isPublic) && <button type="button" className="btn btn-ghost" disabled={actionBusy || !selected} onClick={() => void suggest()}>پیشنهاد متن با هوش مصنوعی</button>}
        <button type="button" className="btn btn-primary" disabled={actionBusy || !canPrepare} onClick={() => void prepare()}>ذخیره برای بازبینی</button>
        {saved && <button type="button" className="btn btn-ghost" disabled={actionBusy} onClick={() => { setEditing(false); setError('') }}>بازگشت به پیش‌نمایش</button>}
      </>}
      {saved && stage !== 'edit' && <div className={s.actionPreview}>
        <h5>{stage === 'done' ? 'اقدام انجام‌شده' : 'پیش‌نمایش دقیق اقدام'}</h5>
        <dl><div><dt>مورد</dt><dd>{saved.target.label}</dd></div><div><dt>نوع</dt><dd>{commandLabels[saved.command]}</dd></div>
          {saved.assessment && <div><dt>ارزیابی</dt><dd>{assessmentLabels[saved.assessment]}</dd></div>}
        </dl>
        {saved.text && <p className={s.savedText}>{saved.text}</p>}
        {saved.result && <p role="status">شمارهٔ ثبت <bdi dir="ltr">{String(saved.result.id)}</bdi> · {receiptDate.format(new Date(saved.result.at))}</p>}
        {stage === 'prepared' && <>
          <button type="button" className="btn btn-primary" disabled={actionBusy} onClick={() => void execute()}>تأیید و اجرای همین اقدام</button>
          <button type="button" className="btn btn-ghost" disabled={actionBusy} onClick={() => { setEditing(true); void refreshTargets() }}>ویرایش پیش‌نویس</button>
        </>}
      </div>}
    </div>}
  </section>
}
