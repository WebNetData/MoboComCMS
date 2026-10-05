'use client'

import { useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import { useI18n } from '@/i18n/LocaleProvider'

type Field = 'recommendationOptIn' | 'recommendationListeningOptIn'

/** Explicit opt-in for using private library activity in recommendations; listening history has its own switch. */
export default function RecommendationPreference() {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [listening, setListening] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const apply = (data: Record<Field, unknown>) => { setEnabled(data.recommendationOptIn === true); setListening(data.recommendationListeningOptIn === true) }
  useEffect(() => {
    fetch('/api/profile', { cache: 'no-store' }).then((response) => response.ok ? response.json() : null)
      .then((data) => { if (data) apply(data) }).catch(() => undefined)
  }, [])
  async function change(field: Field, value: boolean) {
    setBusy(true); setMessage(null)
    const response = await fetch('/api/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [field]: value }) }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy(false)
    if (response?.ok) { apply(data); setMessage({ ok: true, text: fa ? 'تنظیم ذخیره شد.' : 'Saved.' }) }
    else setMessage({ ok: false, text: fa ? 'ذخیره انجام نشد؛ دوباره تلاش کنید.' : 'Could not save. Please try again.' })
  }
  return <section className="dash-card" aria-labelledby="recommendation-preference-title">
    <div className="dash-card-head"><div><h2 id="recommendation-preference-title">{fa ? 'پیشنهادهای شخصی' : 'Personal recommendations'}</h2><p>{fa ? 'انتخاب کنید آیا از علاقه‌مندی‌ها و بازدیدهای اخیر برای پیشنهاد محتوا در کتابخانهٔ شما استفاده شود.' : 'Choose whether your favorites and recent views can shape suggestions in your private library.'}</p></div></div>
    {enabled === null ? <p className="ud-muted">{fa ? 'در حال بارگذاری…' : 'Loading…'}</p> : <>
      <label className="dash-switch"><span>{fa ? 'استفاده از فعالیت من برای پیشنهاد محتوا' : 'Use my activity for recommendations'}<small>{fa ? 'پیش‌فرض خاموش است؛ هر زمان می‌توانید آن را تغییر دهید.' : 'Off by default. You can change this any time.'}</small></span><input type="checkbox" role="switch" checked={enabled} disabled={busy} onChange={(event) => void change('recommendationOptIn', event.target.checked)} /></label>
      <label className="dash-switch"><span>{fa ? 'استفاده از تاریخچهٔ شنیدن من' : 'Also use my listening history'}<small>{fa ? 'آهنگ‌هایی که کامل یا چند بار گوش داده‌اید برای پیشنهاد موسیقی به کار می‌روند. جدا از تنظیم بالا و پیش‌فرض خاموش است؛ با پاک‌کردن تاریخچهٔ شنیدن هم اثرش از بین می‌رود.' : 'Tracks you finished or played more than once shape music suggestions. Separate from the setting above and off by default; clearing your listening history removes its effect.'}{!enabled && (fa ? ' تا وقتی تنظیم بالا خاموش است اثری ندارد.' : ' Has no effect while the setting above is off.')}</small></span><input type="checkbox" role="switch" checked={listening} disabled={busy} onChange={(event) => void change('recommendationListeningOptIn', event.target.checked)} /></label>
    </>}
    <Link href="/dashboard/library" className="btn btn-ghost btn-sm">{fa ? 'دیدن کتابخانهٔ من' : 'View my library'}</Link>
    {message && <p role="status" className={`dash-note ${message.ok ? 'is-ok' : 'is-error'}`}>{message.text}</p>}
  </section>
}
