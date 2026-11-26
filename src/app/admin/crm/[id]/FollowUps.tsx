'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import JalaliDateInput from '@/components/date/JalaliDateInput'
import { FOLLOW_UP_STATUS, type FollowUp, type FollowUpList } from '@/modules/livechat/domain/crm-follow-ups'
import { faDate } from '../../store/shared'
import styles from './follow-ups.module.css'

type Fields = { title: string; dueDay: string; assigneeId?: number }
type Save = (method: 'POST' | 'PATCH', input: Fields | (Partial<Fields> & { id: number; version: number; status?: 'DONE' | 'CANCELLED' })) => Promise<boolean>

function TaskFields({ data, task }: { data: FollowUpList; task?: FollowUp }) {
  return <>
    <label>عنوان پیگیری<input className="input" name="title" required maxLength={160} defaultValue={task?.title} /></label>
    <div className={styles.field}><span>موعد پیگیری</span><JalaliDateInput aria-label="موعد پیگیری" name="dueDay" required defaultValue={task?.dueDay || data.today} min={task ? undefined : data.today} /></div>
    {data.mayAssign && <label>مسئول پیگیری<select className="input" name="assigneeId" defaultValue={task ? task.assigneeId ?? '' : data.ownId}>
      <option value="" disabled>انتخاب مسئول</option>
      {task?.assigneeId && !data.staff.some(staff => staff.id === task.assigneeId) && <option value={task.assigneeId} disabled>{task.assigneeName}</option>}
      {data.staff.map(staff => <option key={staff.id} value={staff.id}>{staff.name}</option>)}
    </select></label>}
  </>
}

function fieldsOf(form: HTMLFormElement): Fields {
  const fields = new FormData(form)
  const staff = fields.get('assigneeId')
  return { title: String(fields.get('title') ?? ''), dueDay: String(fields.get('dueDay') ?? ''), ...(staff ? { assigneeId: Number(staff) } : {}) }
}

function TaskList({ data, busy, save }: { data: FollowUpList; busy: boolean; save: Save }) {
  const open = data.rows.filter(row => row.status === 'OPEN')
  const closed = data.rows.filter(row => row.status !== 'OPEN')
  return <>
    <h3>پیگیری‌های باز</h3>
    {open.length ? <ul className={styles.list}>{open.map(row => <li key={row.id}>
      <strong>{row.title}</strong>
      <p>{row.assigneeName || 'بدون مسئول'} · <time dateTime={row.dueDay}>{faDate(row.dueDay)}</time>{row.dueDay < data.today ? ' · گذشته از موعد' : ''}</p>
      {row.mayEdit && <div className={styles.actions}>
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void save('PATCH', { id: row.id, version: row.version, status: 'DONE' })}>انجام شد</button>
        <details key={row.version}>
          <summary>ویرایش پیگیری</summary>
          <form className={styles.form} onSubmit={event => {
            event.preventDefault()
            void save('PATCH', { ...fieldsOf(event.currentTarget), id: row.id, version: row.version })
          }}>
            <TaskFields data={data} task={row} />
            <div className={styles.actions}>
              <button className="btn btn-primary btn-sm" type="submit" disabled={busy}>ذخیرهٔ تغییرات</button>
              <button className="btn btn-ghost btn-sm" type="button" disabled={busy} onClick={() => void save('PATCH', { id: row.id, version: row.version, status: 'CANCELLED' })}>لغو پیگیری</button>
            </div>
          </form>
        </details>
      </div>}
    </li>)}</ul> : <p>پیگیری بازی ثبت نشده است.</p>}
    {!!closed.length && <details className={styles.history}>
      <summary>سابقهٔ پیگیری‌ها</summary>
      <ul className={styles.list}>{closed.map(row => <li key={row.id}><strong>{row.title}</strong><p>{FOLLOW_UP_STATUS[row.status]} · {row.assigneeName || 'بدون مسئول'} · <time dateTime={row.dueDay}>{faDate(row.dueDay)}</time></p></li>)}</ul>
    </details>}
    {data.hasMore && <p>حداکثر ۵۰ پیگیری باز و ۲۰ مورد اخیر از سابقه نمایش داده می‌شود.</p>}
  </>
}

export default function FollowUps({ userId }: { userId: number }) {
  const href = `/api/admin/crm/follow-ups?userId=${userId}`
  const [data, setData] = useState<FollowUpList | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [reload, setReload] = useState(0)
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const createForm = useRef<HTMLFormElement | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    async function get() {
      try {
        const response = await fetch(href, { cache: 'no-store', signal: controller.signal })
        if (!response.ok) throw Error('فهرست پیگیری‌ها دریافت نشد.')
        const next: FollowUpList = await response.json()
        if (!controller.signal.aborted) setData(next)
      } catch {
        if (!controller.signal.aborted) setError('فهرست پیگیری‌ها دریافت نشد.')
      }
    }
    void get()
    return () => controller.abort()
  }, [href, reload])

  const save: Save = async (method, input) => {
    if (inFlight.current) return false
    inFlight.current = true
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch(href, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        if (response.status === 409) setReload(value => value + 1)
        throw Error(typeof body?.error === 'string' ? body.error : 'تغییر پیگیری ثبت نشد.')
      }
      if (method === 'POST') createForm.current?.reset()
      setMessage(method === 'POST' ? 'پیگیری ثبت شد.' : 'تغییر پیگیری ذخیره شد.')
      setReload(value => value + 1)
      return true
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تغییر پیگیری ثبت نشد.')
      return false
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void save('POST', fieldsOf(event.currentTarget))
  }

  return <section className={`sa-card ${styles.panel}`} aria-labelledby="follow-ups-heading" aria-busy={busy}>
    <h2 id="follow-ups-heading">پیگیری مشتری</h2>
    {error && <p role="alert">{error} {!data && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setError(''); setReload(value => value + 1) }}>تلاش دوباره</button>}</p>}
    {message && <p role="status">{message}</p>}
    {!data && !error && <p role="status">در حال دریافت پیگیری‌ها…</p>}
    {data && <>
      <TaskList data={data} busy={busy} save={save} />
      <form ref={createForm} className={styles.form} onSubmit={create}>
        <h3>پیگیری تازه</h3>
        <TaskFields data={data} />
        {!data.mayAssign && <p>مسئول پیگیری خودتان هستید.</p>}
        <button className="btn btn-primary btn-sm" type="submit" disabled={busy}>ثبت پیگیری</button>
      </form>
    </>}
  </section>
}
