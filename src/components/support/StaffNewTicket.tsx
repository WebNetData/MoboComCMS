'use client'

import { useEffect, useState } from 'react'

type Department = [slug: string, name: { fa: string; en: string }]

/**
 * A member of staff opens a ticket to a customer: to ask for a one-time code, a missing detail of an order, anything.
 * `?new=1&user=…&subject=…` on the desk's address opens it filled in (the order page links here).
 */
export default function StaffNewTicket({ departments, fa, onCreated }: { departments: Department[]; fa: boolean; onCreated: (id: number) => void }) {
  const L = (en: string, persian: string) => (fa ? persian : en)
  const [open, setOpen] = useState(false)
  const [user, setUser] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [department, setDepartment] = useState('GENERAL')
  const [priority, setPriority] = useState('normal')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('new') !== '1') return
    setOpen(true)
    setUser(params.get('user') || '')
    setSubject(params.get('subject') || '')
  }, [])

  async function send(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true); setError(''); setDone('')
    const response = await fetch('/api/admin/tickets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user, subject, message, department, priority }) }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) { setError(data?.error || L('The ticket was not sent.', 'تیکت ارسال نشد.')); return }
    setDone(L(`Ticket #${data.id} was sent to ${data.user?.name || data.user?.email || ''}.`, `تیکت شمارهٔ ${Number(data.id).toLocaleString('fa-IR')} برای ${data.user?.name || data.user?.email || 'کاربر'} فرستاده شد.`))
    setSubject(''); setMessage('')
    onCreated(data.id)
  }

  const list: Department[] = departments.some(([slug]) => slug === 'GENERAL') ? departments : [['GENERAL', { fa: 'عمومی', en: 'General' }], ...departments]
  return <div className="stk">
    <button type="button" className="btn btn-primary stk-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? L('Close', 'بستن') : L('+ New ticket to a customer', '+ تیکت جدید به کاربر')}</button>
    {open && <form className="stk-form" onSubmit={send}>
      <p className="stk-lead">{L('The customer sees this among their tickets and is told in their inbox. Use it to ask for a one-time code or a missing detail.', 'کاربر این تیکت را در فهرست تیکت‌های خودش می‌بیند و در صندوق پیام‌هایش خبردار می‌شود. برای خواستن کد یک‌بارمصرف یا اطلاعاتِ کمِ یک سفارش از همین استفاده کنید.')}</p>
      <div className="stk-grid">
        <label><span>{L('Customer', 'کاربر')}</span><input className="input" required value={user} onChange={(e) => setUser(e.target.value)} placeholder={L('Account number, e-mail or phone', 'شناسهٔ کاربر، ایمیل یا شماره موبایل')} dir="auto" /></label>
        <label><span>{L('Subject', 'موضوع')}</span><input className="input" required maxLength={200} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={L('e.g. The one-time code of your order', 'مثلاً: کد یک‌بارمصرف سفارش شما')} /></label>
        <label><span>{L('Department', 'دپارتمان')}</span><select className="input" value={department} onChange={(e) => setDepartment(e.target.value)}>{list.map(([slug, name]) => <option key={slug} value={slug}>{fa ? name.fa : name.en}</option>)}</select></label>
        <label><span>{L('Priority', 'اولویت')}</span><select className="input" value={priority} onChange={(e) => setPriority(e.target.value)}><option value="low">{L('Low', 'کم')}</option><option value="normal">{L('Normal', 'عادی')}</option><option value="high">{L('High', 'فوری')}</option></select></label>
        <label className="is-wide"><span>{L('Message', 'متن پیام')}</span><textarea className="input" required rows={5} maxLength={6000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={L('What do you need from the customer?', 'از کاربر چه می‌خواهید؟')} dir="auto" /></label>
      </div>
      {error && <p className="ticket-alert" role="alert">{error}</p>}
      {done && <p className="stk-done" role="status">{done}</p>}
      <button className="btn btn-primary" disabled={busy}>{busy ? L('Sending…', 'در حال ارسال…') : L('Send to the customer', 'ارسال برای کاربر')}</button>
    </form>}
  </div>
}
