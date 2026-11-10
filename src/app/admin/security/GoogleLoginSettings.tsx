'use client'

import { useEffect, useRef, useState } from 'react'
import SectionSettingsHistoryLink from '@/components/admin/SectionSettingsHistoryLink'
import { Notice } from '../store/shared'

type Settings = { enabled: boolean; clientId: string; signup: boolean; clientSecret: string; secretSaved: boolean }

/** Google sign-in for members: on/off, the OAuth client from Google Cloud, and whether new accounts may be made with it. */
export default function GoogleLoginSettings() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [saved, setSaved] = useState('')
  // The revision the next save claims; read only when saving.
  const revision = useRef('')
  const [redirectUri, setRedirectUri] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  const take = (data: { settings: Settings; settingsRevision: string; redirectUri: string }) => {
    setSettings(data.settings); setSaved(JSON.stringify(data.settings)); revision.current = data.settingsRevision; setRedirectUri(data.redirectUri)
  }
  useEffect(() => {
    let alive = true
    fetch('/api/admin/security?view=google', { cache: 'no-store' }).then(async response => {
      const data = await response.json()
      if (!response.ok) throw Error(data?.error)
      if (alive) take(data)
    }).catch(() => { if (alive) setNotice({ tone: 'error', text: 'بارگذاری تنظیمات ورود با گوگل انجام نشد؛ صفحه را تازه کنید.' }) })
    return () => { alive = false }
  }, [])

  async function save() {
    if (!settings || busy) return
    setBusy(true); setNotice(null)
    try {
      const response = await fetch('/api/admin/security?view=google', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': revision.current }, body: JSON.stringify({ enabled: settings.enabled, clientId: settings.clientId, signup: settings.signup, clientSecret: settings.clientSecret }) })
      const data = await response.json()
      if (!response.ok) throw Error(data?.error || 'ذخیره انجام نشد')
      take(data)
      setNotice({ tone: 'ok', text: data.settings.enabled ? 'ورود با گوگل روشن و ذخیره شد.' : 'تنظیمات ورود با گوگل ذخیره شد.' })
    } catch (error) { setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'ارتباط برقرار نشد' }) }
    finally { setBusy(false) }
  }

  async function copy() {
    try { await navigator.clipboard.writeText(redirectUri); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* the address stays selectable */ }
  }

  const set = (patch: Partial<Settings>) => settings && setSettings({ ...settings, ...patch })
  return <section className="sa-card sa-form" aria-labelledby="google-login-title" aria-busy={busy}>
    <header className="sa-card-head"><h2 id="google-login-title">ورود و ثبت‌نام با گوگل</h2></header>
    <p className="sa-hint">اعضا با حساب گوگل خود وارد می‌شوند یا حساب می‌سازند. حسابی که با همان ایمیل از قبل وجود دارد خودکار به گوگل وصل نمی‌شود؛ عضو با روش همیشگی وارد می‌شود و از «تنظیمات حساب» گوگل را وصل می‌کند. ورود دو مرحله‌ای، محدودیت‌ها و تکمیل موبایل مثل هر ورود دیگری اعمال می‌شوند.</p>
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    {settings && <>
      <ol className="sa-hint google-setup-steps">
        <li>در <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer">Google Cloud Console ↗</a> یک «OAuth client ID» از نوع «Web application» بسازید.</li>
        <li>این نشانی را در «Authorized redirect URIs» وارد کنید:
          <span className="google-redirect"><code dir="ltr">{redirectUri}</code><button type="button" className="btn btn-ghost btn-sm" onClick={() => void copy()}>{copied ? 'کپی شد' : 'کپی'}</button></span>
        </li>
        <li>شناسه و رمز کلاینت را این‌جا وارد و ذخیره کنید. اگر سرور به گوگل دسترسی مستقیم ندارد، در «پنل سرور › پروکسی» برای «ورود با گوگل» یک پیکربندی انتخاب کنید.</li>
      </ol>
      <label className="sa-field"><span>شناسهٔ کلاینت (Client ID)</span><input className="input" dir="ltr" autoComplete="off" spellCheck={false} placeholder="1234567890-abc….apps.googleusercontent.com" value={settings.clientId} disabled={busy} onChange={event => set({ clientId: event.target.value })} /></label>
      <label className="sa-field"><span>رمز کلاینت (Client secret)</span><input className="input" dir="ltr" type="password" autoComplete="new-password" spellCheck={false} placeholder={settings.secretSaved ? '•••••••• ذخیره شده — برای تغییر، رمز تازه را وارد کنید' : 'GOCSPX-…'} value={settings.clientSecret} disabled={busy} onChange={event => set({ clientSecret: event.target.value })} /></label>
      <p className="sa-hint">رمز رمزنگاری‌شده ذخیره می‌شود و دیگر نمایش داده نمی‌شود.</p>
      <label className="sa-check"><input type="checkbox" checked={settings.signup} disabled={busy} onChange={event => set({ signup: event.target.checked })} /><span>ساخت حساب تازه با گوگل<small className="sa-hint"> — خاموش: فقط اعضایی که گوگل را به حساب خود وصل کرده‌اند با آن وارد می‌شوند</small></span></label>
      <label className="sa-check"><input type="checkbox" checked={settings.enabled} disabled={busy} onChange={event => set({ enabled: event.target.checked })} /><span>ورود با گوگل روشن باشد</span></label>
      <div className="sa-head-actions"><button type="button" className="btn btn-primary" disabled={busy || saved === JSON.stringify(settings)} onClick={() => void save()}>{busy ? 'در حال ذخیره…' : 'ذخیرهٔ ورود با گوگل'}</button><SectionSettingsHistoryLink section="google-login" /></div>
    </>}
  </section>
}
