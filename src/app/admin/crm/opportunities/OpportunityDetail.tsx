'use client'

import { useEffect, useState, type FormEvent } from 'react'
import Link from '@/components/AppLink'
import JalaliDateInput from '@/components/date/JalaliDateInput'
import { faDate } from '../../store/shared'
import OpportunityForm from './OpportunityForm'
import OpportunityQuotations from './OpportunityQuotations'
import { formatAmount, STAGES, type Detail } from './types'
import styles from './opportunities.module.css'

export default function OpportunityDetail({ id, close, changed }: { id: number; close: () => void; changed: () => void }) {
  const [data, setData] = useState<Detail | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [reload, setReload] = useState(0)
  const [loadedRevision, setLoadedRevision] = useState(-1)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [addingTask, setAddingTask] = useState(false)
  const refreshing = loadedRevision !== reload
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const response = await fetch(`/api/admin/crm/opportunities?id=${id}`, { cache: 'no-store', signal: controller.signal })
        if (!response.ok) { const body = await response.json().catch(() => null); throw new Error(body?.error || 'دریافت فرصت ممکن نشد.') }
        const body: Detail = await response.json()
        if (!controller.signal.aborted) setData(body)
      } catch (cause) {
        if (!controller.signal.aborted) {
          setData(null)
          setError(cause instanceof Error ? cause.message : 'دریافت فرصت ممکن نشد.')
        }
      } finally {
        if (!controller.signal.aborted) setLoadedRevision(reload)
      }
    }
    void load()
    return () => controller.abort()
  }, [id, reload])

  async function command(path: string, method: string, body: Record<string, unknown>) {
    if (busy || refreshing) return
    setBusy(true); setError(''); setNotice('')
    try {
      const response = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!response.ok) {
        const result = await response.json().catch(() => null)
        if (response.status === 409) { setEditing(false); setAddingTask(false); setReload(value => value + 1) }
        throw new Error(result?.error || 'ثبت تغییرات ممکن نشد.')
      }
      setEditing(false); setAddingTask(false); setNotice('تغییرات ذخیره شد.')
      setReload(value => value + 1); changed()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'ثبت تغییرات ممکن نشد.') } finally { setBusy(false) }
  }

  async function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!data) return
    const fields = new FormData(event.currentTarget)
    await command(`/api/admin/crm/follow-ups?userId=${data.row.userId}`, 'POST', {
      title: String(fields.get('title') || '').trim(), dueDay: String(fields.get('dueDay') || ''),
      opportunityId: data.row.id, ...(fields.get('assigneeId') ? { assigneeId: Number(fields.get('assigneeId')) } : {}),
    })
  }
  return <section className={styles.panel} aria-labelledby="opportunity-detail-title" aria-busy={refreshing}>
    <div className={styles.heading}><h2 id="opportunity-detail-title">جزئیات فرصت</h2><button className="btn btn-ghost" type="button" onClick={close}>بستن جزئیات</button></div>
    {error && <p role="alert">{error} <button className="btn btn-ghost btn-sm" type="button" disabled={refreshing} onClick={() => { setError(''); setReload(value => value + 1) }}>تازه‌سازی</button></p>}
    {notice && <p role="status">{notice}</p>}
    {!data && !error && <p role="status">در حال دریافت فرصت…</p>}
    {data && <>
      <h3>{data.row.title}</h3>
      <dl className={styles.details}>
        <div><dt>مشتری</dt><dd><Link className="sa-link" href={`/admin/crm/${data.row.userId}`}>{data.row.userName || `مشتری ${data.row.userId}`}</Link></dd></div>
        <div><dt>مرحله</dt><dd>{STAGES[data.row.stage]}</dd></div>
        <div><dt>مبلغ برآوردی</dt><dd>{formatAmount(data.row.amountMinor, data.row.currency)}</dd></div>
        <div><dt>مسئول</dt><dd>{data.row.assigneeName || 'بدون مسئول'}</dd></div>
        <div><dt>تاریخ هدف</dt><dd>{data.row.targetDay ? faDate(data.row.targetDay) : 'تعیین نشده'}</dd></div>
        {data.source && <div><dt>منبع</dt><dd><Link className="sa-link" href={data.source.href}>{data.source.type === 'FORM' ? 'پاسخ فرم' : 'تیکت'} {data.source.id.toLocaleString('fa-IR')}</Link></dd></div>}
      </dl>
      {data.row.mayEdit && !editing && <p><button className="btn btn-ghost" type="button" disabled={busy || refreshing} onClick={() => setEditing(true)}>ویرایش فرصت و مرحله</button></p>}
      {data.row.mayEdit && editing && <OpportunityForm key={data.row.version} detail={data} staff={data.staff} canManage={data.canManage} ownId={data.row.assigneeId || 0} busy={busy} cancel={() => setEditing(false)} save={body => command('/api/admin/crm/opportunities', 'PATCH', body)} />}
      <OpportunityQuotations opportunityId={data.row.id} version={data.row.version} mayEdit={data.row.mayEdit} changed={changed} />
      <h3>پیگیری‌های فرصت</h3>
      {data.followUps.length ? <ul className={styles.history}>{data.followUps.map(task => <li key={task.id}><strong>{task.title}</strong><small>{faDate(task.dueDay)} · {task.assigneeName || 'بدون مسئول'} · {task.status === 'OPEN' ? 'باز' : task.status === 'DONE' ? 'انجام‌شده' : 'لغوشده'}</small></li>)}</ul> : <p className={styles.muted}>پیگیری‌ای برای این فرصت ثبت نشده است.</p>}
      <p><Link className="sa-link" href={`/admin/crm/${data.row.userId}#follow-ups-heading`}>همهٔ پیگیری‌های مشتری</Link></p>
      {data.row.mayEdit && !addingTask && <button className="btn btn-ghost" type="button" disabled={busy || refreshing} onClick={() => setAddingTask(true)}>افزودن پیگیری</button>}
      {data.row.mayEdit && addingTask && <form className={styles.form} onSubmit={event => void addTask(event)}>
        <div className={styles.fields}>
          <label className={styles.field}>عنوان پیگیری<input className="input" name="title" required maxLength={160} /></label>
          <div className={styles.field}><span>موعد پیگیری</span><JalaliDateInput name="dueDay" aria-label="موعد پیگیری" required /></div>
          {data.canManage && <label className={styles.field}>مسئول پیگیری<select className="input" name="assigneeId" defaultValue={data.row.assigneeId || ''}><option value="" disabled>انتخاب مسئول</option>{data.staff.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>}
        </div>
        <div className={styles.actions}><button className="btn btn-primary" type="submit" disabled={busy}>ثبت پیگیری</button><button className="btn btn-ghost" type="button" disabled={busy} onClick={() => setAddingTask(false)}>انصراف</button></div>
      </form>}
      <h3>تاریخچهٔ مراحل</h3>
      {data.history.length ? <ol className={styles.history}>{data.history.map(item => <li key={item.id}><strong>{item.fromStage ? `${STAGES[item.fromStage]} ← ` : ''}{STAGES[item.toStage]}</strong><small>{item.actorName || 'کاربر حذف‌شده'} · {faDate(item.createdAt)}</small>{item.reason && <span>{item.reason}</span>}</li>)}</ol> : <p className={styles.muted}>تغییر مرحله‌ای ثبت نشده است.</p>}
    </>}
  </section>
}
