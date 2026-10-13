'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import RichEditor from '@/components/RichEditor'
import StatusBadge from '@/components/TicketStatusBadge'
import { useI18n } from '@/i18n/LocaleProvider'
import { deviceLabel, issueLabel } from '@/modules/support/domain/incidents'
import type { TicketField } from '@/modules/support/domain/department-config'
import TicketSubscriptionContext from '@/components/TicketSubscriptionContext'
import StaffNewTicket from '@/components/support/StaffNewTicket'
import { TicketAttachmentList, TicketAttachmentPicker, ticketFormBody, type TicketAttachmentView } from '@/components/TicketAttachments'

type TicketRow = { id: number; subject: string; status: string; priority: string; department: string; departmentName: { fa: string; en: string }; subscriptionId: number | null; productId: number | null; user: string; userName: string; lastMessage: string; updatedAt: string; assignedToId: number | null; slaDueAt: string | null; sla: string }
type Detail = TicketRow & { device: string | null; issueType: string | null; subscriptionUsername: string; subscriptionLink: string; firstResponseAt: string | null; customFields: Record<string, string | boolean>; departmentFields: TicketField[]; messages: { id: number; fromAdmin: boolean; internal: boolean; body: string; createdAt: string; attachments: TicketAttachmentView[] }[] }
type Staff = { id: number; name: string; departments: string[] | null }

export default function AdminTicketsPage() {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const L = (en: string, persian: string) => fa ? persian : en
  const [tickets, setTickets] = useState<TicketRow[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [departmentFilter, setDepartmentFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [query, setQuery] = useState('')
  const [reply, setReply] = useState('')
  const [replyFiles, setReplyFiles] = useState<File[]>([])
  const [closeAfterReply, setCloseAfterReply] = useState(false)
  const [internalNote, setInternalNote] = useState(false)
  const [staff, setStaff] = useState<Staff[]>([])
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const date = (value: string) => new Date(value).toLocaleString(fa ? 'fa-IR' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' })

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/tickets', { cache: 'no-store' })
      if (!response.ok) throw Error()
      setTickets(await response.json())
    } catch { setError(fa ? 'دریافت تیکت‌ها ممکن نشد.' : 'Could not load tickets.') }
    finally { setLoading(false) }
  }, [fa])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    const id = Number(new URLSearchParams(window.location.search).get('ticket'))
    if (Number.isSafeInteger(id) && id > 0) void open(id)
  }, [])
  useEffect(() => { fetch('/api/admin/tickets?view=staff').then(r => r.ok ? r.json() : []).then(setStaff).catch(() => setStaff([])) }, [])

  async function open(id: number) {
    setSelected(id); setDetail(null); setError('')
    try {
      const response = await fetch(`/api/tickets/${id}`, { cache: 'no-store' })
      if (!response.ok) throw Error()
      setDetail(await response.json())
    } catch { setError(L('Could not open this ticket.', 'باز کردن تیکت ممکن نشد.')) }
  }

  async function send(event: React.FormEvent) {
    event.preventDefault(); if (!selected || busy) return
    setBusy(true); setError('')
    try {
      const response = await fetch(`/api/tickets/${selected}`, { method: 'POST', ...ticketFormBody({ message: reply, close: closeAfterReply && !internalNote, internal: internalNote }, replyFiles) })
      if (!response.ok) throw Error((await response.json().catch(() => null))?.error || L('Reply could not be sent. Please retry.', 'پاسخ ارسال نشد؛ دوباره تلاش کنید.'))
      setReply(''); setReplyFiles([]); setCloseAfterReply(false); setInternalNote(false); await open(selected); await load()
    } catch (error) { setError(error instanceof Error ? error.message : L('Reply could not be sent. Please retry.', 'پاسخ ارسال نشد؛ دوباره تلاش کنید.')) }
    finally { setBusy(false) }
  }

  async function setStatus(status: string) {
    if (!selected || busy) return
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/admin/tickets', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: selected, status }) })
      if (!response.ok) throw Error()
      await open(selected); await load()
    } catch { setError(L('Status could not be updated.', 'وضعیت تغییر نکرد.')) }
    finally { setBusy(false) }
  }

  async function assign(assignedToId: number | null) {
    if (!selected || busy) return
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/admin/tickets', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: selected, assignedToId }) })
      if (!response.ok) throw Error()
      await open(selected); await load()
    } catch { setError(L('Assignment could not be saved.', 'واگذاری تیکت ذخیره نشد.')) }
    finally { setBusy(false) }
  }

  const departments = useMemo(() => [...new Map(tickets.map(ticket => [ticket.department, ticket.departmentName])).entries()], [tickets])
  const filtered = useMemo(() => tickets.filter(ticket => (departmentFilter === 'ALL' || ticket.department === departmentFilter) && (statusFilter === 'ALL' || ticket.status === statusFilter) && (!query.trim() || `${ticket.id} ${ticket.subject} ${ticket.user} ${ticket.userName}`.toLowerCase().includes(query.trim().toLowerCase()))), [tickets, departmentFilter, statusFilter, query])
  const openCount = tickets.filter(ticket => ticket.status === 'OPEN').length
  const pendingCount = tickets.filter(ticket => ticket.status === 'PENDING').length

  return <section className="ticket-ops">
    <header className="ticket-ops-header"><div><span className="ticket-eyebrow">MOBOCOMCMS / SUPPORT</span><h1>{L('Ticket desk', 'میز پشتیبانی')}</h1><p>{L('A focused workspace for requests, teams, and customer conversations.', 'فضایی منظم برای درخواست‌ها، تیم‌ها و گفت‌وگو با کاربران.')}</p></div><div className="ticket-ops-metrics"><div><strong>{openCount}</strong><span>{L('Needs response', 'نیازمند پاسخ')}</span></div><div><strong>{pendingCount}</strong><span>{L('Answered', 'پاسخ داده شده')}</span></div></div></header>
    <div className="ticket-ops-toolbar"><div className="ticket-ops-filters"><select className="input" value={departmentFilter} onChange={e => setDepartmentFilter(e.target.value)} aria-label={L('Department', 'دپارتمان')}><option value="ALL">{L('All departments', 'همهٔ دپارتمان‌ها')}</option>{departments.map(([slug, name]) => <option key={slug} value={slug}>{fa ? name.fa : name.en}</option>)}</select><select className="input" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} aria-label={L('Status', 'وضعیت')}><option value="ALL">{L('All statuses', 'همهٔ وضعیت‌ها')}</option><option value="OPEN">{L('Awaiting reply', 'در انتظار پاسخ')}</option><option value="PENDING">{L('Answered', 'پاسخ داده شده')}</option><option value="CLOSED">{L('Closed', 'بسته')}</option></select></div><input className="input" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={L('Search ticket or customer…', 'جست‌وجوی تیکت یا کاربر…')} aria-label={L('Search tickets', 'جست‌وجوی تیکت‌ها')} /></div>
    <StaffNewTicket departments={departments} fa={fa} onCreated={() => { void load() }} />
    {error && <p className="ticket-alert" role="alert">{error}</p>}
    <div className="ticket-ops-workspace"><aside className="ticket-ops-inbox"><div className="ticket-ops-pane-title"><strong>{L('Inbox', 'صندوق تیکت‌ها')}</strong><span>{filtered.length}</span></div><div className="ticket-ops-inbox-list">{loading && <p className="ticket-empty">{L('Loading…', 'در حال دریافت…')}</p>}{!loading && filtered.length === 0 && <p className="ticket-empty">{L('No tickets found.', 'تیکتی پیدا نشد.')}</p>}{filtered.map(ticket => <button type="button" key={ticket.id} className={`ticket-ops-row ${selected === ticket.id ? 'is-active' : ''}`} onClick={() => void open(ticket.id)}><div className="ticket-ops-row-top"><span>#{ticket.id} · {fa ? ticket.departmentName.fa : ticket.departmentName.en}</span><StatusBadge value={ticket.status} /></div><strong>{ticket.subject}</strong><small>{ticket.userName || ticket.user} · {date(ticket.updatedAt)}</small><p>{ticket.lastMessage}</p><span className={`ticket-sla ${ticket.sla === 'BREACHED' ? 'is-breached' : ''}`}>{ticket.sla === 'BREACHED' ? L('SLA overdue', 'پاسخ اولیه دیر شده') : ticket.sla === 'DUE' && ticket.slaDueAt ? `${L('Reply by', 'مهلت پاسخ')} ${date(ticket.slaDueAt)}` : L('First response complete', 'پاسخ اولیه انجام شد')}</span></button>)}</div></aside>
      <div className="ticket-ops-detail">{selected && !detail ? <div className="ticket-welcome">{L('Loading conversation…', 'در حال دریافت گفتگو…')}</div> : detail ? <><header className="ticket-ops-detail-head"><div><span className="ticket-eyebrow">#{detail.id} · {fa ? detail.departmentName.fa : detail.departmentName.en}</span><h2>{detail.subject}</h2><p>{detail.userName || detail.user} · {date(detail.updatedAt)}</p></div><div className="ticket-ops-actions"><StatusBadge value={detail.status} />{detail.status !== 'OPEN' && <button type="button" disabled={busy} onClick={() => void setStatus('OPEN')}>{L('Reopen', 'باز کردن')}</button>}{detail.status !== 'CLOSED' && <button type="button" disabled={busy} onClick={() => void setStatus('CLOSED')}>{L('Close', 'بستن')}</button>}</div></header>
        <div className="ticket-ops-assignment"><label htmlFor="ticket-assignee">{L('Assigned specialist', 'کارشناس مسئول')}</label><select id="ticket-assignee" className="input" value={detail.assignedToId ?? ''} disabled={busy} onChange={event => void assign(event.target.value ? Number(event.target.value) : null)}><option value="">{L('Unassigned', 'واگذار نشده')}</option>{staff.filter(person => person.departments === null || person.departments.includes(detail.department)).map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select>{detail.slaDueAt && !detail.firstResponseAt && <small>{L('First response due', 'مهلت پاسخ اولیه')}: {date(detail.slaDueAt)}</small>}</div>
        <TicketSubscriptionContext id={detail.subscriptionId} username={detail.subscriptionUsername} link={detail.subscriptionLink} />{(detail.productId || detail.device || detail.issueType || Object.keys(detail.customFields || {}).length > 0) && <div className="ticket-ops-context">{detail.subscriptionId && (detail.device || detail.issueType) && <span>{detail.device ? deviceLabel(detail.device, locale) : ''}{detail.issueType ? ` · ${issueLabel(detail.issueType, locale)}` : ''}</span>}{detail.productId && <span>{L('Product', 'محصول')} #{detail.productId}</span>}{Object.entries(detail.customFields || {}).map(([key, value]) => { const field = detail.departmentFields?.find(item => item.key === key); return <span key={key}>{fa ? field?.labelFa || key : field?.labelEn || key}: {typeof value === 'boolean' ? (value ? L('Yes', 'بله') : L('No', 'خیر')) : value}</span> })}</div>}
        <div className="ticket-ops-messages">{detail.messages.map(message => <article key={message.id} className={`ticket-ops-message ${message.fromAdmin ? 'is-staff' : ''} ${message.internal ? 'is-internal' : ''}`}><div className="ticket-ops-message-head"><span className="ticket-ops-avatar">{message.fromAdmin ? 'H' : (detail.userName || detail.user).charAt(0).toUpperCase()}</span><strong>{message.internal ? L('Internal note · staff only', 'یادداشت داخلی · فقط کارکنان') : message.fromAdmin ? L('Support team', 'تیم پشتیبانی') : detail.userName || detail.user}</strong><time>{date(message.createdAt)}</time></div><div className="ticket-message-body" dangerouslySetInnerHTML={{ __html: message.body }} /><TicketAttachmentList files={message.attachments} /></article>)}</div>
        <form className="ticket-ops-reply" onSubmit={send}><label>{internalNote ? L('Internal note', 'یادداشت داخلی') : L('Reply to customer', 'پاسخ به کاربر')}</label><RichEditor ticketMode compact value={reply} onChange={setReply} dir={fa ? 'rtl' : 'ltr'} minHeight={118} placeholder={internalNote ? L('Visible to staff only…', 'فقط برای کارکنان قابل مشاهده است…') : L('Write a clear, helpful response…', 'پاسخ روشن و مفید خود را بنویسید…')} /><TicketAttachmentPicker files={replyFiles} onChange={setReplyFiles} disabled={busy} /><div className="ticket-ops-reply-actions"><div className="ticket-ops-reply-options"><label><input type="checkbox" checked={internalNote} onChange={e => { setInternalNote(e.target.checked); if (e.target.checked) setCloseAfterReply(false) }} /> {L('Internal note', 'یادداشت داخلی')}</label><label><input type="checkbox" checked={closeAfterReply} disabled={internalNote} onChange={e => setCloseAfterReply(e.target.checked)} /> {L('Close after sending', 'بستن پس از ارسال')}</label></div><button className="btn btn-primary" disabled={busy}>{busy ? L('Sending…', 'در حال ارسال…') : internalNote ? L('Save note', 'ثبت یادداشت') : L('Send reply', 'ارسال پاسخ')}</button></div></form></> : <div className="ticket-welcome"><div className="ticket-welcome-icon">✦</div><h2>{L('Select a conversation', 'یک گفتگو انتخاب کنید')}</h2><p>{L('Choose a ticket from the inbox to review its context and reply.', 'برای بررسی جزئیات و پاسخ، تیکتی از صندوق انتخاب کنید.')}</p></div>}</div>
    </div>
  </section>
}
