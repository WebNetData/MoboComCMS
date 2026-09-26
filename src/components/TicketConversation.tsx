'use client'
import { useEffect, useState } from 'react'
import { useI18n } from '@/i18n/LocaleProvider'
import StatusBadge from '@/components/TicketStatusBadge'
import { TicketAttachmentList, TicketAttachmentPicker, ticketFormBody, type TicketAttachmentView } from '@/components/TicketAttachments'
export default function TicketConversation({ id }: { id: number }) {
  const { locale } = useI18n(); const fa = locale === 'fa'
  const [detail, setDetail] = useState<any>(null), [reply, setReply] = useState(''), [files, setFiles] = useState<File[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState('')
  useEffect(() => {
    const abort = new AbortController(); setDetail(null); setError(''); setReply('')
    async function load() {
      try { const response = await fetch(`/api/tickets/${id}?asCustomer=1`, { cache: 'no-store', signal: abort.signal }); if (!response.ok) throw Error(); const data = await response.json(); if (!abort.signal.aborted) { setDetail(data); setError('') } }
      catch { if (!abort.signal.aborted) setError(fa ? 'دریافت گفتگو ممکن نشد.' : 'Could not load conversation.') }
    }
    void load(); const timer = setInterval(() => { if (!document.hidden) void load() }, 30000)
    return () => { abort.abort(); clearInterval(timer) }
  }, [id, fa])
  async function send(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('')
    try { const response = await fetch(`/api/tickets/${id}`, { method: 'POST', ...ticketFormBody({ message: reply, asCustomer: true }, files) }); if (!response.ok) throw Error(); setReply(''); setFiles([]); const fresh = await fetch(`/api/tickets/${id}?asCustomer=1`, { cache: 'no-store' }); if (!fresh.ok) throw Error(); setDetail(await fresh.json()) }
    catch { setError(fa ? 'ارسال یا دریافت پاسخ کامل نشد؛ گفتگو را بررسی کنید.' : 'Could not complete sending or refreshing. Check the conversation.') }
    finally { setBusy(false) }
  }
  return <section className="card mt-4"><h3 className="font-bold mb-3">{fa ? 'گفتگوی تیکت' : 'Ticket conversation'} #{id}</h3>{error && <p role="alert" className="error-text">{error}</p>}{!detail && !error && <p role="status">{fa ? 'دریافت گفتگو…' : 'Loading…'}</p>}{detail && <><StatusBadge value={detail.status} /><h4 className="font-bold mt-3">{detail.subject}</h4>{detail.subscriptionId && <p className="muted mt-2">{fa ? 'اشتراک' : 'Subscription'} #{detail.subscriptionId} · {detail.device}</p>}<div className="space-y-3 mt-4">{detail.messages.map((m: any) => <article className="card bg-soft-var" key={m.id}><small className="muted">{m.fromAdmin ? (fa ? 'پشتیبانی' : 'Support') : (fa ? 'شما' : 'You')} · {new Date(m.createdAt).toLocaleString(fa ? 'fa-IR' : 'en-US')}</small><div className="ticket-message-body mt-2" dangerouslySetInnerHTML={{ __html: m.body }} /><TicketAttachmentList files={m.attachments as TicketAttachmentView[]} /></article>)}</div><form onSubmit={send} className="mt-4"><label className="label">{fa ? 'پاسخ شما' : 'Your reply'}<textarea className="input mt-2" required maxLength={4000} rows={3} disabled={busy} value={reply} onChange={e => setReply(e.target.value)} /></label><TicketAttachmentPicker files={files} onChange={setFiles} disabled={busy} /><button className="btn btn-primary mt-3" disabled={busy}>{busy ? (fa ? 'ارسال…' : 'Sending…') : (fa ? 'ارسال پاسخ' : 'Send reply')}</button></form></>}</section>
}
