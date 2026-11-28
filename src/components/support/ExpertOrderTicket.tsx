'use client'

import { useEffect, useId, useState, type FormEvent } from 'react'
import {
  EXPERT_AUTHENTICATION_REQUEST, EXPERT_TICKET_SECURITY, type ExpertOrderTicket as Ticket,
} from '@/modules/support/domain/expert-order-ticket'
import s from './ExpertOrderTicket.module.css'

const statusLabel: Record<string, string> = { PENDING: 'منتظر پاسخ مشتری', OPEN: 'منتظر پاسخ کارشناس', CLOSED: 'گفت‌وگو بسته شد' }

async function requestTicket(endpoint: string, signal?: AbortSignal, input?: { purpose: string; message: string; version: number | null }) {
  const response = await fetch(endpoint, {
    cache: 'no-store', signal, ...(input ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) } : {}),
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || 'دریافت گفت‌وگو ممکن نشد.')
  return result.ticket as Ticket | null
}

export default function ExpertOrderTicket({ endpoint, writable = true }: { endpoint: string; writable?: boolean }) {
  const titleId = useId()
  const guidanceId = useId()
  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [show, setShow] = useState(false)
  const [version, setVersion] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [purpose, setPurpose] = useState('detail')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    requestTicket(endpoint, controller.signal).then(result => {
      if (controller.signal.aborted) return
      setTicket(result)
      setLoaded(true)
    }).catch(problem => {
      if (!controller.signal.aborted) setError(problem instanceof Error ? problem.message : 'ارتباط برقرار نشد.')
    })
    return () => controller.abort()
  }, [endpoint, version])

  function refresh() {
    setError('')
    setSent(false)
    setVersion(n => n + 1)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setSent(false)
    setError('')
    try {
      setTicket(await requestTicket(endpoint, undefined, { purpose, message, version: ticket?.version ?? null }))
      setMessage('')
      setShow(false)
      setSent(true)
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'ارسال پیام ممکن نشد.')
    } finally {
      setBusy(false)
    }
  }

  if (loaded && !writable && !ticket) return null
  return <section className={`sa-card sa-noprint ${s.panel}`} aria-labelledby={titleId} aria-busy={busy || !loaded && !error ? true : undefined}>
    <header><h3 id={titleId}>گفت‌وگو با مشتری</h3>{ticket && <small>تیکت {ticket.id.toLocaleString('fa-IR')} · {statusLabel[ticket.status]}</small>}</header>
    {!loaded && !error && <p className={s.hint} role="status">در حال دریافت گفت‌وگو…</p>}
    {error && <p role="alert">{error}</p>}
    {sent && <p role="status">پیام برای مشتری ارسال شد.</p>}
    {ticket && <ol className={s.thread} aria-label="آخرین پیام‌های تیکت" tabIndex={0}>
      {ticket.messages.map(item => <li key={item.id}><small>{item.staff ? 'کارشناس' : 'مشتری'}</small><p dir="auto">{item.text}</p></li>)}
    </ol>}
    {loaded && !ticket && <p className={s.hint}>اگر برای انجام سفارش به اطلاعات یا اقدامی از مشتری نیاز دارید، تیکت باز کنید.</p>}
    {loaded && writable && ticket?.status !== 'CLOSED' && show && <form className={s.composer} onSubmit={submit}>
      <label><span>درخواست از مشتری</span><select className="input" value={purpose} onChange={event => setPurpose(event.target.value)} disabled={busy}>
        <option value="detail">اطلاعات تکمیلی سفارش</option><option value="verification">تأیید در سرویس اصلی</option>
      </select></label>
      {purpose === 'detail' ? <label><span>متن پیام</span><textarea className="input" value={message} onChange={event => setMessage(event.target.value)} rows={3} required maxLength={1500} disabled={busy} aria-describedby={guidanceId} /></label>
        : <p>{EXPERT_AUTHENTICATION_REQUEST}</p>}
      <p id={guidanceId} className={s.hint}>{EXPERT_TICKET_SECURITY}</p>
      <div className={s.actions}>
        <button type="submit" className="btn btn-primary" disabled={busy || purpose === 'detail' && !message.trim()}>{busy ? 'در حال ارسال…' : 'ارسال به مشتری'}</button>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setShow(false)}>انصراف</button>
      </div>
    </form>}
    <div className={s.actions}>
      {loaded && writable && ticket?.status !== 'CLOSED' && !show && <button type="button" className="btn btn-ghost" onClick={() => { setShow(true); setSent(false) }}>{ticket ? 'ارسال پیام جدید' : 'باز کردن تیکت'}</button>}
      {(ticket || error) && <button type="button" className="btn btn-ghost" disabled={busy} onClick={refresh}>تازه‌سازی گفت‌وگو</button>}
    </div>
  </section>
}
