'use client'
import { useEffect, useState } from 'react'
import { useI18n } from '@/i18n/LocaleProvider'
import { guidePlatforms, platformNames, type GuidePlatform, type ConnectionGuideConfig, type PlatformGuide } from '@/modules/site/domain/connection-guide'

export default function GuideEditor() {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const [config, setConfig] = useState<ConnectionGuideConfig | null>(null)
  const [platform, setPlatform] = useState<GuidePlatform>('android')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  async function load() {
    setMessage('')
    try {
      const response = await fetch('/api/admin/connection-guide', { cache: 'no-store' })
      if (!response.ok) throw Error()
      setConfig(await response.json())
    } catch { setMessage(fa ? 'دریافت راهنما ممکن نشد.' : 'Could not load the guide.') }
  }
  useEffect(() => { void load() }, [])
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('')
    try {
      const response = await fetch('/api/admin/connection-guide', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config) })
      const data = await response.json()
      if (!response.ok) throw Error(data.error)
      setMessage(fa ? 'راهنما برای تمام دستگاه‌ها ذخیره شد.' : 'Guide saved for all devices.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Save failed') }
    finally { setBusy(false) }
  }
  function update(value: Partial<PlatformGuide>) {
    setConfig(current => current ? { platforms: { ...current.platforms, [platform]: { ...current.platforms[platform], ...value } } } : null)
  }
  const fields = [['install', fa ? 'نصب برنامه' : 'Install app'], ['import', fa ? 'افزودن اشتراک' : 'Import subscription'], ['connect', fa ? 'اتصال و بررسی' : 'Connect and check'], ['troubleshoot', fa ? 'رفع خطا' : 'Troubleshooting']] as const
  return <div><h1 className="h2 mb-3">{fa ? 'راهنمای اتصال' : 'Connection guide'}</h1><p className="muted mb-4">{fa ? 'متن‌ها و لینک دانلود هر دستگاه در سایت و مینی‌اپ مشترک‌اند. لینک و QR خصوصی، خودکار از همان اشتراک کاربر گرفته می‌شود.' : 'Device instructions and download links are shared by the website and mini app. Private links and QR codes come from the user’s own subscription.'}</p>
    {!config && <button className="btn btn-ghost" onClick={load}>{fa ? 'دریافت راهنما' : 'Load guide'}</button>}
    {config && <form className="card" onSubmit={save}>
      <div className="guide-platforms" role="group" aria-label={fa ? 'دستگاه' : 'Device'}>{guidePlatforms.map(device => <button key={device} type="button" disabled={busy} aria-pressed={device === platform} onClick={() => setPlatform(device)}>{platformNames[device]}</button>)}</div>
      <fieldset disabled={busy} style={{ border: 0, padding: 0, minWidth: 0 }}>
        <label className="label">{fa ? 'لینک دانلود HTTPS (خالی برای پنهان کردن دکمه)' : 'HTTPS download URL (leave blank to hide button)'}<input className="input mt-2 mb-4" type="url" dir="ltr" maxLength={2048} value={config.platforms[platform].downloadUrl} onChange={event => update({ downloadUrl: event.target.value })} /></label>
        {fields.map(([field, label]) => <section className="mb-4" key={field}><h2 className="font-bold mb-3">{label}</h2><div className="grid-2">{(['fa', 'en'] as const).map(language => <label className="label" key={language}>{language === 'fa' ? 'فارسی' : 'English'}<textarea required rows={field === 'troubleshoot' ? 7 : 4} maxLength={4000} className="input mt-2" dir={language === 'fa' ? 'rtl' : 'ltr'} value={config.platforms[platform][field][language]} onChange={event => update({ [field]: { ...config.platforms[platform][field], [language]: event.target.value } })} /></label>)}</div></section>)}
      </fieldset>
      <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? (fa ? 'در حال ذخیره…' : 'Saving…') : (fa ? 'ذخیره راهنما برای تمام دستگاه‌ها' : 'Save guide for all devices')}</button>
    </form>}{message && <p role="status" className="mt-4">{message}</p>}
  </div>
}
