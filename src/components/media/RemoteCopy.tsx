'use client'
import { useEffect, useRef, useState } from 'react'
import { libraryApi } from './api'

/** Opt-in only. A delayed link stays stable while its target changes from remote to local. */
export default function RemoteCopy({ url, onCopied, kind = 'image', section = 'posts' }: { url: string; onCopied: (url: string) => void; kind?: 'image' | 'file'; section?: string }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [mode, setMode] = useState('immediate'), [at, setAt] = useState('')
  const latest = useRef(url)
  useEffect(() => { latest.current = url }, [url])
  if (!/^https?:\/\//i.test(url)) return null
  async function copy() {
    if (mode === 'scheduled' && !at) { setError('زمان انتقال را انتخاب کنید'); return }
    setBusy(true); setError('')
    const source = url
    try {
      const result = await libraryApi<{ url: string }>({ action: 'transfer.create', url: source, kind, section, mode, ...(mode === 'scheduled' ? { runAt: new Date(at).toISOString() } : {}) })
      if (latest.current === source) { onCopied(result.url); setOpen(false) }
      else setError('لینک تغییر کرده است؛ فایل در کتابخانه ذخیره می‌شود و لینک جدید جایگزین نشد')
    } catch (e) { setError(e instanceof Error ? e.message : 'انتقال انجام نشد') } finally { setBusy(false) }
  }
  return <span className="mcl-copy">
    <button className="btn btn-ghost btn-sm" type="button" aria-expanded={open} onClick={() => setOpen(!open)}>↓ انتقال به سرور سایت</button>
    {open && <span className="mcl-copy-panel">
      <label>زمان انتقال<select className="select" value={mode} onChange={e => setMode(e.target.value)} disabled={busy}><option value="immediate">همین حالا</option><option value="queued">در پس‌زمینه</option><option value="scheduled">زمان‌بندی</option></select></label>
      {mode === 'scheduled' && <label>تاریخ و ساعت<input className="input" type="datetime-local" value={at} onChange={e => setAt(e.target.value)} disabled={busy} /></label>}
      <small>با تأیید، فایل روی سرور سایت ذخیره می‌شود. در حالت پس‌زمینه، لینک سایت تا پایان انتقال به منبع اصلی هدایت می‌شود. برای اعمال لینک، فرم مطلب را ذخیره کنید.</small>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => void copy()} disabled={busy}>{busy ? 'در حال انتقال…' : 'تأیید انتقال و جایگزینی لینک'}</button>
    </span>}
    {error && <small className="error-text" role="alert">{error}</small>}
  </span>
}
