'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useI18n } from '@/i18n/LocaleProvider'
import { reportDevices, issueTypes } from '@/modules/support/domain/incidents'
import RichEditor from '@/components/RichEditor'
import { TicketAttachmentPicker, ticketFormBody } from '@/components/TicketAttachments'

export default function SubscriptionSupport({ subscriptionId, username }: { subscriptionId: number; username: string }) {
  const { locale } = useI18n(); const fa = locale === 'fa'
  const pathname = usePathname()
  const [incidents, setIncidents] = useState<any[]>([])
  const [unavailable, setUnavailable] = useState(false)
  const [open, setOpen] = useState(false)
  const [device, setDevice] = useState('android')
  const [issueType, setIssue] = useState('connection')
  const [message, setMessage] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ticket, setTicket] = useState<number | null>(null)
  useEffect(() => {
    const abort = new AbortController()
    async function refresh() {
      try {
        const response = await fetch(`/api/incidents?subscriptionId=${subscriptionId}`, { cache: 'no-store', signal: abort.signal })
        if (!response.ok) throw Error()
        const data = await response.json()
        if (!abort.signal.aborted) { setIncidents(data); setUnavailable(false) }
      } catch { if (!abort.signal.aborted) setUnavailable(true) }
    }
    void refresh(); const timer = setInterval(() => { if (!document.hidden) void refresh() }, 60000)
    return () => { abort.abort(); clearInterval(timer) }
  }, [subscriptionId])
  const issues = fa ? ['اتصال برقرار نمی‌شود', 'کندی اتصال', 'خطای افزودن اشتراک', 'سایر مشکلات'] : ['Cannot connect', 'Slow connection', 'Import error', 'Other issue']
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (busy) return; setBusy(true); setError('')
    try {
      const response = await fetch('/api/tickets', { method: 'POST', ...ticketFormBody({ department: 'SUBSCRIPTION', subscriptionId, device, issueType, subject: `${fa ? 'مشکل اتصال اشتراک' : 'Subscription connection issue'} #${subscriptionId} — ${issues[issueTypes.indexOf(issueType as any)]}`, message }, files) })
      const data = await response.json()
      if (!response.ok) throw Error(data?.error || (fa ? 'ارسال گزارش انجام نشد؛ لطفاً دوباره تلاش کنید.' : 'Could not send the report. Please try again.'))
      setTicket(data.id); setMessage(''); setFiles([]); setOpen(false)
    } catch (e) { setError(e instanceof Error ? e.message : (fa ? 'ارسال انجام نشد' : 'Could not send')) }
    finally { setBusy(false) }
  }
  return <div className="subscription-support mt-4">
    {incidents.map(incident => <div key={incident.id} className={`service-incident ${incident.status === 'RESOLVED' ? 'is-resolved' : ''}`} role="status"><span className="badge badge-gray">{incident.status === 'RESOLVED' ? (fa ? 'رفع شده' : 'Resolved') : incident.status === 'MAINTENANCE' ? (fa ? 'تعمیر و نگهداری' : 'Maintenance') : (fa ? 'در حال بررسی' : 'Investigating')}</span><h4 className="font-bold mt-2">{fa ? incident.titleFa : incident.titleEn}</h4><p className="guide-copy">{fa ? incident.messageFa : incident.messageEn}</p><small className="muted">{fa ? 'به‌روزرسانی: ' : 'Updated: '}{new Date(incident.updatedAt).toLocaleString(fa ? 'fa-IR' : 'en-US')}</small></div>)}
    {unavailable && <p role="status" className="muted text-sm mb-2">{fa ? 'دریافت وضعیت اختلال ممکن نشد؛ گزارش مشکل همچنان در دسترس است.' : 'Incident updates are unavailable. You can still report an issue.'}</p>}
    <button className="btn btn-ghost" type="button" aria-expanded={open} onClick={() => setOpen(!open)}>{fa ? 'گزارش مشکل اتصال' : 'Report a connection issue'}</button>
    {ticket && <p role="status" className="mt-3">{fa ? 'گزارش ثبت شد.' : 'Report submitted.'} <Link className="text-link" href={`${pathname.startsWith('/miniapp') ? '/miniapp/support' : '/dashboard/tickets'}/${ticket}`}>{fa ? 'پیگیری تیکت' : 'Track ticket'} #{ticket}</Link></p>}
    {open && <form className="card mt-3" onSubmit={submit}><h4 className="font-bold mb-3">{fa ? 'گزارش برای اشتراک' : 'Report for subscription'} #{subscriptionId} · <span dir="ltr">{username}</span></h4><p className="muted mb-3">{fa ? 'نام کاربری و لینک اشتراک به تیکت پشتیبانی پیوست می‌شود.' : 'The subscription username and link will be attached to the support ticket.'}</p><fieldset disabled={busy} style={{ border: 0, padding: 0, minWidth: 0 }}><div className="grid-2"><label className="label">{fa ? 'دستگاه' : 'Device'}<select className="input mt-2" value={device} onChange={e => setDevice(e.target.value)}>{reportDevices.map(d => <option key={d} value={d}>{d === 'other' ? (fa ? 'سایر' : 'Other') : d}</option>)}</select></label><label className="label">{fa ? 'نوع مشکل' : 'Issue'}<select className="input mt-2" value={issueType} onChange={e => setIssue(e.target.value)}>{issueTypes.map((issue, i) => <option key={issue} value={issue}>{issues[i]}</option>)}</select></label></div><label className="label mt-3">{fa ? 'توضیحات و متن خطا (لینک اشتراک خودکار ثبت می‌شود)' : 'Details and error message (the subscription link is attached automatically)'}<RichEditor ticketMode value={message} onChange={setMessage} dir={fa ? 'rtl' : 'ltr'} minHeight={160} placeholder={fa ? 'شرح مشکل را بنویسید…' : 'Describe the issue…'} /></label><TicketAttachmentPicker files={files} onChange={setFiles} disabled={busy} /><button className="btn btn-primary mt-3" disabled={busy}>{busy ? (fa ? 'در حال ارسال…' : 'Sending…') : (fa ? 'ثبت گزارش' : 'Submit report')}</button></fieldset>{error && <p role="alert" className="error-text mt-3">{error}</p>}</form>}
  </div>
}
