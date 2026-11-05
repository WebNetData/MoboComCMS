'use client'
import { useCallback, useEffect, useRef, useState } from 'react'

type EventSetting = { enabled: boolean; text: string; pattern: string }
type Config = { enabled: boolean; apiKey: string; hasKey: boolean; ready: boolean; fromNumber: string; otpLogin: boolean; otpPattern: string; otpParam: string; otpText: string; adminPhones: string[]; events: Record<string, EventSetting> }
type EventDef = { id: string; audience: 'user' | 'admin'; label: string; vars: string[]; template: string }
type Log = { id: number; phone: string; event: string; kind: string; body: string; status: string; error: string; createdAt: string }
type Tab = 'settings' | 'events' | 'send' | 'log'

const STATUS: Record<string, string> = { SENT: 'ارسال شد', FAILED: 'ناموفق', SKIPPED: 'ارسال نشد' }

/** IPPanel SMS: connection, OTP login, per-event alerts, manual messages and the send log. */
export default function SmsPage() {
  const [tab, setTab] = useState<Tab>('settings')
  const [config, setConfig] = useState<Config | null>(null)
  const [events, setEvents] = useState<EventDef[]>([])
  const [log, setLog] = useState<Log[]>([])
  const [stats, setStats] = useState<Record<string, number>>({})
  const [verified, setVerified] = useState(0)
  const [apiKey, setApiKey] = useState('')
  const [send, setSend] = useState({ to: 'phone', phone: '', text: '' })
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const draftVersion = useRef(0)
  const editConfig = (next: Config) => { draftVersion.current++; setConfig(next) }
  const editApiKey = (next: string) => { draftVersion.current++; setApiKey(next) }

  const load = useCallback(async (preserveDraft = false) => {
    const version = draftVersion.current
    const response = await fetch('/api/admin/sms', { cache: 'no-store' })
    const data = await response.json().catch(() => null)
    if (!response.ok) { setMessage({ text: data?.error || 'دریافت اطلاعات ناموفق بود', error: true }); return }
    if (!preserveDraft && version === draftVersion.current) setConfig(data.config)
    setEvents(data.events); setLog(data.log); setStats(data.stats); setVerified(data.verifiedUsers)
  }, [])
  useEffect(() => { void load() }, [load])

  async function post(action: string, body: Record<string, unknown>, label: string) {
    setBusy(action); setMessage(null)
    const response = await fetch('/api/admin/sms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...body }) }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy('')
    if (!response?.ok) { setMessage({ text: data?.error || 'انجام نشد', error: true }); void load(true); return null }
    setMessage({ text: label.replace('{n}', String(data?.sent ?? '')).replace('{total}', String(data?.total ?? '')).replace('{credit}', Math.floor(Number(data?.credit || 0)).toLocaleString('fa-IR')), error: false })
    void load(true)
    return data
  }

  async function save() {
    if (!config) return
    const version = draftVersion.current
    setBusy('save'); setMessage(null)
    const response = await fetch('/api/admin/sms', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...config, apiKey: apiKey || config.apiKey }) }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy('')
    if (!response?.ok) { setMessage({ text: data?.error || 'ذخیره نشد', error: true }); return }
    const unchanged = version === draftVersion.current
    if (unchanged) { draftVersion.current++; setConfig(data.config); setApiKey('') }
    setMessage({ text: unchanged ? 'تنظیمات پیامک ذخیره شد' : 'تنظیمات پیامک ذخیره شد؛ تغییرات جدید فرم هنوز ذخیره نشده‌اند', error: false })
  }

  if (!config) return <div className="xm-page" dir="rtl">{message ? <div className="xm-notice is-error">{message.text}</div> : <div className="tb-empty">در حال بارگذاری…</div>}</div>
  const setEvent = (id: string, patch: Partial<EventSetting>) => editConfig({ ...config, events: { ...config.events, [id]: { ...config.events[id], ...patch } } })

  return <div className="xm-page ai-page" dir="rtl">
    <header className="tb-hero"><div><span className="tb-eyebrow">پیامک · IPPanel</span><h1>پنل پیامک</h1><p>ورود با کد پیامکی، اطلاع‌رسانی خودکار سفارش، پرداخت، رسید کارت به کارت و تیکت به مشتری و مدیران، و ارسال دستی پیامک.</p></div>
      <div className="ai-status"><b>{config.ready ? 'متصل و فعال' : 'غیرفعال'}</b><small>ارسال ۳۰ روز: {(stats.SENT || 0).toLocaleString('fa-IR')} · ناموفق: {(stats.FAILED || 0).toLocaleString('fa-IR')}</small>{config.ready ? <span className="badge badge-green">فعال</span> : <span className="badge">خاموش</span>}</div>
    </header>
    {message && <div className={`xm-notice${message.error ? ' is-error' : ''}`} role="status">{message.text}</div>}
    <nav className="md-chips seo-filter ai-tabs" aria-label="بخش‌های پیامک">{([['settings', 'اتصال و ورود پیامکی'], ['events', 'اطلاع‌رسانی رویدادها'], ['send', 'ارسال دستی'], ['log', 'گزارش ارسال']] as [Tab, string][]).map(([id, label]) => <button key={id} type="button" className={tab === id ? 'is-active' : ''} onClick={() => setTab(id)}>{label}</button>)}</nav>

    {tab === 'settings' && <section className="card seo-form">
      <label className="studio-switch seo-wide"><input type="checkbox" checked={config.enabled} onChange={(e) => editConfig({ ...config, enabled: e.target.checked })} />ارسال پیامک فعال باشد</label>
      <label className="studio-field"><span>کلید API (پنل IPPanel ← توسعه‌دهندگان ← کلیدهای دسترسی) {config.hasKey ? `— ذخیره‌شده: ${config.apiKey}` : ''}</span><input className="input" type="password" dir="ltr" autoComplete="off" value={apiKey} onChange={(e) => editApiKey(e.target.value)} placeholder={config.hasKey ? 'برای تغییر، کلید جدید را وارد کنید' : 'API key'} /></label>
      <label className="studio-field"><span>شمارهٔ خط ارسال</span><input className="input" dir="ltr" value={config.fromNumber} onChange={(e) => editConfig({ ...config, fromNumber: e.target.value })} placeholder="+983000505" /></label>
      <label className="studio-field seo-wide"><span>شماره‌های مدیران برای هشدارها (با ویرگول یا فاصله)</span><input className="input" dir="ltr" value={config.adminPhones.join(', ')} onChange={(e) => editConfig({ ...config, adminPhones: e.target.value.split(/[,،\s]+/).filter(Boolean) })} placeholder="09121234567, 09351234567" /></label>
      <h3 className="seo-wide">ورود با کد پیامکی (OTP)</h3>
      <label className="studio-switch seo-wide"><input type="checkbox" checked={config.otpLogin} onChange={(e) => editConfig({ ...config, otpLogin: e.target.checked })} />ورود و ثبت‌نام با شمارهٔ موبایل در صفحهٔ ورود</label>
      <label className="studio-field"><span>کد پترن OTP (پیشنهادی — سریع و بدون صف بررسی)</span><input className="input" dir="ltr" value={config.otpPattern} onChange={(e) => editConfig({ ...config, otpPattern: e.target.value })} placeholder="کد پترن تأییدشده در IPPanel" /></label>
      <label className="studio-field"><span>نام متغیر کد در پترن</span><input className="input" dir="ltr" value={config.otpParam} onChange={(e) => editConfig({ ...config, otpParam: e.target.value })} placeholder="code" /></label>
      <label className="studio-field seo-wide"><span>متن پیامک OTP (وقتی پترن ندارید) — متغیرها: {'{code}'} و {'{brand}'}</span><textarea className="input" rows={2} value={config.otpText} onChange={(e) => editConfig({ ...config, otpText: e.target.value })} /></label>
      <div className="seo-actions seo-wide">
        <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => void save()}>ذخیرهٔ تنظیمات</button>
        <button type="button" className="btn btn-ghost" disabled={!!busy || !config.hasKey} onClick={() => void post('credit', {}, 'اتصال برقرار است. اعتبار پنل: {credit} ریال')}>{busy === 'credit' ? 'در حال بررسی…' : 'بررسی اتصال و اعتبار'}</button>
      </div>
      <p className="muted seo-wide">تیک فعال‌بودن و شمارهٔ خط با «ذخیرهٔ تنظیمات» اعمال می‌شوند؛ بررسی اعتبار جای ذخیره را نمی‌گیرد. پس از ذخیره، کادر کلید خالی و نشان «ذخیره‌شده» نمایش داده می‌شود. کلید با کلید رمزنگاری سرور ذخیره می‌شود و به مرورگر برنمی‌گردد. پیامک رویدادها فقط برای شماره‌هایی ارسال می‌شود که کاربر با کد تأیید کرده و اطلاع‌رسانی پیامکی را خاموش نکرده باشد ({verified.toLocaleString('fa-IR')} کاربر).</p>
    </section>}

    {tab === 'events' && <section className="sms-events">
      <p className="muted">برای هر رویداد می‌توانید متن آزاد بنویسید، یا کد یک پترن تأییدشده در IPPanel را بدهید (سریع‌تر، بدون صف بررسی). در پترن، نام متغیرها باید دقیقاً همین نام‌ها باشد.</p>
      {(['user', 'admin'] as const).map((audience) => <div key={audience} className="sms-event-group">
        <h3>{audience === 'user' ? 'پیامک به مشتری' : 'هشدار به مدیران'}</h3>
        {events.filter((event) => event.audience === audience).map((event) => {
          const setting = config.events[event.id]
          return <article key={event.id} className={`card sms-event${setting?.enabled ? ' is-on' : ''}`}>
            <label className="studio-switch"><input type="checkbox" checked={!!setting?.enabled} onChange={(e) => setEvent(event.id, { enabled: e.target.checked })} /><b>{event.label}</b></label>
            {setting?.enabled && <>
              <label className="studio-field"><span>متن — متغیرها: {[...event.vars, 'brand'].map((name) => `{${name}}`).join(' ')}</span><textarea className="input" rows={3} value={setting.text} onChange={(e) => setEvent(event.id, { text: e.target.value })} /></label>
              <label className="studio-field"><span>یا کد پترن (اختیاری)</span><input className="input" dir="ltr" value={setting.pattern} onChange={(e) => setEvent(event.id, { pattern: e.target.value })} /></label>
            </>}
          </article>
        })}
      </div>)}
      <div className="seo-actions"><button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => void save()}>ذخیرهٔ رویدادها</button></div>
    </section>}

    {tab === 'send' && <section className="card seo-form">
      <label className="studio-field"><span>گیرنده</span><select className="input" value={send.to} onChange={(e) => setSend({ ...send, to: e.target.value })}><option value="phone">یک شماره</option><option value="verified">همهٔ کاربران تأییدشده ({verified.toLocaleString('fa-IR')})</option><option value="vip">اعضای فعال VIP</option></select></label>
      {send.to === 'phone' && <label className="studio-field"><span>شمارهٔ موبایل</span><input className="input" dir="ltr" value={send.phone} onChange={(e) => setSend({ ...send, phone: e.target.value })} placeholder="09121234567" /></label>}
      <label className="studio-field seo-wide"><span>متن پیامک ({send.text.length.toLocaleString('fa-IR')} حرف — هر ۷۰ حرف فارسی یک پیامک)</span><textarea className="input" rows={4} value={send.text} onChange={(e) => setSend({ ...send, text: e.target.value })} maxLength={700} /></label>
      <div className="seo-actions seo-wide"><button type="button" className="btn btn-primary" disabled={!!busy || send.text.trim().length < 2} onClick={() => { if (send.to === 'phone' || window.confirm('پیامک برای همهٔ گیرندگان این گروه ارسال شود؟')) void post('broadcast', send, 'ارسال شد: {n} از {total} گیرنده') }}>{busy === 'broadcast' ? 'در حال ارسال…' : 'ارسال'}</button></div>
      <p className="muted seo-wide">پیامک گروهی فقط به کاربرانی می‌رسد که شماره را تأیید کرده‌اند و اطلاع‌رسانی را خاموش نکرده‌اند. برای پیام تبلیغاتی از خط تبلیغاتی استفاده کنید؛ مخابرات گزینهٔ «لغو۱۱» را خودکار اضافه می‌کند.</p>
    </section>}

    {tab === 'log' && <div className="table-wrap card"><table className="table"><thead><tr><th>زمان</th><th>گیرنده</th><th>رویداد</th><th>متن</th><th>وضعیت</th></tr></thead><tbody>
      {log.map((row) => <tr key={row.id}>
        <td className="num">{new Date(row.createdAt).toLocaleString('fa-IR')}</td>
        <td dir="ltr" className="num">{row.phone.replace(/^\+98/, '0')}</td>
        <td><small>{row.event}</small></td>
        <td className="sms-log-body">{row.body}</td>
        <td>{row.status === 'SENT' ? <span className="badge badge-green">{STATUS[row.status]}</span> : <span className="badge badge-red" title={row.error}>{STATUS[row.status] || row.status}</span>}{row.error && <><br /><small className="muted">{row.error}</small></>}</td>
      </tr>)}
      {!log.length && <tr><td colSpan={5} className="muted">هنوز پیامکی ارسال نشده است.</td></tr>}
    </tbody></table></div>}
  </div>
}
