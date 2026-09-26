'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import RichEditor from '@/components/RichEditor'
import StatusBadge from '@/components/TicketStatusBadge'
import { useI18n } from '@/i18n/LocaleProvider'
import { departmentLabel } from '@/modules/support/domain/departments'
import type { TicketField } from '@/modules/support/domain/department-config'
import { deviceLabel, issueLabel, issueTypes, reportDevices } from '@/modules/support/domain/incidents'
import TicketSubscriptionContext from '@/components/TicketSubscriptionContext'
import { TicketAttachmentList, TicketAttachmentPicker, ticketFormBody, type TicketAttachmentView } from '@/components/TicketAttachments'

type Ticket = { id: number; subject: string; status: string; department: string; priority: string; subscriptionId: number | null; productId: number | null; updatedAt: string; messageCount: number }
type Detail = Ticket & { device: string | null; issueType: string | null; subscriptionUsername: string; subscriptionLink: string; customFields: Record<string, string | boolean>; messages: { id: number; fromAdmin: boolean; body: string; createdAt: string; attachments: TicketAttachmentView[] }[] }
type Department = { slug: string; name: string; description: string; requiresSubscription: boolean; requiresProduct: boolean; fields: TicketField[] }
type Options = { subscriptions: { id: number; name: string; username: string }[]; products: { id: number; name: string }[]; departments: Department[] }

export default function TicketCenter({ mini = false }: { mini?: boolean }) {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const L = (en: string, persian: string) => fa ? persian : en
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [options, setOptions] = useState<Options>({ subscriptions: [], products: [], departments: [] })
  const [selected, setSelected] = useState<number | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [compose, setCompose] = useState(false)
  const [department, setDepartment] = useState('')
  const [customFields, setCustomFields] = useState<Record<string, string | boolean>>({})
  const [subscriptionId, setSubscriptionId] = useState('')
  const [productId, setProductId] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [reply, setReply] = useState('')
  const [createFiles, setCreateFiles] = useState<File[]>([])
  const [replyFiles, setReplyFiles] = useState<File[]>([])
  const [device, setDevice] = useState('android')
  const [issueType, setIssueType] = useState('connection')
  const [priority, setPriority] = useState('normal')
  const [filter, setFilter] = useState('ALL')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/tickets', { cache: 'no-store' })
      if (!response.ok) throw Error()
      setTickets(await response.json())
    } catch { setError(fa ? 'دریافت تیکت‌ها ممکن نشد.' : 'Could not load tickets.') }
    finally { setLoading(false) }
  }, [fa])

  const loadOptions = useCallback(async () => {
    try {
      const response = await fetch('/api/tickets?view=options', { cache: 'no-store' })
      if (response.ok) setOptions(await response.json())
    } catch { /* Submission independently validates ownership and active status. */ }
  }, [])

  const openTicket = useCallback(async (id: number) => {
    setSelected(id); setCompose(false); setError(''); setDetail(null)
    try {
      const response = await fetch(`/api/tickets/${id}?asCustomer=1`, { cache: 'no-store' })
      if (!response.ok) throw Error()
      setDetail(await response.json())
    } catch { setError(fa ? 'دریافت گفتگو ممکن نشد.' : 'Could not load conversation.') }
  }, [fa])

  useEffect(() => {
    void refresh(); void loadOptions()
    const id = Number(new URLSearchParams(window.location.search).get('ticket'))
    if (Number.isSafeInteger(id) && id > 0) void openTicket(id)
  }, [refresh, loadOptions, openTicket])

  const filtered = useMemo(() => tickets.filter(t => filter === 'ALL' || t.status === filter), [tickets, filter])
  const selectedDepartment = options.departments.find(d => d.slug === department)
  const labelFor = (slug: string) => options.departments.find(d => d.slug === slug)?.name || (['GENERAL', 'SALES', 'SUBSCRIPTION', 'PRODUCT'].includes(slug) ? departmentLabel(slug, locale) : slug)
  const counts = { open: tickets.filter(t => t.status === 'OPEN').length, pending: tickets.filter(t => t.status === 'PENDING').length, closed: tickets.filter(t => t.status === 'CLOSED').length }
  const date = (value: string) => new Date(value).toLocaleString(fa ? 'fa-IR' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' })

  async function createTicket(event: React.FormEvent) {
    event.preventDefault(); if (busy) return
    if (!department) return setError(L('Select a department.', 'دپارتمان را انتخاب کنید.'))
    if (selectedDepartment?.requiresSubscription && !subscriptionId) return setError(L('Select an active subscription.', 'اشتراک فعال را انتخاب کنید.'))
    if (selectedDepartment?.requiresProduct && !productId) return setError(L('Select a purchased product.', 'محصول خریداری‌شده را انتخاب کنید.'))
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/tickets', { method: 'POST', ...ticketFormBody({ department, subject, message, priority, customFields, ...(selectedDepartment?.requiresSubscription ? { subscriptionId: Number(subscriptionId), device, issueType } : {}), ...(selectedDepartment?.requiresProduct ? { productId: Number(productId) } : {}) }, createFiles) })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw Error(data?.error || L('Could not create ticket.', 'ثبت تیکت ممکن نشد.'))
      setSubject(''); setMessage(''); setCreateFiles([]); setDepartment(''); setCustomFields({}); setSubscriptionId(''); setProductId(''); setPriority('normal'); setCompose(false)
      await refresh(); await openTicket(data.id)
    } catch (e) { setError(e instanceof Error ? e.message : L('Could not create ticket.', 'ثبت تیکت ممکن نشد.')) }
    finally { setBusy(false) }
  }

  async function sendReply(event: React.FormEvent) {
    event.preventDefault(); if (!selected || busy) return
    setBusy(true); setError('')
    try {
      const response = await fetch(`/api/tickets/${selected}`, { method: 'POST', ...ticketFormBody({ message: reply, asCustomer: true }, replyFiles) })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw Error(data?.error || L('Could not send reply.', 'ارسال پاسخ ممکن نشد.'))
      setReply(''); setReplyFiles([]); await openTicket(selected); await refresh()
    } catch (e) { setError(e instanceof Error ? e.message : L('Could not send reply.', 'ارسال پاسخ ممکن نشد.')) }
    finally { setBusy(false) }
  }

  return <section className={`ticket-center ${mini ? 'ticket-center-mini' : ''}`}>
    <header className="ticket-hero"><div><span className="ticket-eyebrow">MOBOCOMCMS / {L('HELP DESK', 'مرکز پشتیبانی')}</span><h1>{L('How can we help?', 'چطور می‌توانیم کمک کنیم؟')}</h1><p>{L('Choose the right team, describe your request, and follow every update in one place.', 'تیم مناسب را انتخاب کنید، درخواستتان را توضیح دهید و همهٔ پاسخ‌ها را همین‌جا پیگیری کنید.')}</p></div><button type="button" className="btn btn-primary ticket-new" onClick={() => { setCompose(true); setSelected(null); setDetail(null); setError(''); void loadOptions() }}>{L('+ New ticket', '+ تیکت جدید')}</button></header>
    <div className="ticket-stats"><div><strong>{counts.open}</strong><span>{L('Awaiting reply', 'در انتظار پاسخ')}</span></div><div><strong>{counts.pending}</strong><span>{L('Answered', 'پاسخ داده شده')}</span></div><div><strong>{counts.closed}</strong><span>{L('Resolved', 'بسته‌شده')}</span></div></div>
    {error && <div className="ticket-alert" role="alert">{error}</div>}
    <div className="ticket-layout">
      <aside className="ticket-list-pane"><div className="ticket-list-head"><h2>{L('Your tickets', 'تیکت‌های شما')}</h2><span>{tickets.length}</span></div><div className="ticket-filters" role="group" aria-label={L('Filter tickets', 'فیلتر تیکت‌ها')}>{[['ALL', L('All', 'همه')], ['OPEN', L('Awaiting reply', 'در انتظار پاسخ')], ['PENDING', L('Answered', 'پاسخ داده شده')], ['CLOSED', L('Closed', 'بسته')]].map(([key, label]) => <button type="button" key={key} className={filter === key ? 'is-active' : ''} onClick={() => setFilter(key)}>{label}</button>)}</div><div className="ticket-list-scroll">{loading && <p className="ticket-empty">{L('Loading tickets…', 'در حال دریافت تیکت‌ها…')}</p>}{!loading && filtered.length === 0 && <p className="ticket-empty">{L('No tickets in this view yet.', 'هنوز تیکتی در این بخش ندارید.')}</p>}{filtered.map(ticket => <button type="button" key={ticket.id} className={`ticket-list-item ${selected === ticket.id && !compose ? 'is-active' : ''}`} onClick={() => void openTicket(ticket.id)}><div className="ticket-list-item-top"><small>#{ticket.id} · {labelFor(ticket.department)}</small><StatusBadge value={ticket.status} /></div><strong>{ticket.subject}</strong><span>{date(ticket.updatedAt)} · {ticket.messageCount} {L('messages', 'پیام')}</span></button>)}</div></aside>
      <div className="ticket-main-pane">{compose ? <form className="ticket-compose" onSubmit={createTicket}><div className="ticket-pane-head"><div><span className="ticket-eyebrow">{L('NEW REQUEST', 'درخواست جدید')}</span><h2>{L('Create a ticket', 'ثبت تیکت')}</h2></div><button type="button" className="ticket-close" onClick={() => setCompose(false)} aria-label={L('Close form', 'بستن فرم')}>×</button></div><p className="ticket-intro">{L('Select a department so your request reaches the right team.', 'دپارتمان را انتخاب کنید تا درخواست شما به تیم درست برسد.')}</p>
        <div className="ticket-departments">{options.departments.map(item => <button type="button" key={item.slug} className={`ticket-department ${department === item.slug ? 'is-active' : ''}`} onClick={() => { setDepartment(item.slug); setCustomFields({}); setError('') }}><span className="ticket-department-mark">✦</span><strong>{item.name}</strong><small>{item.description}</small></button>)}</div>
        {selectedDepartment?.requiresSubscription && <><label className="ticket-field"><span className="ticket-field-label">{L('Affected subscription', 'اشتراک موردنظر')} <span className="ticket-required" aria-hidden="true">*</span></span><select className="input" required value={subscriptionId} onChange={e => setSubscriptionId(e.target.value)}><option value="">{L('Select an active subscription', 'اشتراک فعال را انتخاب کنید')}</option>{options.subscriptions.map(s => <option value={s.id} key={s.id}>#{s.id} · {s.name} · {s.username}</option>)}</select></label><small className="ticket-field-note">{L('The subscription username and link are attached automatically for support.', 'نام کاربری و لینک اشتراک به‌صورت خودکار برای پشتیبانی ثبت می‌شود.')}</small>{options.subscriptions.length === 0 && <p className="ticket-field-note">{L('No active subscription is available. Sales and general support remain open.', 'اشتراک فعالی پیدا نشد. دپارتمان‌های فروش و پشتیبانی عمومی در دسترس هستند.')}</p>}<div className="ticket-form-grid"><label className="ticket-field"><span className="ticket-field-label">{L('Device', 'دستگاه')}</span><select className="input" value={device} onChange={e => setDevice(e.target.value)}>{reportDevices.map(value => <option key={value} value={value}>{deviceLabel(value, locale)}</option>)}</select></label><label className="ticket-field"><span className="ticket-field-label">{L('Issue type', 'نوع مشکل')}</span><select className="input" value={issueType} onChange={e => setIssueType(e.target.value)}>{issueTypes.map(value => <option key={value} value={value}>{issueLabel(value, locale)}</option>)}</select></label></div></>}
        {selectedDepartment?.requiresProduct && <><label className="ticket-field"><span className="ticket-field-label">{L('Affected product', 'محصول موردنظر')} <span className="ticket-required" aria-hidden="true">*</span></span><select className="input" required value={productId} onChange={e => setProductId(e.target.value)}><option value="">{L('Select a purchased product', 'محصول خریداری‌شده را انتخاب کنید')}</option>{options.products.map(p => <option value={p.id} key={p.id}>#{p.id} · {p.name}</option>)}</select></label>{options.products.length === 0 && <p className="ticket-field-note">{L('No purchased active product is available.', 'محصول خریداری‌شدهٔ فعالی پیدا نشد.')}</p>}</>}
        {selectedDepartment?.fields.map(field => <label className="ticket-field" key={field.key}><span className="ticket-field-label">{fa ? field.labelFa : field.labelEn}{field.required && <span className="ticket-required" aria-hidden="true">*</span>}</span>{field.type === 'checkbox' ? <input type="checkbox" checked={customFields[field.key] === true} onChange={e => setCustomFields(current => ({ ...current, [field.key]: e.target.checked }))} /> : field.type === 'select' ? <select className="input" required={field.required} value={String(customFields[field.key] || '')} onChange={e => setCustomFields(current => ({ ...current, [field.key]: e.target.value }))}><option value="">{L('Choose…', 'انتخاب کنید…')}</option>{field.options?.map(option => <option key={option} value={option}>{option}</option>)}</select> : field.type === 'textarea' ? <textarea className="input" required={field.required} maxLength={4000} rows={4} value={String(customFields[field.key] || '')} onChange={e => setCustomFields(current => ({ ...current, [field.key]: e.target.value }))} /> : <input className="input" required={field.required} maxLength={300} value={String(customFields[field.key] || '')} onChange={e => setCustomFields(current => ({ ...current, [field.key]: e.target.value }))} />}</label>)}
        <div className="ticket-form-grid"><label className="ticket-field"><span className="ticket-field-label">{L('Subject', 'موضوع')} <span className="ticket-required" aria-hidden="true">*</span></span><input className="input" required maxLength={200} value={subject} onChange={e => setSubject(e.target.value)} placeholder={L('A short summary', 'خلاصهٔ کوتاه درخواست')} /></label><label className="ticket-field"><span className="ticket-field-label">{L('Priority', 'اولویت')}</span><select className="input" value={priority} onChange={e => setPriority(e.target.value)}><option value="low">{L('Low', 'کم')}</option><option value="normal">{L('Normal', 'معمولی')}</option><option value="high">{L('High', 'زیاد')}</option></select></label></div>
        <div className="ticket-field"><label className="ticket-field-label">{L('Details', 'توضیحات')} <span className="ticket-required" aria-hidden="true">*</span></label><RichEditor ticketMode value={message} onChange={setMessage} dir={fa ? 'rtl' : 'ltr'} minHeight={210} placeholder={L('Describe what happened and what you expected…', 'توضیح دهید چه اتفاقی افتاده و انتظار چه نتیجه‌ای داشتید…')} /><small>{L('Do not include passwords or private subscription links.', 'رمز عبور یا لینک خصوصی اشتراک را در تیکت ننویسید.')}</small></div><TicketAttachmentPicker files={createFiles} onChange={setCreateFiles} disabled={busy} /><button className="btn btn-primary ticket-submit" disabled={busy || !department}>{busy ? L('Submitting…', 'در حال ثبت…') : L('Submit ticket', 'ثبت تیکت')}</button>
      </form> : detail ? <div className="ticket-thread"><header className="ticket-pane-head"><div><span className="ticket-eyebrow">#{detail.id} / {labelFor(detail.department)}</span><h2>{detail.subject}</h2><div className="ticket-thread-meta"><StatusBadge value={detail.status} />{detail.subscriptionId && <span>{L('Subscription', 'اشتراک')} #{detail.subscriptionId}</span>}{detail.productId && <span>{L('Product', 'محصول')} #{detail.productId}</span>}{detail.device && <span>{deviceLabel(detail.device, locale)}</span>}{detail.issueType && <span>{issueLabel(detail.issueType, locale)}</span>}</div></div></header><TicketSubscriptionContext id={detail.subscriptionId} username={detail.subscriptionUsername} link={detail.subscriptionLink} />{detail.customFields && Object.keys(detail.customFields).length > 0 && <div className="ticket-ops-context">{Object.entries(detail.customFields).map(([key, value]) => { const field = options.departments.find(item => item.slug === detail.department)?.fields.find(item => item.key === key); return <span key={key}>{fa ? field?.labelFa || key : field?.labelEn || key}: {typeof value === 'boolean' ? (value ? L('Yes', 'بله') : L('No', 'خیر')) : value}</span> })}</div>}<div className="ticket-timeline">{detail.messages.map(m => <article className={`ticket-message ${m.fromAdmin ? 'from-support' : 'from-user'}`} key={m.id}><div className="ticket-message-avatar">{m.fromAdmin ? 'H' : L('Me', 'من')}</div><div className="ticket-message-card"><div className="ticket-message-head"><strong>{m.fromAdmin ? L('MoboComCMS Support', 'پشتیبانی MoboComCMS') : L('You', 'شما')}</strong><time>{date(m.createdAt)}</time></div><div className="ticket-message-body" dangerouslySetInnerHTML={{ __html: m.body }} /><TicketAttachmentList files={m.attachments} /></div></article>)}</div><form className="ticket-reply" onSubmit={sendReply}><label>{L('Your reply', 'پاسخ شما')}</label><RichEditor ticketMode compact value={reply} onChange={setReply} dir={fa ? 'rtl' : 'ltr'} minHeight={110} placeholder={L('Write your response…', 'پاسخ خود را بنویسید…')} /><TicketAttachmentPicker files={replyFiles} onChange={setReplyFiles} disabled={busy} /><button className="btn btn-primary" disabled={busy}>{busy ? L('Sending…', 'در حال ارسال…') : L('Send reply', 'ارسال پاسخ')}</button></form></div> : <div className="ticket-welcome"><div className="ticket-welcome-icon">✦</div><h2>{L('Support starts here', 'پشتیبانی از اینجا شروع می‌شود')}</h2><p>{L('Open a conversation or create a ticket to get help from our team.', 'یک گفتگو را باز کنید یا برای ارتباط با تیم ما تیکت جدید بسازید.')}</p><button type="button" className="btn btn-primary" onClick={() => { setCompose(true); void loadOptions() }}>{L('Create a ticket', 'ثبت تیکت')}</button></div>}</div>
    </div>
  </section>
}
