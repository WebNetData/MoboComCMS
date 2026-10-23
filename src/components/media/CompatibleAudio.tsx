'use client'
import { useEffect, useState } from 'react'
import { libraryApi } from './api'

type Inspection = { revision: number; duration: number; tracks: { index: number; codec: string; language: string; channels: number }[] }
type Job = { id: number; status: string; attempts: number; error: string; result: { url: string } | null }
const statuses: Record<string, string> = { QUEUED: 'در صف', RUNNING: 'در حال ساخت', DONE: 'آماده', FAILED: 'نیازمند بررسی' }
export default function CompatibleAudio({ assetId }: { assetId: string }) {
  const [info, setInfo] = useState<Inspection | null>(null), [stream, setStream] = useState(''), [jobs, setJobs] = useState<Job[]>([])
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [version, setVersion] = useState(0)
  useEffect(() => {
    const c = new AbortController()
    const read = async () => {
      try {
        const r = await fetch('/api/admin/media/library?view=audio', { cache: 'no-store', signal: c.signal })
        if (!r.ok) throw Error('فهرست پردازش‌ها بارگیری نشد')
        const data = await r.json(); if (!c.signal.aborted) { setJobs(data.items); if (!data.items.some((job: Job) => job.status === 'QUEUED' || job.status === 'RUNNING')) clearInterval(timer) }
      } catch { if (!c.signal.aborted) setMessage('فهرست پردازش‌ها بارگیری نشد؛ تازه‌سازی را بزنید') }
    }
    void read(); const timer = setInterval(() => void read(), 5000)
    return () => { c.abort(); clearInterval(timer) }
  }, [version])
  async function inspect() {
    setBusy(true); setMessage('')
    try { const data = await libraryApi({ action: 'audio.inspect', assetId }) as Inspection; setInfo(data); setStream(String(data.tracks[0]?.index ?? '')) }
    catch (e) { setMessage(e instanceof Error ? e.message : 'بررسی صدا انجام نشد') }
    finally { setBusy(false) }
  }
  async function create() {
    if (!info) return
    setBusy(true); setMessage('')
    try { await libraryApi({ action: 'audio.create', assetId, stream: Number(stream), revision: info.revision }); setVersion(v => v + 1); setMessage('درخواست در صف ثبت شد؛ پس از آماده‌شدن از فایل صوتی در لینک‌های فیلم استفاده کنید') }
    catch (e) { setMessage(e instanceof Error ? e.message : 'درخواست ثبت نشد') }
    finally { setBusy(false) }
  }
  return <section className="mcl-audio" aria-label="صدای سازگار با مرورگر">
    <h3>صدای سازگار با مرورگر</h3><p>برای ویدئوهایی که صدا ندارند، یک نسخهٔ صوتی AAC بسازید. تصویر و فایل اصلی حفظ می‌شوند.</p>
    <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void inspect()}>{busy ? 'لطفاً صبر کنید…' : 'بررسی ترک‌های صدا'}</button>
    {info && <><label>ترک مبدا<select className="select" value={stream} onChange={e => setStream(e.target.value)}>{info.tracks.map(track => <option key={track.index} value={track.index}>{track.language} · {track.codec} · {track.channels} کانال</option>)}</select></label><button type="button" className="btn btn-primary" disabled={busy || stream === ''} onClick={() => void create()}>ساخت فایل AAC</button></>}
    <p role="status">{message}</p>
    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setVersion(v => v + 1)}>تازه‌سازی پردازش‌ها</button>
    {jobs.length === 0 ? <p>هنوز درخواستی ثبت نشده است.</p> : <ul className="mcl-audio-jobs">{jobs.map(job => <li key={job.id}><strong>پردازش {job.id.toLocaleString('fa-IR')} · {statuses[job.status] || 'نامشخص'}</strong>{job.status === 'DONE' && job.result?.url && <><audio controls preload="none" src={job.result.url} aria-label="پیش‌شنوی صدای سازگار" /><label>لینک صدای جداگانه<input className="input" dir="ltr" readOnly value={job.result.url} onFocus={e => e.target.select()} /></label></>}{job.error && <p>پردازش کامل نشد؛ وضعیت را در پایش کارها بررسی کنید.</p>}</li>)}</ul>}
  </section>
}
