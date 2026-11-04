'use client'

import { useEffect, useState } from 'react'
import { HUMAN_SURFACES, type HumanCheckSettings as Settings } from '@/modules/identity/domain/human-check'
import SectionSettingsHistoryLink from '@/components/admin/SectionSettingsHistoryLink'
import { Notice } from '../store/shared'

/** The existing Identity security policy screen owns all human-check controls. */
export default function HumanCheckSettings() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [saved, setSaved] = useState('')
  const [revision, setRevision] = useState('')
  const [turnstile, setTurnstile] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  useEffect(() => {
    let alive = true
    fetch('/api/admin/security?view=human-check', { cache: 'no-store' }).then(async response => {
      const data = await response.json()
      if (!alive) return
      if (!response.ok) throw Error(data?.error || 'بارگذاری تنظیمات کپچا انجام نشد')
      setSettings(data.settings); setSaved(JSON.stringify(data.settings)); setRevision(data.settingsRevision); setTurnstile(data.turnstileReady)
    }).catch(() => { if (alive) setNotice({ tone: 'error', text: 'بارگذاری تنظیمات کپچا انجام نشد؛ صفحه را تازه کنید.' }) })
    return () => { alive = false }
  }, [])

  async function save() {
    if (!settings || busy) return
    setBusy(true); setNotice(null)
    try {
      const response = await fetch('/api/admin/security?view=human-check', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': revision }, body: JSON.stringify(settings) })
      const data = await response.json()
      if (!response.ok) throw Error(data?.error || 'ذخیره انجام نشد')
      setSettings(data.settings); setSaved(JSON.stringify(data.settings)); setRevision(data.settingsRevision)
      setNotice({ tone: 'ok', text: 'تنظیمات کپچا ذخیره شد.' })
    } catch (error) { setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'ارتباط برقرار نشد' }) }
    finally { setBusy(false) }
  }

  return <section className="sa-card sa-form" aria-labelledby="human-check-title" aria-busy={busy}>
    <header className="sa-card-head"><h2 id="human-check-title">کپچا و محافظت از فرم‌ها</h2></header>
    <p className="sa-hint">کپچای داخلی روی همین سایت پردازش می‌شود و به سرویس خارجی نیاز ندارد. اثبات کار، هزینهٔ ارسال خودکار را بیشتر می‌کند؛ همراه با محدودیت درخواست و بررسی محتوای هر بخش استفاده می‌شود.</p>
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    {settings && <>
      <label className="sa-field"><span>روش بررسی</span><select className="input" value={settings.provider} disabled={busy} onChange={event => setSettings({ ...settings, provider: event.target.value as Settings['provider'] })}>
        <option value="builtin">کپچای داخلی — بدون وابستگی خارجی</option>
        <option value="turnstile" disabled={!turnstile}>Cloudflare Turnstile</option>
        <option value="off">خاموش در تمام بخش‌ها</option>
      </select></label>
      <p className="sa-hint">{turnstile ? 'Turnstile برای ورود، ثبت‌نام و بازیابی آماده است؛ سایر بخش‌ها با کپچای داخلی محافظت می‌شوند.' : 'برای Turnstile، کلید عمومی و کلید محرمانه را در تنظیمات محیط سرور وارد کنید. کلید محرمانه در این صفحه ذخیره نمی‌شود.'}</p>
      <label className="sa-field"><span>سختی کپچای داخلی</span><select className="input" value={settings.difficulty} disabled={busy} onChange={event => setSettings({ ...settings, difficulty: event.target.value as Settings['difficulty'] })}>
        <option value="low">سبک — مناسب دستگاه‌های ضعیف</option><option value="normal">معمولی — پیشنهادی</option><option value="high">قوی — پردازش بیشتر در مرورگر</option>
      </select></label>
      <fieldset disabled={busy}><legend>بخش‌های محافظت‌شده</legend>
        {HUMAN_SURFACES.map(surface => <label key={surface.key} className="sa-check"><input type="checkbox" checked={settings.surfaces[surface.key]} onChange={event => setSettings({ ...settings, surfaces: { ...settings.surfaces, [surface.key]: event.target.checked } })} /><span>{surface.fa}<small className="sa-hint"> — {surface.hint}</small></span></label>)}
      </fieldset>
      <p className="sa-hint">در فرم‌های محتوا، حداقل ۳ ثانیه از بارگذاری بررسی تا ارسال لازم است. هر توکن فقط یک‌بار پذیرفته می‌شود و فیلد تلهٔ پنهان نیز بررسی می‌شود. ورود با کد می‌تواند حساب تازه بسازد؛ تا وقتی ورود یا ثبت‌نام محافظت می‌شود، درخواست کد نیز کپچا دارد. خاموش‌کردن یک بخش، محدودیت درخواست و مجوزهای آن را تغییر نمی‌دهد.</p>
      <div className="sa-head-actions"><button type="button" className="btn btn-primary" disabled={busy || saved === JSON.stringify(settings)} onClick={() => void save()}>{busy ? 'در حال ذخیره…' : 'ذخیرهٔ تنظیمات کپچا'}</button><SectionSettingsHistoryLink section="human-check" /></div>
    </>}
  </section>
}
