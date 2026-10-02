'use client'

import { useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import { useI18n } from '@/i18n/LocaleProvider'

/** Explicit opt-in for using private library activity in recommendations. */
export default function RecommendationPreference() {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  useEffect(() => {
    fetch('/api/profile', { cache: 'no-store' }).then((response) => response.ok ? response.json() : null)
      .then((data) => { if (data) setEnabled(data.recommendationOptIn === true) }).catch(() => undefined)
  }, [])
  async function change(value: boolean) {
    setBusy(true); setMessage(null)
    const response = await fetch('/api/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recommendationOptIn: value }) }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy(false)
    if (response?.ok) { setEnabled(data.recommendationOptIn === true); setMessage({ ok: true, text: fa ? 'تنظیم ذخیره شد.' : 'Saved.' }) }
    else setMessage({ ok: false, text: fa ? 'ذخیره انجام نشد؛ دوباره تلاش کنید.' : 'Could not save. Please try again.' })
  }
  return <section className="dash-card" aria-labelledby="recommendation-preference-title">
    <div className="dash-card-head"><div><h2 id="recommendation-preference-title">{fa ? 'پیشنهادهای شخصی' : 'Personal recommendations'}</h2><p>{fa ? 'انتخاب کنید آیا از علاقه‌مندی‌ها و بازدیدهای اخیر برای پیشنهاد محتوا در کتابخانهٔ شما استفاده شود.' : 'Choose whether your favorites and recent views can shape suggestions in your private library.'}</p></div></div>
    {enabled === null ? <p className="ud-muted">{fa ? 'در حال بارگذاری…' : 'Loading…'}</p> : <label className="dash-switch"><span>{fa ? 'استفاده از فعالیت من برای پیشنهاد محتوا' : 'Use my activity for recommendations'}<small>{fa ? 'پیش‌فرض خاموش است؛ هر زمان می‌توانید آن را تغییر دهید.' : 'Off by default. You can change this any time.'}</small></span><input type="checkbox" role="switch" checked={enabled} disabled={busy} onChange={(event) => void change(event.target.checked)} /></label>}
    <Link href="/dashboard/library" className="btn btn-ghost btn-sm">{fa ? 'دیدن کتابخانهٔ من' : 'View my library'}</Link>
    {message && <p role="status" className={`dash-note ${message.ok ? 'is-ok' : 'is-error'}`}>{message.text}</p>}
  </section>
}
