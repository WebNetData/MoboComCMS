'use client'

import { useEffect, useState } from 'react'
import { TRACK_LANGUAGES } from '@/modules/media/domain/media'

type Prefs = { audio: '' | 'DUBBED' | 'ORIGINAL'; subtitle: string }

/** How the member likes to watch films and series: kept with the account, used by the download box and the player. */
export default function PlaybackPreference() {
  const [prefs, setPrefs] = useState<Prefs | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  useEffect(() => { fetch('/api/media/playback-prefs', { cache: 'no-store' }).then((response) => (response.ok ? response.json() : null)).then((data) => { if (data) setPrefs(data) }).catch(() => undefined) }, [])
  async function change(patch: Partial<Prefs>) {
    setBusy(true); setMessage(null)
    const response = await fetch('/api/media/playback-prefs', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy(false)
    if (response?.ok) { setPrefs(data); setMessage({ ok: true, text: 'ذخیره شد.' }) } else setMessage({ ok: false, text: 'ذخیره انجام نشد؛ دوباره تلاش کنید.' })
  }
  if (!prefs) return null
  return <section className="dash-card" aria-labelledby="playback-preference-title">
    <h2 id="playback-preference-title">ترجیح پخش فیلم و سریال</h2>
    <p className="muted">روی همهٔ دستگاه‌هایتان با همین حساب اعمال می‌شود.</p>
    <div className="form-grid">
      <label className="field"><span>اول کدام نسخه‌ها نشان داده شود؟</span>
        <select className="select" value={prefs.audio} disabled={busy} onChange={(event) => void change({ audio: event.target.value as Prefs['audio'] })}>
          <option value="">فرقی ندارد (ترتیب سایت)</option><option value="DUBBED">دوبلهٔ فارسی</option><option value="ORIGINAL">زبان اصلی</option>
        </select>
      </label>
      <label className="field"><span>زیرنویس در پخش‌کننده</span>
        <select className="select" value={prefs.subtitle} disabled={busy} onChange={(event) => void change({ subtitle: event.target.value })}>
          <option value="">انتخاب نکرده‌ام (فارسی، اگر باشد)</option><option value="off">بدون زیرنویس</option>
          {Object.entries(TRACK_LANGUAGES).map(([code, name]) => <option key={code} value={code}>{name.fa}</option>)}
        </select>
      </label>
    </div>
    {message && <p role="status" className={message.ok ? 'muted' : 'error-text'}>{message.text}</p>}
  </section>
}
