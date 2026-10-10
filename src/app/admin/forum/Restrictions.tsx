'use client'
import { useId, useState } from 'react'
import { forumRestrictionStatus, type ForumRestrictionHistory } from '@/modules/forum/domain/restrictions'

const STATUS = { active: 'فعال', scheduled: 'زمان‌بندی‌شده', expired: 'منقضی', revoked: 'لغوشده' }
const DATE_FORMAT = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tehran' })
const date = (value: string | null) => value ? DATE_FORMAT.format(new Date(value)) : 'بدون پایان'

export default function Restrictions({ userId, disabled, onChanged }: { userId: number; disabled: boolean; onChanged: () => void }) {
  const helpId = useId()
  const [history, setHistory] = useState<ForumRestrictionHistory | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const [effect, setEffect] = useState('forum.silence')
  const [days, setDays] = useState('7')
  const [reason, setReason] = useState('')
  const [revokeReason, setRevokeReason] = useState('')
  const [selected, setSelected] = useState<number | null>(null)

  async function load(before?: number) {
    setBusy(true); setMessage(null)
    try {
      const response = await fetch(`/api/admin/forum?section=restrictions&userId=${userId}${before ? `&before=${before}` : ''}`, { cache: 'no-store' })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'دریافت تاریخچه ناموفق بود')
      const page: ForumRestrictionHistory = body
      setHistory(previous => before && previous ? { rows: [...previous.rows, ...page.rows], next: page.next } : page)
    } catch (error) { setMessage({ text: error instanceof Error ? error.message : 'دریافت تاریخچه ناموفق بود', error: true }) }
    finally { setBusy(false) }
  }
  async function change(command: Record<string, unknown>) {
    setBusy(true); setMessage(null)
    try {
      const response = await fetch('/api/admin/forum', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ section: 'restrictions', userId, ...command }) })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'ذخیرهٔ محدودیت ناموفق بود')
      setSelected(null); setRevokeReason(''); setReason('')
      await load()
      onChanged()
      setMessage(previous => previous?.error ? previous : { text: 'تغییر ثبت شد؛ سایر محدودیت‌ها حفظ شدند.', error: false })
    } catch (error) { setMessage({ text: error instanceof Error ? error.message : 'ذخیرهٔ محدودیت ناموفق بود', error: true }) }
    finally { setBusy(false) }
  }
  const unavailable = busy || disabled
  return <details className="fa-restrictions" onToggle={event => { if (event.currentTarget.open && !history && !busy) void load() }}>
    <summary>محدودیت‌های مستقل و تاریخچه</summary>
    <div className="fa-restrictions-body" aria-busy={busy}>
      <p id={helpId} className="muted">هر محدودیت جدا ثبت می‌شود. لغو یک مورد، سایر موارد را لغو نمی‌کند. این محدودیت فقط ارسال و مشارکت در انجمن و پیام خصوصی انجمن را متوقف می‌کند.</p>
      <form className="fa-restrictions-form" onSubmit={event => { event.preventDefault(); void change({ action: 'issue', effectKey: effect, days: Number(days), reason }) }}>
        <label className="studio-field"><span>نوع محدودیت</span><select className="input" value={effect} disabled={unavailable} onChange={event => setEffect(event.target.value)}><option value="forum.silence">سکوت</option><option value="forum.suspend">تعلیق انجمن</option></select></label>
        <label className="studio-field"><span>مدت (روز)</span><input className="input" type="number" min={1} max={3650} step={1} required value={days} disabled={unavailable} onChange={event => setDays(event.target.value)} /></label>
        <label className="studio-field fa-grow"><span>دلیل محدودیت</span><input className="input" required maxLength={500} value={reason} disabled={unavailable} onChange={event => setReason(event.target.value)} aria-describedby={helpId} /></label>
        <button type="submit" className="btn btn-primary btn-sm" disabled={unavailable || !reason.trim()}>افزودن محدودیت</button>
      </form>
      {message && <p role={message.error ? 'alert' : 'status'}>{message.text}</p>}
      <div className="fa-inline fa-wrap"><button type="button" className="btn btn-ghost btn-sm" disabled={unavailable} onClick={() => void load()}>تازه‌سازی تاریخچه</button>{busy && <span role="status">در حال دریافت یا ذخیره…</span>}</div>
      {history?.rows.length === 0 && <p className="muted">محدودیتی ثبت نشده است.</p>}
      <ol className="fa-restriction-list">{history?.rows.map(row => <li key={row.id}>
        <div className="fa-inline fa-wrap"><b>{row.effectKey === 'forum.silence' ? 'سکوت' : 'تعلیق انجمن'}</b><span className="badge">{STATUS[forumRestrictionStatus(row)]}</span><small className="muted">شناسه {row.id.toLocaleString('fa-IR')}</small></div>
        <p dir="auto">{row.reason || 'دلیل قدیمی ثبت نشده است'}</p>
        <small className="muted">شروع: {row.source === 'LEGACY' || row.source === 'LEGACY_EXTERNAL' ? 'در سوابق قدیمی نامشخص' : date(row.startsAt)} · پایان: {date(row.expiresAt)} · ثبت‌کننده: {row.issuedByUserId?.toLocaleString('fa-IR') || 'در سوابق قدیمی نامشخص'}</small>
        {row.revokedAt ? <p className="muted" dir="auto">لغو: {date(row.revokedAt)} · {row.revocationReason}</p> : <button type="button" className="btn btn-ghost btn-sm" disabled={unavailable} aria-label={`لغو محدودیت ${row.id}`} onClick={() => { setSelected(row.id); setRevokeReason('') }}>لغو این مورد</button>}
      </li>)}</ol>
      {history?.next && <button type="button" className="btn btn-ghost btn-sm" disabled={unavailable} onClick={() => void load(history.next!)}>سوابق بیشتر</button>}
      {selected !== null && <form className="fa-restrictions-form" onSubmit={event => { event.preventDefault(); void change({ action: 'revoke', id: selected, reason: revokeReason }) }}>
        <label className="studio-field fa-grow"><span>دلیل لغو محدودیت {selected.toLocaleString('fa-IR')}</span><input className="input" required maxLength={500} value={revokeReason} disabled={unavailable} onChange={event => setRevokeReason(event.target.value)} /></label>
        <button type="submit" className="btn btn-primary btn-sm" disabled={unavailable || !revokeReason.trim()}>تأیید لغو</button><button type="button" className="btn btn-ghost btn-sm" disabled={unavailable} onClick={() => setSelected(null)}>انصراف</button>
      </form>}
    </div>
  </details>
}
