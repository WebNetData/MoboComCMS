'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'

type Status = { enabled: boolean; enabledAt: string | null; backupLeft: number; required: boolean }
type Setup = { secret: string; uri: string; qr: string }

/** 2-step sign-in with any authenticator app: setup with a QR code, backup codes, and turning it off. */
export default function TwoFactorCard() {
  const [status, setStatus] = useState<Status | null>(null)
  const [setup, setSetup] = useState<Setup | null>(null)
  const [codes, setCodes] = useState<string[]>([])
  const [code, setCode] = useState('')
  const [action, setAction] = useState<'' | 'disable' | 'backup'>('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => fetch('/api/account/two-factor', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then(setStatus).catch(() => null), [])
  useEffect(() => { void load() }, [load])

  async function call(body: Record<string, unknown>) {
    setBusy(true); setMsg(null)
    const response = await fetch('/api/account/two-factor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) { setMsg({ ok: false, text: data?.error || 'انجام نشد؛ دوباره تلاش کنید' }); return null }
    return data
  }

  async function begin() {
    const data = await call({ action: 'begin' })
    if (data) { setSetup(data); setCode('') }
  }

  async function confirm(e: FormEvent) {
    e.preventDefault()
    const data = await call({ action: 'confirm', code })
    if (!data) return
    setSetup(null); setCode(''); setCodes(data.codes); setMsg({ ok: true, text: 'ورود دو مرحله‌ای فعال شد.' })
    setStatus((current) => current && { ...current, enabled: true, enabledAt: new Date().toISOString(), backupLeft: data.codes.length })
    void load()
  }

  async function submitAction(e: FormEvent) {
    e.preventDefault()
    const data = await call({ action, code })
    if (!data) return
    if (action === 'backup') { setCodes(data.codes); setMsg({ ok: true, text: 'کدهای پشتیبان تازه ساخته شد؛ کدهای قبلی دیگر کار نمی‌کنند.' }) }
    else { setCodes([]); setMsg({ ok: true, text: 'ورود دو مرحله‌ای خاموش شد.' }) }
    setAction(''); setCode('')
    void load()
  }

  function download() {
    const blob = new Blob([`کدهای پشتیبان ورود دو مرحله‌ای\n${location.host}\n\n${codes.join('\n')}\n\nهر کد فقط یک بار کار می‌کند.\n`], { type: 'text/plain;charset=utf-8' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob); link.download = 'backup-codes.txt'; link.click()
    setTimeout(() => URL.revokeObjectURL(link.href), 1000)
  }

  return <section className="dash-card tf-card" id="two-factor" aria-labelledby="tf-title">
    <div className="dash-card-head">
      <div><h2 id="tf-title">ورود دو مرحله‌ای</h2><p>علاوه بر رمز یا کد پیامک، کد برنامهٔ احراز هویت گوشی (Google Authenticator، Microsoft Authenticator، Authy و …) هم لازم می‌شود.</p></div>
      {status && <span className={`tf-badge ${status.enabled ? 'is-on' : 'is-off'}`}>{status.enabled ? 'فعال' : 'غیرفعال'}</span>}
    </div>

    {status?.required && !status.enabled && <p className="dash-note is-error" role="alert">برای حساب‌های مدیریتی، فعال‌کردن ورود دو مرحله‌ای الزامی است. تا فعال نشود، پنل مدیریت در دسترس نیست.</p>}

    {codes.length > 0 && <div className="tf-codes" role="region" aria-label="کدهای پشتیبان">
      <p><b>کدهای پشتیبان را همین حالا ذخیره کنید.</b> اگر گوشی در دسترس نبود، با هر کدام یک بار می‌توانید وارد شوید. این کدها دوباره نمایش داده نمی‌شوند.</p>
      <ol dir="ltr">{codes.map((item) => <li key={item}><code>{item}</code></li>)}</ol>
      <div className="dash-actions">
        <button type="button" className="btn btn-ghost" onClick={() => void navigator.clipboard?.writeText(codes.join('\n')).then(() => setMsg({ ok: true, text: 'کپی شد' }))}>کپی</button>
        <button type="button" className="btn btn-ghost" onClick={download}>دانلود فایل</button>
        <button type="button" className="btn btn-primary" onClick={() => setCodes([])}>ذخیره کردم</button>
      </div>
    </div>}

    {!status ? <div className="pp-skeleton" style={{ height: 90 }} /> : setup ? <form onSubmit={confirm} className="tf-setup">
      <ol className="tf-steps">
        <li>برنامهٔ احراز هویت را روی گوشی باز کنید و گزینهٔ افزودن حساب را بزنید.</li>
        <li>این QR را اسکن کنید؛ یا کلید زیر را دستی وارد کنید.</li>
        <li>کد ۶ رقمی‌ای را که برنامه نشان می‌دهد وارد کنید.</li>
      </ol>
      <div className="tf-qr">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={setup.qr} alt="QR کد راه‌اندازی ورود دو مرحله‌ای" width={180} height={180} />
        <div><span>کلید دستی</span><code dir="ltr">{setup.secret}</code><a href={setup.uri} className="tf-open">باز کردن در برنامهٔ گوشی</a></div>
      </div>
      <label className="dash-field"><span>کد ۶ رقمی</span><input className="input tf-code" dir="ltr" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} required autoFocus /></label>
      {msg && <p className={`dash-note ${msg.ok ? 'is-ok' : 'is-error'}`} role="status">{msg.text}</p>}
      <div className="dash-actions"><button type="button" className="btn btn-ghost" onClick={() => { setSetup(null); setMsg(null) }}>انصراف</button><button className="btn btn-primary" disabled={busy || code.replace(/\s/g, '').length < 6}>{busy ? 'در حال بررسی…' : 'تأیید و فعال‌سازی'}</button></div>
    </form> : status.enabled ? <>
      <dl className="tf-facts">
        <div><dt>فعال از</dt><dd>{status.enabledAt ? new Date(status.enabledAt).toLocaleDateString('fa-IR', { dateStyle: 'medium' }) : '—'}</dd></div>
        <div><dt>کد پشتیبان باقی‌مانده</dt><dd className={status.backupLeft <= 2 ? 'is-low' : ''}>{status.backupLeft.toLocaleString('fa-IR')} از ۱۰</dd></div>
      </dl>
      {action ? <form onSubmit={submitAction}>
        <label className="dash-field"><span>{action === 'disable' ? 'برای خاموش‌کردن، کد برنامه یا یک کد پشتیبان را وارد کنید' : 'برای ساخت کدهای تازه، کد برنامه را وارد کنید'}</span><input className="input tf-code" dir="ltr" autoComplete="one-time-code" maxLength={11} value={code} onChange={(e) => setCode(e.target.value)} required autoFocus /></label>
        {msg && <p className={`dash-note ${msg.ok ? 'is-ok' : 'is-error'}`} role="status">{msg.text}</p>}
        <div className="dash-actions"><button type="button" className="btn btn-ghost" onClick={() => { setAction(''); setCode(''); setMsg(null) }}>انصراف</button><button className={`btn ${action === 'disable' ? 'btn-primary tf-danger' : 'btn-primary'}`} disabled={busy || code.replace(/[\s-]/g, '').length < 6}>{action === 'disable' ? 'خاموش کن' : 'ساخت کدهای تازه'}</button></div>
      </form> : <>
        {msg && <p className={`dash-note ${msg.ok ? 'is-ok' : 'is-error'}`} role="status">{msg.text}</p>}
        <div className="dash-actions">
          <button type="button" className="btn btn-ghost" onClick={() => { setAction('backup'); setMsg(null) }}>کدهای پشتیبان تازه</button>
          {!status.required && <button type="button" className="btn btn-ghost tf-off" onClick={() => { setAction('disable'); setMsg(null) }}>خاموش کردن</button>}
        </div>
      </>}
    </> : <>
      {msg && <p className={`dash-note ${msg.ok ? 'is-ok' : 'is-error'}`} role="status">{msg.text}</p>}
      <div className="dash-actions"><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void begin()}>{busy ? 'لطفاً صبر کنید…' : 'فعال‌سازی ورود دو مرحله‌ای'}</button></div>
    </>}
  </section>
}
