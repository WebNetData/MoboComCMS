'use client'
import { useCallback, useEffect, useState } from 'react'

type Status = { links: number; scanned: number; failed: number; reading?: number; withSubtitles: number; sidecar: number; embedded: number; waiting: number; notes: { text: string; links: number }[]; ffmpeg: boolean }
const fa = (value: number) => value.toLocaleString('fa-IR')

/** What the look for subtitles beside and inside film files found, and a way to start it over the existing links. */
export default function CinemaFoundSubtitles() {
  const [status, setStatus] = useState<Status | null>(null), [message, setMessage] = useState(''), [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    try { const r = await fetch('/api/admin/cinema/subtitles', { cache: 'no-store' }); if (!r.ok) throw new Error(); setStatus(await r.json() as Status) }
    catch { setMessage('وضعیت زیرنویس‌ها خوانده نشد') }
  }, [])
  useEffect(() => { void load() }, [load])
  async function start(again: boolean) {
    setBusy(true); setMessage('')
    try {
      const r = await fetch('/api/admin/cinema/subtitles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ again }) })
      const d = await r.json() as { started?: boolean; error?: string }
      if (!r.ok) throw new Error(d.error || 'شروع بررسی انجام نشد')
      setMessage(d.started ? 'بررسی در صف کارها قرار گرفت؛ فایل‌ها یکی‌یکی بررسی می‌شوند' : 'بررسی قبلی هنوز در جریان است')
      await load()
    } catch (e) { setMessage(e instanceof Error ? e.message : 'شروع بررسی انجام نشد') } finally { setBusy(false) }
  }
  return <div className="sa-found-subtitles">
    {status ? <>
      <p className="sa-sub">{fa(status.scanned)} از {fa(status.links)} فایل بررسی شده · {fa(status.withSubtitles)} فایل زیرنویس دارد ({fa(status.sidecar)} زیرنویس کنار ویدئو، {fa(status.embedded)} زیرنویس داخل فایل){status.failed ? ` · ${fa(status.failed)} فایل خوانده نشد` : ''}{status.reading ? ` · ${fa(status.reading)} فایل در حال خواندن کامل (در چند کار پشت سر هم)` : ''}{status.waiting ? ` · ${fa(status.waiting)} کار در صف` : ''}</p>
      {!status.ffmpeg && <p className="sa-sub">ffmpeg روی سرور نصب نیست: فقط فایل‌های زیرنویس کنار ویدئو پیدا می‌شوند، نه زیرنویس داخل فایل.</p>}
      {status.notes.length > 0 && <ul className="sa-sub">{status.notes.map(note => <li key={note.text}>{note.text} ({fa(note.links)} فایل)</li>)}</ul>}
    </> : <p className="sa-sub">در حال خواندن وضعیت…</p>}
    <p className="sa-sub">هر فایل در اولین پخش خودکار بررسی می‌شود. برای لینک‌های قبلی، بررسی را یک‌بار اجرا کنید.</p>
    <div className="flex gap-2 flex-wrap">
      <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void start(false)}>بررسی فایل‌های بررسی‌نشده</button>
      <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void start(true)}>بررسی دوبارهٔ همهٔ فایل‌ها</button>
      <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void load()}>به‌روزرسانی وضعیت</button>
    </div>
    <p role="status">{message}</p>
  </div>
}
