'use client'
import { useEffect, useState } from 'react'
import { libraryApi } from './api'
import OrganizationFields from './OrganizationFields'
import type { AssetOrganization } from '@/modules/downloads/domain/organization'
import JalaliDateInput from '@/components/date/JalaliDateInput'
type Transfer = { id: string; name: string; host: string; status: string; runAt: string; attempts: number; error: string; url: string }
const labels: Record<string, string> = { QUEUED: 'در صف', RUNNING: 'در حال انتقال', READY: 'آماده', FAILED: 'ناموفق', PAUSED: 'متوقف: بررسی دسترسی', CANCELLED: 'لغوشده' }
export default function TransferPanel({ folderId, onChange }: { folderId: number | null; onChange: () => void }) {
  const [organization,setOrganization]=useState<AssetOrganization>({section:''})
  const [items, setItems] = useState<Transfer[]>([]), [url, setUrl] = useState(''), [name, setName] = useState(''), [kind, setKind] = useState('image'), [mode, setMode] = useState('queued'), [at, setAt] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  async function load(signal?: AbortSignal) { const r = await fetch('/api/admin/media/library?view=transfers', { signal, cache: 'no-store' }); if (!r.ok) throw new Error('دریافت انتقال‌ها انجام نشد'); setItems((await r.json()).items) }
  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal).catch(e => { if (!controller.signal.aborted) setError(String(e.message)) })
    const timer = setInterval(() => { void load(controller.signal).catch(() => undefined) }, 10000)
    return () => { controller.abort(); clearInterval(timer) }
  }, [])
  async function command(input: Record<string, unknown>) {
    setBusy(true); setError('')
    try { await libraryApi(input); await load(); onChange() } catch (e) { setError(e instanceof Error ? e.message : 'عملیات انجام نشد') } finally { setBusy(false) }
  }
  return <section className="mcl-transfers" aria-label="انتقال از لینک">
    <div><h3>فایل‌های بیرونی، در کتابخانهٔ شما</h3><p>لینک عمومی را وارد کنید؛ فایل در پوشهٔ انتخاب‌شده ذخیره می‌شود. انتقال‌های زمان‌بندی‌شده با زمان‌بند فعلی سایت اجرا می‌شوند.</p></div>
    <form className="mcl-transfer-form" onSubmit={e => { e.preventDefault(); if (mode === 'scheduled' && !at) { setError('زمان انتقال را مشخص کنید'); return } void command({ action: 'transfer.create', url, name, kind, folderId, organization, mode, ...(mode === 'scheduled' ? { runAt: new Date(at).toISOString() } : {}) }) }}>
      <label>نشانی مستقیم<input type="url" dir="ltr" className="input" placeholder="https://example.com/image.webp" required value={url} onChange={e => setUrl(e.target.value)} /></label>
      <label>نام دلخواه<input className="input" maxLength={120} value={name} onChange={e => setName(e.target.value)} /></label>
      <label>نوع انتقال<select className="select" value={kind} onChange={e => setKind(e.target.value)}><option value="image">تصویر (بهینه‌سازی WebP)</option><option value="file">فایل، ویدئو یا صوت (اصل فایل)</option></select></label>
      {folderId?<small>پوشهٔ انتخابی اولویت دارد؛ برای پوشه‌بندی خودکار به ریشهٔ کتابخانه بروید.</small>:<OrganizationFields value={organization} onChange={setOrganization} kind={kind==='image'?'image':'file'}/>}
      <label>زمان انتقال<select className="select" value={mode} onChange={e => setMode(e.target.value)}><option value="queued">در پس‌زمینه</option><option value="immediate">همین حالا</option><option value="scheduled">زمان‌بندی</option></select></label>
      {mode === 'scheduled' && <label>تاریخ و ساعت<JalaliDateInput withTime className="input" required value={at} onChange={(value) => setAt(value)} /></label>}
      <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'در حال پردازش…' : '↓ انتقال به کتابخانه'}</button>
    </form>
    {error && <p role="alert" className="error-text">{error}</p>}
    <p className="muted">تا پایان انتقالِ پس‌زمینه، نشانی محلی به منبع اصلی هدایت می‌شود. خاموشی سرور، اجرای زمان‌بندی را تا روشن‌شدن آن عقب می‌اندازد.</p>
    <ul className="mcl-transfer-list">{items.map(transfer => <li key={transfer.id}><div><strong>{transfer.name}</strong><small dir="ltr">{transfer.host}</small></div><span className={`mcl-status is-${transfer.status.toLowerCase()}`}>{labels[transfer.status]}</span><time>{new Date(transfer.runAt).toLocaleString('fa-IR')}</time>{transfer.error && <small className="error-text">{transfer.error}</small>}<div className="mcl-actions">{['FAILED', 'PAUSED', 'CANCELLED'].includes(transfer.status) && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void command({ action: 'transfer.retry', id: transfer.id })}>تلاش مجدد</button>}{['QUEUED', 'RUNNING', 'FAILED', 'PAUSED'].includes(transfer.status) && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void command({ action: 'transfer.cancel', id: transfer.id })}>لغو</button>}{transfer.status === 'READY' && <a href={transfer.url} className="btn btn-ghost btn-sm" target="_blank" rel="noopener noreferrer">مشاهده ↗</a>}</div></li>)}</ul>
  </section>
}
