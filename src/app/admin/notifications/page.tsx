'use client'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import SectionSettingsHistoryLink from '@/components/admin/SectionSettingsHistoryLink'

type Policy = { readDays: number; unreadDays: number; digest: { enabled: boolean; hour: number } }
type Counts = { sent: number; notSent: number; waiting: number; failed: number }
type Receipts = {
  days: number; counted: number; total: number; channels: { sms: Counts; email: Counts; push: Counts }; digests: Counts
  failures: { id: number; channel: string; retrying: boolean; attempts: number; error: string; createdAt: string }[]
}
const fa = (n: number) => n.toLocaleString('fa-IR')
const CHANNEL: Record<string, string> = { sms: 'پیامک', email: 'ایمیل', push: 'اعلان مرورگر' }
const when = (value: string) => new Intl.DateTimeFormat('fa-IR-u-ca-persian', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tehran' }).format(new Date(value))

/** Member notifications: how long they are kept, the daily summary email, and what delivery came to. */
export default function AdminNotificationsPage() {
  const [policy, setPolicy] = useState<Policy | null>(null)
  const [receipts, setReceipts] = useState<Receipts | null>(null)
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState('')
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)

  const load = useCallback(async () => {
    const response = await fetch('/api/admin/notifications', { cache: 'no-store' }).catch(() => null)
    const body = await response?.json().catch(() => null)
    if (response?.ok) { setPolicy(body.policy); setReceipts(body.receipts); setRevision(body.revision) }
    else setMessage({ text: body?.error || 'دریافت اطلاعات ناموفق بود', error: true })
  }, [])
  useEffect(() => { void load() }, [load])

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!policy) return
    if ((policy.readDays > 0 || policy.unreadDays > 0) && !window.confirm('اعلان‌های قدیمی‌تر از این مهلت برای همیشه از صندوق کاربران پاک می‌شوند. ادامه می‌دهید؟')) return
    setBusy(true); setMessage(null)
    const response = await fetch('/api/admin/notifications', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': revision }, body: JSON.stringify({ policy }) }).catch(() => null)
    const body = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) { setMessage({ text: body?.error || 'ذخیره انجام نشد', error: true }); return }
    setPolicy(body.policy); setRevision(body.revision); setMessage({ text: 'ذخیره شد.', error: false })
  }

  if (!policy || !receipts) return <div className="sa" dir="rtl">{message ? <p className="sa-notice is-error" role="alert">{message.text}</p> : <p className="sa-sub">در حال دریافت…</p>}</div>
  const rows: [string, Counts][] = [['sms', receipts.channels.sms], ['email', receipts.channels.email], ['push', receipts.channels.push]]

  return <div className="sa" dir="rtl">
    <header className="sa-head"><div><h1>اعلان‌های کاربران</h1><p className="sa-sub">صندوق اعلان هر کاربر، خلاصهٔ روزانهٔ ایمیلی و وضعیت رسیدنِ نسخه‌های پیامک، ایمیل و مرورگر.</p></div></header>
    {message && <p className={`sa-notice ${message.error ? 'is-error' : 'is-ok'}`} role={message.error ? 'alert' : 'status'}>{message.text}</p>}
    <SectionSettingsHistoryLink section="notifications" />

    <section className="sa-card">
      <header className="sa-card-head"><h2>رسید تحویل ({fa(receipts.days)} روز اخیر)</h2><span className="sa-sub">{fa(receipts.total)} نسخه</span></header>
      <div className="sa-table-wrap"><table className="data sa-table" style={{ minWidth: 0 }}>
        <thead><tr><th>کانال</th><th>رسید</th><th>فرستاده نشد</th><th>در صف</th><th>ناموفق</th></tr></thead>
        <tbody>
          {rows.map(([key, counts]) => <tr key={key}><td>{CHANNEL[key]}</td><td className="num">{fa(counts.sent)}</td><td className="num">{fa(counts.notSent)}</td><td className="num">{fa(counts.waiting)}</td><td className="num">{counts.failed ? <b style={{ color: 'var(--sa-danger)' }}>{fa(counts.failed)}</b> : fa(0)}</td></tr>)}
          <tr><td>خلاصهٔ روزانه (ایمیل)</td><td className="num">{fa(receipts.digests.sent)}</td><td className="num">{fa(receipts.digests.notSent)}</td><td className="num">{fa(receipts.digests.waiting)}</td><td className="num">{receipts.digests.failed ? <b style={{ color: 'var(--sa-danger)' }}>{fa(receipts.digests.failed)}</b> : fa(0)}</td></tr>
        </tbody>
      </table></div>
      <p className="sa-sub">«فرستاده نشد» خطا نیست: کاربر آن کانال را برای آن نوع اعلان خاموش کرده، نشانی یا شماره ندارد، یا آن کانال روی سایت راه‌اندازی نشده است. رسیدها یک هفته نگه داشته می‌شوند.{receipts.counted < receipts.total ? ` شمارش روی ${fa(receipts.counted)} نسخهٔ آخر انجام شده است.` : ''}</p>
      {receipts.failures.length > 0 && <>
        <h3 className="sa-sub">آخرین خطاها</h3>
        <ul className="sa-rows">{receipts.failures.map((row) => <li key={row.id}><span className="sa-grow"><b>{CHANNEL[row.channel] || row.channel}</b><small dir="auto">{row.error || '—'}</small></span><small className="sa-sub">{row.retrying ? `تلاش ${fa(row.attempts)}؛ دوباره امتحان می‌شود` : 'متوقف شد'} · {when(row.createdAt)}</small></li>)}</ul>
      </>}
    </section>

    <form className="sa-card sa-form" onSubmit={save}>
      <header className="sa-card-head"><h2>نگهداری و خلاصهٔ روزانه</h2></header>
      <div className="sa-grid">
        <label className="sa-field"><span>اعلانِ خوانده‌شده چند روز بماند؟ (صفر = همیشه)</span><input className="input num" type="number" min={0} max={3650} value={policy.readDays} onChange={(e) => setPolicy({ ...policy, readDays: Number(e.target.value) })} /><small className="sa-sub">پیشنهاد: ۹۰ روز</small></label>
        <label className="sa-field"><span>هر اعلان، خوانده یا نخوانده، حداکثر چند روز بماند؟ (صفر = همیشه)</span><input className="input num" type="number" min={0} max={3650} value={policy.unreadDays} onChange={(e) => setPolicy({ ...policy, unreadDays: Number(e.target.value) })} /><small className="sa-sub">پیشنهاد: ۳۶۵ روز</small></label>
      </div>
      <label className="sa-check"><input type="checkbox" checked={policy.digest.enabled} onChange={(e) => setPolicy({ ...policy, digest: { ...policy.digest, enabled: e.target.checked } })} />روزی یک ایمیلِ خلاصه از اعلان‌های خوانده‌نشده فرستاده شود</label>
      <div className="sa-grid">
        <label className="sa-field"><span>ساعت ارسال خلاصه (به وقت تهران)</span><input className="input num" type="number" min={0} max={23} value={policy.digest.hour} disabled={!policy.digest.enabled} onChange={(e) => setPolicy({ ...policy, digest: { ...policy.digest, hour: Number(e.target.value) } })} /></label>
      </div>
      <p className="sa-sub">خلاصه فقط اعلان‌هایی را می‌آورد که خودشان ایمیل جدا ندارند (مثل پاسخ و واکنش تالار) و فقط برای کاربری می‌رود که چیزی نخوانده دارد. هر کاربر می‌تواند آن را از تنظیمات اعلان خودش خاموش کند. ارسال ایمیل باید در «ایمیل» روشن باشد.</p>
      <div className="sa-head-actions"><button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'در حال ذخیره…' : 'ذخیره'}</button></div>
    </form>
  </div>
}
