'use client'
import { useCallback, useEffect, useRef, useState } from 'react'

type Account = { id: string; label: string; connected: boolean }
type Status = { enabled: boolean; active: string; model: string; accounts: Account[]; connected: boolean }
type Model = { id: string; label: string }
const endpoint = '/api/admin/ai/chatgpt'

export default function PersonalChatGpt() {
  const [status, setStatus] = useState<Status | null>(null), [models, setModels] = useState<Model[]>([]), [model, setModel] = useState(''), [account, setAccount] = useState('')
  const [busy, setBusy] = useState(false), [consent, setConsent] = useState(false), [notice, setNotice] = useState(''), [helper, setHelper] = useState(''), [error, setError] = useState(false)
  const running = useRef(false)
  const action = useCallback(async (command: string, body: Record<string, unknown> = {}) => {
    if (running.current) return null
    running.current = true; setBusy(true); setNotice(''); setError(false)
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, action: command }) }), data = await response.json()
      if (!response.ok) throw new Error(data.error || 'اتصال انجام نشد')
      setStatus(data); setModel(data.model || ''); setAccount(data.active || '')
      if (data.models) setModels(data.models)
      if (data.helper) setHelper(data.helper)
      if (command === 'finish') { setModels([]); setHelper(''); setNotice('حساب متصل شد؛ مدل را دریافت و برای مدیریت فعال کنید') }
      else if (command === 'disconnect') { setModels([]); setHelper(''); setNotice(data.revoked ? 'اتصال قطع شد؛ روش اتصال بخش‌های متکی به این حساب را در تنظیمات زیر بررسی کنید' : 'اتصال این سایت قطع شد؛ لغو دسترسی را در تنظیمات ChatGPT هم بررسی کنید. روش اتصال بخش‌های متکی به این حساب را در تنظیمات زیر بررسی کنید') }
      else if (command === 'disable') setNotice('مصرف سهمیهٔ شخصی متوقف شد؛ روش اتصال هر بخش را در تنظیمات زیر بررسی کنید')
      else if (command === 'save') setNotice('حساب شخصی آماده شد. برای استفاده، در «سرویس و مدل هر بخش» روش اتصال «پیش‌فرض ابزارهای مدیریت» یا هر بخش دلخواه را «حساب شخصی ChatGPT» بگذارید؛ بخش‌های دیگر با تنظیم پیش‌فرض سایت کار می‌کنند.')
      return data
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'اتصال انجام نشد'); setError(true); return null }
    finally { running.current = false; setBusy(false) }
  }, [])
  useEffect(() => {
    let disposed = false
    const complete = () => {
      if (!location.hash.startsWith('#chatgpt_callback=')) return false
      const encoded = location.hash.slice('#chatgpt_callback='.length); history.replaceState(null, '', location.pathname + location.search)
      try {
        if (encoded.length > 22000) throw new Error()
        const bytes = Uint8Array.from(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)), data = JSON.parse(new TextDecoder().decode(bytes))
        void action('finish', data)
      } catch { setNotice('پاسخ ورود معتبر نیست؛ اتصال را دوباره شروع کنید'); setError(true) }
      return true
    }
    if (!complete()) void fetch(endpoint, { cache: 'no-store' }).then(async response => {
      if (response.status === 403) return
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'دریافت اتصال انجام نشد')
      if (!disposed) { setStatus(data); setModel(data.model); setAccount(data.active) }
    }).catch(cause => { if (!disposed) { setNotice(cause.message); setError(true) } })
    const onHash = () => { complete() }; window.addEventListener('hashchange', onHash)
    return () => { disposed = true; window.removeEventListener('hashchange', onHash) }
  }, [action])
  const download = () => {
    const url = URL.createObjectURL(new Blob([helper], { type: 'text/javascript;charset=utf-8' })), link = document.createElement('a')
    link.href = url; link.download = 'mobocom-chatgpt-login.cjs'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  if (!status && !notice) return null
  return <section className="card seo-form" aria-label="اتصال شخصی ChatGPT">
    <header className="seo-wide"><h2>ChatGPT شخصی برای مدیریت</h2><p className="muted">درخواست‌های مدیریتیِ حساب شما از سهمیهٔ ChatGPT استفاده می‌کنند. دستیار کاربران و سایر مدیران به این اتصال دسترسی ندارند. سهمیه تابع پلن و مجوز حساب است.</p></header>
    {notice && <p className={`xm-notice seo-wide${error ? ' is-error' : ''}`} role="status">{notice}</p>}
    {status && <>
      <p className="seo-wide">وضعیت: <strong>{status.enabled && status.connected ? 'مصرف سهمیهٔ شخصی فعال است' : status.connected ? 'متصل؛ هنوز فعال نشده' : 'اتصال برقرار نیست'}</strong></p>
      <label className="studio-field"><span>حساب ChatGPT من</span><select className="input" value={account} disabled={busy} onChange={e => setAccount(e.target.value)}><option value="">افزودن حساب دیگر</option>{status.accounts.map(item => <option key={item.id} value={item.id}>{item.label}{item.connected ? '' : ' — نیازمند ورود'}</option>)}</select></label>
      <div className="seo-actions" style={{ alignSelf: 'end' }}><button className="btn btn-ghost" type="button" disabled={busy || !account || account === status.active} onClick={() => { setModels([]); void action('select', { account }) }}>انتخاب حساب</button></div>
      <label className="studio-switch seo-wide"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />این اتصال فقط برای استفادهٔ شخصی من در مدیریت موبوکام است.</label>
      <div className="seo-actions seo-wide"><button className="btn btn-primary" type="button" disabled={busy || !consent} onClick={() => void action('begin', { account, personalUse: consent })}>{busy ? 'در حال بررسی…' : 'Continue with ChatGPT'}</button>{status.connected && <><button className="btn btn-ghost" type="button" disabled={busy} onClick={() => void action('disable')}>بازگشت به سرویس تنظیم‌شده</button><button className="btn btn-ghost" type="button" disabled={busy} onClick={() => void action('disconnect')}>قطع اتصال</button></>}</div>
      {helper && <div className="xm-notice seo-wide"><p>برای ورود رسمی روی سرور، ابزار کوچک ورود را روی کامپیوتر خودتان اجرا کنید؛ Node.js22 لازم است. سپس لینک رسمی نمایش‌داده‌شده را در مرورگر باز کنید. بعد از ورود، به همین صفحه برمی‌گردید.</p><button type="button" className="btn btn-ghost" onClick={download}>دریافت ابزار ورود</button><pre dir="ltr"><code>node mobocom-chatgpt-login.cjs</code></pre><p>درخواست ده دقیقه اعتبار دارد. رمز و کد تأیید را فقط در صفحهٔ رسمی OpenAI وارد کنید.</p></div>}
      {status.connected && <>
        <div className="seo-actions seo-wide"><button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void action('models')}>دریافت مدل‌های حساب</button></div>
        <label className="studio-field"><span>مدل حساب شخصی</span><select className="input" value={model} disabled={busy || !models.length} onChange={e => setModel(e.target.value)}><option value="">انتخاب کنید</option>{!models.length && model && <option value={model}>{model}</option>}{models.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</select></label>
        <div className="seo-actions" style={{ alignSelf: 'end' }}><button type="button" className="btn btn-primary" disabled={busy || !model} onClick={() => void action('save', { model, enabled: true })}>استفاده از سهمیه برای مدیریت</button></div>
      </>}
      <p className="muted seo-wide">با اتصال فعال، تمام‌شدن سهمیه یا خطای ورود باعث استفادهٔ خودکار از API پولی نمی‌شود. <a href="https://chatgpt.com/#settings/Usage" target="_blank" rel="noreferrer">بررسی مصرف و دسترسی‌ها در ChatGPT</a></p>
    </>}
  </section>
}
