'use client'

import { useEffect, useRef, useState } from 'react'

const REASONS = [
  { id: 'BROKEN', label: 'لینک کار نمی‌کند / خطا می‌دهد' },
  { id: 'WRONG_FILE', label: 'فایل اشتباه یا ناقص است' },
  { id: 'PASSWORD', label: 'رمز فایل درست نیست' },
  { id: 'SLOW', label: 'سرعت دانلود خیلی کم است' },
  { id: 'OTHER', label: 'مشکل دیگر' },
]

const NOTICES: Record<string, { text: string; tone: 'warn' | 'error' }> = {
  expired: { text: 'لینک دانلود منقضی شده بود. لینک‌های پایین تازه ساخته شده‌اند؛ دوباره روی دکمهٔ دانلود بزنید.', tone: 'warn' },
  limit: { text: 'به سقف دانلود روزانهٔ خود رسیده‌اید. فردا دوباره امتحان کنید یا با اشتراک VIP بدون محدودیت دانلود کنید.', tone: 'error' },
  removed: { text: 'این لینک غیرفعال شده است. از لینک‌های دیگر استفاده کنید یا خرابی را گزارش دهید.', tone: 'error' },
}

/** Explains why a download bounced back to the page (?dl=expired|limit|removed). */
export function DownloadNotice() {
  const [notice, setNotice] = useState('')
  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get('dl') || ''
    if (!NOTICES[value]) return
    setNotice(value)
    // Drop the flag so a refresh does not repeat the message.
    const url = new URL(window.location.href)
    url.searchParams.delete('dl')
    window.history.replaceState(null, '', url.toString())
  }, [])
  if (!notice) return null
  const item = NOTICES[notice]
  return (
    <div className={`md-dl-notice is-${item.tone}`} role="alert">
      <span>{item.text}</span>
      {notice === 'limit' && <a href="/vip" className="btn btn-primary btn-sm">اشتراک VIP</a>}
      <button type="button" onClick={() => setNotice('')} aria-label="بستن">✕</button>
    </div>
  )
}

/** "Report a problem" for one download link. */
export function ReportLinkButton({ linkId, label }: { linkId: number; label: string }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [reason, setReason] = useState('BROKEN')
  const [note, setNote] = useState('')
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setState('busy')
    const response = await fetch(`/api/media/link/${linkId}/report`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason, note }) }).catch(() => null)
    const data = await response?.json().catch(() => null)
    if (response?.ok) { setState('done'); setMessage('گزارش ثبت شد. ممنون! تیم ما لینک را بررسی می‌کند.') }
    else { setState('error'); setMessage(data?.error || 'ثبت گزارش انجام نشد؛ کمی بعد دوباره امتحان کنید.') }
  }

  return (
    <>
      <button type="button" className="md-report" onClick={() => { setState('idle'); setMessage(''); dialog.current?.showModal() }} title="گزارش خرابی لینک" aria-label={`گزارش خرابی: ${label}`}>⚠</button>
      <dialog ref={dialog} className="md-report-dialog" aria-labelledby={`report-${linkId}`} onClick={(e) => { if (e.target === dialog.current) dialog.current?.close() }}>
        <form onSubmit={submit} method="dialog">
          <h3 id={`report-${linkId}`}>گزارش مشکل لینک</h3>
          <p className="muted">{label}</p>
          {state === 'done' ? <p className="md-report-done" role="status">{message}</p> : (
            <>
              <fieldset>
                <legend className="sr-only">نوع مشکل</legend>
                {REASONS.map((item) => (
                  <label key={item.id} className="md-report-option">
                    <input type="radio" name={`reason-${linkId}`} value={item.id} checked={reason === item.id} onChange={() => setReason(item.id)} />
                    {item.label}
                  </label>
                ))}
              </fieldset>
              <textarea className="input" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="توضیح (اختیاری): مثلاً پیام خطا یا حجم فایل دانلودشده" aria-label="توضیح" />
              {state === 'error' && <p className="error-text" role="alert">{message}</p>}
            </>
          )}
          <div className="md-report-actions">
            {state !== 'done' && <button className="btn btn-primary btn-sm" disabled={state === 'busy'}>{state === 'busy' ? 'در حال ارسال…' : 'ثبت گزارش'}</button>}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => dialog.current?.close()}>{state === 'done' ? 'بستن' : 'انصراف'}</button>
          </div>
        </form>
      </dialog>
    </>
  )
}
