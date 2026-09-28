'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Notice, Pager, fa, faDate } from '../store/shared'

type Smtp = {
  enabled: boolean; mode: 'local' | 'smtp'; host: string; port: number; security: 'tls' | 'starttls' | 'none'; user: string; hasPassword: boolean
  fromName: string; fromEmail: string; replyTo: string; dailyLimit: number; notifyUsers: boolean; events: Record<string, boolean>; gmail: boolean
}
type Log = { rows: { id: number; toAddress: string; subject: string; status: string; error: string; source: string; createdAt: string }[]; page: number; pages: number; sent30: number; failed30: number; sent24: number }
type Tone = { tone: 'ok' | 'error'; text: string } | null

const EVENTS: [string, string][] = [
  ['PAYMENT_PAID', 'پرداخت تأیید شد'], ['RECEIPT_REJECTED', 'رسید کارت به کارت رد شد'], ['PAYMENT_CLOSED', 'فاکتور بسته شد'],
  ['PRODUCT_DELIVERED', 'محصول تحویل/ارسال شد'], ['DELIVERY_DELAYED', 'تأخیر در تحویل'], ['MEMBERSHIP', 'اشتراک ویژه (VIP)'],
  ['TICKET_REPLY', 'پاسخ تیکت پشتیبانی'], ['SUBSCRIPTION_EXPIRING', 'نزدیک شدن پایان اشتراک'], ['SUBSCRIPTION_EXPIRED', 'پایان اشتراک'],
  ['SUBSCRIPTION_READY', 'فعال شدن سرویس'], ['SUBSCRIPTION_RENEWED', 'تمدید سرویس'],
]
const SOURCE = (source: string) => source === 'test' ? 'آزمایشی' : source.startsWith('notify:') ? (EVENTS.find(([id]) => id === source.slice(7))?.[1] || 'اطلاع‌رسانی') : 'سایت'

async function call<T>(body: unknown): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const response = await fetch('/api/admin/email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)
  const data = await response?.json().catch(() => null)
  return response?.ok ? { ok: true, data: data as T } : { ok: false, error: data?.error || 'انجام نشد' }
}

function GmailGuide({ onUse }: { onUse: () => void }) {
  return <section className="sa-card em-guide">
    <header className="sa-card-head"><h2>ارسال با جیمیل</h2><button type="button" className="btn btn-primary btn-sm" onClick={onUse}>پر کردن تنظیمات جیمیل</button></header>
    <p className="sa-hint">ایمیل‌های سایت از طریق سرورهای گوگل ارسال می‌شوند؛ سرور سایت ایمیل‌سرور اجرا نمی‌کند و بار اضافه نمی‌گیرد. جیمیل برای ورود برنامه‌ها «رمز برنامه» می‌خواهد، نه رمز اصلی حساب:</p>
    <ol className="em-steps">
      <li>در حساب گوگل، <a className="text-link" href="https://myaccount.google.com/signinoptions/two-step-verification" target="_blank" rel="noreferrer">تأیید دومرحله‌ای</a> را روشن کنید.</li>
      <li>به <a className="text-link" href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">App passwords</a> بروید، یک نام (مثلاً «سایت») بنویسید و «Create» را بزنید.</li>
      <li>رمز ۱۶ حرفی نمایش‌داده‌شده را در فیلد «رمز» همین صفحه بچسبانید (فاصله‌ها مهم نیستند).</li>
      <li>ذخیره کنید، «بررسی اتصال» و سپس «ارسال ایمیل آزمایشی» را بزنید.</li>
    </ol>
    <p className="sa-hint">سقف جیمیل حدود ۵۰۰ ایمیل در ۲۴ ساعت است؛ سقف روزانهٔ سایت به‌طور پیش‌فرض ۴۵۰ است تا حساب شما مسدود نشود. ایمیل‌ها با یک اتصال ثابت و حداکثر ۲ ایمیل در ثانیه ارسال می‌شوند.</p>
  </section>
}

export default function EmailPage() {
  const [smtp, setSmtp] = useState<Smtp | null>(null)
  const [form, setForm] = useState<(Smtp & { password: string }) | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState<Tone>(null)
  const [busy, setBusy] = useState('')
  const [to, setTo] = useState('')
  const [log, setLog] = useState<Log | null>(null)
  const [logFilter, setLogFilter] = useState('')
  const [logPage, setLogPage] = useState(1)
  const [preview, setPreview] = useState(false)

  const load = useCallback(async () => {
    const response = await fetch('/api/admin/email', { cache: 'no-store' }).catch(() => null)
    const data = await response?.json().catch(() => null)
    if (!response?.ok) { setError(data?.error || 'دریافت تنظیمات انجام نشد'); return }
    setSmtp(data.smtp); setForm({ ...data.smtp, password: '' })
  }, [])
  const loadLog = useCallback(async () => {
    const response = await fetch(`/api/admin/email?view=log&status=${logFilter}&page=${logPage}`, { cache: 'no-store' }).catch(() => null)
    if (response?.ok) setLog(await response.json())
  }, [logFilter, logPage])
  useEffect(() => { void load() }, [load])
  useEffect(() => { void loadLog() }, [loadLog])

  if (error) return <div className="sa" dir="rtl"><Notice tone="error">{error}</Notice></div>
  if (!form || !smtp) return <div className="sa" dir="rtl"><div className="sa-skeleton" /></div>
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((current) => current && { ...current, [key]: value })
  const gmail = form.mode === 'smtp' && /^smtp\.(gmail|googlemail)\.com$/i.test(form.host.trim())

  function useGmail() {
    setForm((current) => current && { ...current, mode: 'smtp', host: 'smtp.gmail.com', port: 587, security: 'starttls', dailyLimit: current.dailyLimit || 450, fromEmail: /@(gmail|googlemail)\.com$/i.test(current.fromEmail) ? current.fromEmail : '' })
    setNotice({ tone: 'ok', text: 'تنظیمات جیمیل پر شد؛ نشانی جیمیل و رمز برنامه را وارد و ذخیره کنید.' })
  }

  async function save(event?: FormEvent) {
    event?.preventDefault()
    if (!form) return
    setBusy('save'); setNotice(null)
    const result = await call<{ smtp: Smtp }>({ op: 'save', settings: form })
    setBusy('')
    if (!result.ok) { setNotice({ tone: 'error', text: result.error }); return }
    setSmtp(result.data.smtp); setForm({ ...result.data.smtp, password: '' }); setNotice({ tone: 'ok', text: 'تنظیمات ذخیره شد.' })
  }
  async function verify() {
    setBusy('verify'); setNotice(null)
    const result = await call<{ ok: boolean; error?: string }>({ op: 'verify' })
    setBusy('')
    setNotice(result.ok && result.data.ok ? { tone: 'ok', text: 'اتصال و ورود موفق بود.' } : { tone: 'error', text: result.ok ? result.data.error || 'اتصال برقرار نشد' : result.error })
  }
  async function test() {
    setBusy('test'); setNotice(null)
    const result = await call({ op: 'test', to })
    setBusy('')
    setNotice(result.ok ? { tone: 'ok', text: `ایمیل آزمایشی به ${to} ارسال شد؛ صندوق ورودی (و پوشهٔ Spam) را ببینید.` } : { tone: 'error', text: result.error })
    void loadLog()
  }

  const dirty = JSON.stringify({ ...form, password: undefined }) !== JSON.stringify({ ...smtp, password: undefined }) || !!form.password
  return <div className="sa" dir="rtl">
    <header className="sa-head"><h1>ایمیل سایت</h1><div className="sa-head-actions">
      <span className={`sa-state ${smtp.enabled ? 'is-ok' : 'is-warn'}`}>{smtp.enabled ? 'ارسال فعال است' : 'ارسال خاموش است'}</span>
      {log && <span className="sa-state is-info">۲۴ ساعت: {fa(log.sent24)}{smtp.dailyLimit ? ` از ${fa(smtp.dailyLimit)}` : ''}</span>}
    </div></header>
    {!gmail && <GmailGuide onUse={useGmail} />}
    <div className="sa-cols">
      <form className="sa-card sa-form" onSubmit={save}>
        <header className="sa-card-head"><h2>حساب ارسال</h2><label className="sa-check"><input type="checkbox" checked={form.enabled} onChange={(e) => set('enabled', e.target.checked)} />ارسال ایمیل فعال</label></header>
        {gmail && <p className="sa-notice is-ok">ارسال از طریق جیمیل. نام کاربری نشانی کامل جیمیل است و رمز، «رمز برنامه» ۱۶ حرفی (<a className="text-link" href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">ساخت رمز برنامه</a>).</p>}
        <div className="sa-grid">
          <label className="sa-field"><span>سرور SMTP</span><input className="input" dir="ltr" value={form.host} onChange={(e) => set('host', e.target.value)} placeholder="smtp.gmail.com" /></label>
          <label className="sa-field"><span>امنیت و پورت</span><select className="select" value={form.security} onChange={(e) => { const value = e.target.value as Smtp['security']; setForm((current) => current && { ...current, security: value, port: value === 'tls' ? 465 : value === 'starttls' ? 587 : 25 }) }}><option value="starttls">STARTTLS — پورت ۵۸۷</option><option value="tls">SSL/TLS — پورت ۴۶۵</option><option value="none">بدون رمزنگاری — پورت ۲۵</option></select></label>
          {!gmail && <label className="sa-field"><span>پورت</span><input className="input" dir="ltr" type="number" min={1} max={65535} value={form.port} onChange={(e) => set('port', Number(e.target.value))} /></label>}
          <label className="sa-field"><span>{gmail ? 'نشانی جیمیل' : 'نام کاربری'}</span><input className="input" dir="ltr" autoComplete="off" value={form.user} onChange={(e) => { const user = e.target.value; setForm((current) => current && { ...current, user, fromEmail: gmail && (!current.fromEmail || current.fromEmail === current.user) ? user : current.fromEmail }) }} placeholder={gmail ? 'you@gmail.com' : ''} /></label>
          <label className="sa-field"><span>{gmail ? 'رمز برنامه (App Password)' : 'رمز'}{smtp.hasPassword ? ' — ذخیره شده' : ''}</span><input className="input" dir="ltr" type="password" autoComplete="new-password" value={form.password} onChange={(e) => set('password', e.target.value)} placeholder={smtp.hasPassword ? '•••• •••• •••• ••••' : gmail ? 'abcd efgh ijkl mnop' : ''} /></label>
        </div>
        <div className="sa-grid">
          <label className="sa-field"><span>نام فرستنده</span><input className="input" value={form.fromName} onChange={(e) => set('fromName', e.target.value)} placeholder="موبوکام" /></label>
          <label className="sa-field"><span>نشانی فرستنده</span><input className="input" dir="ltr" value={form.fromEmail} onChange={(e) => set('fromEmail', e.target.value)} placeholder={gmail ? form.user || 'you@gmail.com' : 'no-reply@example.com'} /></label>
          <label className="sa-field"><span>نشانی پاسخ (اختیاری)</span><input className="input" dir="ltr" value={form.replyTo} onChange={(e) => set('replyTo', e.target.value)} placeholder="support@example.com" /></label>
          <label className="sa-field"><span>سقف ارسال در ۲۴ ساعت (۰ = بدون سقف)</span><input className="input" type="number" min={0} value={form.dailyLimit} onChange={(e) => set('dailyLimit', Number(e.target.value))} /></label>
        </div>
        {gmail && form.fromEmail && form.user && form.fromEmail.toLowerCase() !== form.user.toLowerCase() && <p className="sa-hint">جیمیل فقط وقتی از نشانی دیگری می‌فرستد که آن را در تنظیمات جیمیل به‌عنوان «Send mail as» تأیید کرده باشید؛ وگرنه نشانی جیمیل نمایش داده می‌شود.</p>}
        {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
        <div className="sa-head-actions">
          <button type="submit" className="btn btn-primary" disabled={!!busy || !dirty}>{busy === 'save' ? 'در حال ذخیره…' : 'ذخیره'}</button>
          <button type="button" className="btn btn-ghost" disabled={!!busy || dirty} title={dirty ? 'اول ذخیره کنید' : undefined} onClick={() => void verify()}>{busy === 'verify' ? 'در حال بررسی…' : 'بررسی اتصال'}</button>
          {gmail || <button type="button" className="btn btn-ghost" onClick={useGmail}>استفاده از جیمیل</button>}
        </div>
        <div className="sa-toolbar">
          <input className="input" dir="ltr" type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="you@example.com" aria-label="گیرندهٔ ایمیل آزمایشی" />
          <button type="button" className="btn btn-ghost" disabled={!!busy || dirty || !to.includes('@')} onClick={() => void test()}>{busy === 'test' ? 'در حال ارسال…' : 'ارسال ایمیل آزمایشی'}</button>
        </div>
      </form>

      <section className="sa-card sa-form">
        <header className="sa-card-head"><h2>اطلاع‌رسانی به کاربران</h2><label className="sa-check"><input type="checkbox" checked={form.notifyUsers} onChange={(e) => set('notifyUsers', e.target.checked)} />فعال</label></header>
        <p className="sa-hint">وقتی برای کاربر اعلانی ثبت می‌شود (پرداخت، تحویل، پاسخ تیکت…) یک ایمیل هم برایش فرستاده می‌شود. ایمیل‌ها پس‌زمینه ارسال می‌شوند و سرعت سایت را کم نمی‌کنند. کاربرانی که در پروفایل خود ایمیل‌ها را خاموش کرده‌اند و حساب‌هایی که با شماره موبایل ساخته شده‌اند (بدون ایمیل واقعی) ایمیل نمی‌گیرند.</p>
        <div className="em-events">{EVENTS.map(([id, label]) => <label key={id} className="sa-check"><input type="checkbox" disabled={!form.notifyUsers} checked={form.events[id] !== false} onChange={(e) => set('events', { ...form.events, [id]: e.target.checked })} />{label}</label>)}</div>
        <div className="sa-head-actions">
          <button type="button" className="btn btn-primary" disabled={!!busy || !dirty} onClick={() => void save()}>ذخیره</button>
          <button type="button" className="btn btn-ghost" onClick={() => setPreview(!preview)}>{preview ? 'بستن پیش‌نمایش' : 'پیش‌نمایش ایمیل'}</button>
        </div>
        {preview && <iframe className="em-preview" src="/api/admin/email?view=preview" sandbox="" title="پیش‌نمایش ایمیل اطلاع‌رسانی" />}
      </section>
    </div>

    <section className="sa-card sa-table-wrap">
      <header className="sa-card-head"><h2>ایمیل‌های ارسال‌شده</h2><div className="sa-head-actions">
        {log && <small>۳۰ روز: {fa(log.sent30)} موفق · {fa(log.failed30)} ناموفق</small>}
        <select className="select" value={logFilter} onChange={(e) => { setLogFilter(e.target.value); setLogPage(1) }} aria-label="وضعیت"><option value="">همه</option><option value="SENT">موفق</option><option value="FAILED">ناموفق</option></select>
      </div></header>
      {log && <table className="data sa-table"><thead><tr><th>گیرنده</th><th>موضوع</th><th>نوع</th><th>وضعیت</th><th>زمان</th></tr></thead><tbody>
        {log.rows.map((row) => <tr key={row.id}><td dir="ltr"><small>{row.toAddress}</small></td><td>{row.subject}{row.error && <small className="sa-sub em-error">{row.error}</small>}</td><td><small>{SOURCE(row.source)}</small></td><td><span className={`sa-state ${row.status === 'SENT' ? 'is-ok' : 'is-bad'}`}>{row.status === 'SENT' ? 'ارسال شد' : 'ناموفق'}</span></td><td><small>{faDate(row.createdAt, true)}</small></td></tr>)}
        {!log.rows.length && <tr><td colSpan={5} className="sa-empty">هنوز ایمیلی ارسال نشده است.</td></tr>}
      </tbody></table>}
      {log && <Pager page={log.page} pages={log.pages} onPage={setLogPage} />}
    </section>
  </div>
}
