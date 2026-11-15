'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { latinDigits } from '@/shared/text/digits'
import './sms.css'

type EventSetting = { enabled: boolean; text: string; pattern: string }
type Config = { revision: string; problems: string[]; otpReady: boolean; enabled: boolean; apiKey: string; hasKey: boolean; ready: boolean; fromNumber: string; otpLogin: boolean; otpPattern: string; otpParam: string; otpText: string; adminPhones: string[]; events: Record<string, EventSetting> }
type EventDef = { id: string; group: string; audience: 'user' | 'admin'; label: string; vars: string[]; template: string }
type Log = { id: number; phone: string; event: string; kind: string; body: string; status: string; error: string; providerId: string | null; createdAt: string }
type Tab = 'settings' | 'events' | 'send' | 'log'

const STATUS: Record<string, string> = { SENT: 'پذیرفته‌شده در پنل', FAILED: 'ناموفق', SKIPPED: 'ارسال نشد', SENDING: 'در حال ارسال', UNKNOWN: 'نتیجه نامشخص' }
const GROUPS: Record<string, string> = { store: 'فروشگاه', services: 'خدمات', billing: 'مالی', support: 'پشتیبانی', engagement: 'تعامل', system: 'سیستم' }

/** IPPanel SMS: connection, OTP login, per-event alerts, manual messages and the send log. */
export default function SmsPage() {
  const [filters, setFilters] = useState({ status: '', event: '', phone: '', days: '30', page: 1 })
  const [pagination, setPagination] = useState({ page: 1, total: 0, pages: 1 })
  const [search, setSearch] = useState('')
  const [onlyEnabled, setOnlyEnabled] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [tab, setTab] = useState<Tab>('settings')
  const [config, setConfig] = useState<Config | null>(null)
  const [events, setEvents] = useState<EventDef[]>([])
  const [log, setLog] = useState<Log[]>([])
  const [stats, setStats] = useState<Record<string, number>>({})
  const [verified, setVerified] = useState(0)
  const [apiKey, setApiKey] = useState('')
  const [send, setSend] = useState({ to: 'phone', phone: '', text: '' })
  const [busy, setBusy] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const draftVersion = useRef(0)
  const loaded = useRef(false)
  const requestVersion = useRef(0)
  const mutating = useRef(false)
  const editConfig = (next: Config) => { draftVersion.current++; setConfig(next) }
  const editApiKey = (next: string) => { draftVersion.current++; setApiKey(next) }

  const load = useCallback(async (preserveDraft = false) => {
    const version = draftVersion.current
    const request = ++requestVersion.current
    if (filters.phone && filters.phone.length < 4) { setLoading(false); return false }
    setLoading(true)
    const query = new URLSearchParams({ ...filters, page: String(filters.page), pageSize: '30' })
    const response = await fetch('/api/admin/sms?' + query, { cache: 'no-store' }).catch(() => null)
    const data = await response?.json().catch(() => null)
    if (request !== requestVersion.current) return false
    setLoading(false)
    if (!response?.ok) { setMessage({ text: data?.error || 'دریافت اطلاعات ناموفق بود', error: true }); return false }
    if (!preserveDraft && version === draftVersion.current) { setConfig(data.config); loaded.current = true }
    setEvents(data.events); setLog(data.log); setStats(data.stats); setVerified(data.verifiedUsers); setPagination(data.pagination)
    return true
  }, [filters])
  useEffect(() => { void load(loaded.current) }, [load])

  async function post(action: string, body: Record<string, unknown>, label: string) {
    if (mutating.current) return null
    mutating.current = true
    setBusy(action); setMessage(null)
    const response = await fetch('/api/admin/sms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...body }) }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy(''); mutating.current = false
    if (!response?.ok) { setMessage({ text: data?.error || 'انجام نشد', error: true }); void load(true); return null }
    const resultText = data?.queued !== undefined ? `${Number(data.queued).toLocaleString('fa-IR')} پیامک وارد صف شد؛ نتیجهٔ پذیرش پنل در گزارش ثبت می‌شود.${data.truncated ? ' این نوبت به ۵۰۰ گیرنده محدود شد؛ بقیهٔ گروه وارد صف نشده‌اند.' : ''}` : label.replace('{n}', String(data?.sent ?? '')).replace('{total}', String(data?.total ?? '')).replace('{credit}', Math.floor(Number(data?.credit || 0)).toLocaleString('fa-IR'))
    setMessage({ text: resultText + (Number(data?.unknown) > 0 ? ` نتیجهٔ ${Number(data.unknown).toLocaleString('fa-IR')} ارسال نامشخص است؛ پیش از ارسال مجدد گزارش را بررسی کنید.` : ''), error: Number(data?.unknown) > 0 })
    void load(true)
    return data
  }

  async function save() {
    if (!config || mutating.current) return
    mutating.current = true
    const version = draftVersion.current
    setBusy('save'); setMessage(null)
    const response = await fetch('/api/admin/sms', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...config, apiKey: apiKey || config.apiKey }) }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy(''); mutating.current = false
    if (!response?.ok) { if (response?.status === 409) setConflict(true); setMessage({ text: response?.status === 409 ? 'تنظیمات تغییر کرده است؛ ویرایش‌های شما حفظ شده‌اند.' : data?.error || 'ذخیره نشد', error: true }); return }
    setConflict(false)
    const unchanged = version === draftVersion.current
    if (unchanged) { draftVersion.current++; setConfig(data.config); setApiKey('') }
    setMessage({ text: unchanged ? 'تنظیمات پیامک ذخیره شد' : 'تنظیمات پیامک ذخیره شد؛ تغییرات جدید فرم هنوز ذخیره نشده‌اند', error: false })
  }

  if (!config) return <div className="xm-page" dir="rtl">{message ? <div className="xm-notice is-error" role="alert">{message.text}<button type="button" className="btn btn-ghost" onClick={() => void load()}>تلاش دوباره</button></div> : <div className="tb-empty" role="status">در حال بارگذاری…</div>}</div>
  const setEvent = (id: string, patch: Partial<EventSetting>) => editConfig({ ...config, events: { ...config.events, [id]: { ...config.events[id], ...patch } } })

  return <div className="xm-page ai-page sms-page" dir="rtl">
    <header className="tb-hero"><div><span className="tb-eyebrow">پیامک · IPPanel</span><h1>پنل پیامک</h1><p>ورود با کد پیامکی، اطلاع‌رسانی خودکار سفارش، پرداخت، رسید کارت به کارت و تیکت به مشتری و مدیران، و ارسال دستی پیامک.</p></div>
      <div className="ai-status"><b>{config.ready ? 'تنظیمات آمادهٔ ارسال' : 'تنظیمات آماده نیست'}</b><small>پذیرفته‌شده: {(stats.SENT || 0).toLocaleString('fa-IR')} · ناموفق: {(stats.FAILED || 0).toLocaleString('fa-IR')}</small><span className="badge">اتصال فقط با بررسی اعتبار آزموده می‌شود</span></div>
    </header>
    {message && <div className={`xm-notice${message.error ? ' is-error' : ''}`} role={message.error ? 'alert' : 'status'}>{message.text}{conflict ? <button type="button" className="btn btn-ghost" onClick={() => { if (window.confirm('ویرایش‌های ذخیره‌نشده کنار گذاشته شوند؟')) { const version = draftVersion.current; void load().then(ok => { if (ok && version === draftVersion.current) { setApiKey(''); setConflict(false); setMessage(null) } }) } }}>دریافت تنظیمات تازه</button> : message.error && <button type="button" className="btn btn-ghost" onClick={() => void load(true)}>دریافت دوبارهٔ اطلاعات</button>}</div>}
    <nav className="md-chips seo-filter ai-tabs" aria-label="بخش‌های پیامک">{([['settings', 'اتصال و ورود پیامکی'], ['events', 'اطلاع‌رسانی رویدادها'], ['send', 'ارسال دستی'], ['log', 'گزارش ارسال']] as [Tab, string][]).map(([id, label]) => <button key={id} type="button" className={tab === id ? 'is-active' : ''} onClick={() => setTab(id)}>{label}</button>)}</nav>

    {tab === 'settings' && <section className="card seo-form">
      <h3 className="seo-wide">تنظیمات ارسال</h3>{config.problems?.length > 0 && <ul className="seo-wide">{config.problems.map(problem => <li key={problem}>{problem}</li>)}</ul>}
      <label className="studio-switch seo-wide"><input type="checkbox" checked={config.enabled} onChange={(e) => editConfig({ ...config, enabled: e.target.checked })} />ارسال پیامک فعال باشد</label>
      <label className="studio-field"><span>کلید API (پنل IPPanel ← توسعه‌دهندگان ← کلیدهای دسترسی) {config.hasKey ? `— ذخیره‌شده: ${config.apiKey}` : ''}</span><input className="input" type="password" dir="ltr" autoComplete="off" value={apiKey} onChange={(e) => editApiKey(e.target.value)} placeholder={config.hasKey ? 'برای تغییر، کلید جدید را وارد کنید' : 'API key'} /></label>
      <label className="studio-field"><span>شمارهٔ خط ارسال</span><input className="input" dir="ltr" value={config.fromNumber} onChange={(e) => editConfig({ ...config, fromNumber: e.target.value })} placeholder="+983000505" /></label>
      <label className="studio-field seo-wide"><span>شماره‌های مدیران برای هشدارها (با ویرگول یا فاصله)</span><input className="input" dir="ltr" value={config.adminPhones.join(', ')} onChange={(e) => editConfig({ ...config, adminPhones: e.target.value.split(/[,،\s]+/).filter(Boolean) })} placeholder="09121234567, 09351234567" /></label>
      <h3 className="seo-wide">ورود با کد پیامکی (OTP) — {config.otpReady ? 'آماده' : 'آماده نیست'}</h3>
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
      <div className="sms-tools"><label className="studio-field"><span>جستجوی رویداد</span><input className="input" value={search} onChange={e => setSearch(e.target.value)} /></label><label className="studio-switch"><input type="checkbox" checked={onlyEnabled} onChange={e => setOnlyEnabled(e.target.checked)} />فقط فعال‌ها</label></div>
      {!events.some(event => (!onlyEnabled || config.events[event.id]?.enabled) && (event.label + ' ' + event.id).toLowerCase().includes(search.trim().toLowerCase())) && <p role="status" className="muted">رویدادی با این جستجو پیدا نشد.</p>}
      {Object.entries(GROUPS).filter(([group]) => events.some(event => event.group === group && (!onlyEnabled || config.events[event.id]?.enabled) && (event.label + ' ' + event.id).toLowerCase().includes(search.trim().toLowerCase()))).map(([group, label]) => <div key={group} className="sms-event-group">
        <h3>{label}</h3>
        {events.filter(event => event.group === group && (!onlyEnabled || config.events[event.id]?.enabled) && (event.label + ' ' + event.id).toLowerCase().includes(search.trim().toLowerCase())).map((event) => {
          const setting = config.events[event.id]
          return <article key={event.id} className={`card sms-event${setting?.enabled ? ' is-on' : ''}`}>
            <label className="studio-switch"><input type="checkbox" checked={!!setting?.enabled} onChange={(e) => setEvent(event.id, { enabled: e.target.checked })} /><b>{event.label}</b></label><small>{event.audience === 'user' ? 'گیرنده: مشتری' : 'گیرنده: مدیران'}</small>
            {setting?.enabled && <>
              <label className="studio-field"><span>متن — متغیرها: {[...event.vars, 'brand'].map((name) => `{${name}}`).join(' ')}</span><textarea className="input" rows={3} value={setting.text} onChange={(e) => setEvent(event.id, { text: e.target.value })} /></label>
              <div className="sms-preview"><b>پیش‌نمایش با دادهٔ نمونه</b><p>{setting.text.replace(/\{(\w+)\}/g, (_match, key: string) => ({ name: 'مشتری نمونه', brand: 'موبوکام', title: 'وضعیت سفارش شما تغییر کرد', body: 'سفارش برای تحویل آماده شد.', link: 'https://example.com/dashboard', form: 'درخواست تعمیر', stage: 'آمادهٔ تحویل', message: 'جزئیات را در درخواست‌های من ببینید.', invoice: '۱۲۳۴', order: '۱۲۳۴', amount: '۵۰۰٬۰۰۰ تومان', hours: '۲۴', subject: 'پیگیری سفارش', kind: 'درخواست مرجوعی' } as Record<string, string>)[key] || 'نمونه')}</p><small>محتوای پترن در پنل ارائه‌دهنده نگهداری می‌شود.</small></div>
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
      <div className="seo-actions seo-wide"><button type="button" className="btn btn-primary" disabled={!!busy || send.text.trim().length < 2} onClick={() => { if (send.to === 'phone') void post('broadcast', send, 'پذیرفته‌شده در پنل: {n} از {total} گیرنده'); else if (window.confirm('حداکثر ۵۰۰ گیرنده از این گروه وارد صف پیامک شوند؟ این اقدام هزینهٔ ارسال دارد.')) void post('broadcast', { ...send, confirm: true }, 'پذیرفته‌شده در پنل: {n} از {total} گیرنده') }}>{busy === 'broadcast' ? 'در حال ارسال…' : send.to === 'phone' ? 'ارسال' : 'افزودن به صف ارسال'}</button></div>
      {send.to !== 'phone' && <p className="muted seo-wide">هر نوبت حداکثر ۵۰۰ گیرنده وارد صف می‌شود. تکرار این اقدام، درخواست ارسال تازه برای همین گروه است.</p>}
      <p className="muted seo-wide">پیامک گروهی فقط به کاربرانی می‌رسد که شماره را تأیید کرده‌اند و اطلاع‌رسانی را خاموش نکرده‌اند. برای پیام تبلیغاتی از خط تبلیغاتی استفاده کنید؛ مخابرات گزینهٔ «لغو۱۱» را خودکار اضافه می‌کند.</p>
    </section>}

    {tab === 'log' && <section className="sms-report" aria-busy={loading}><div className="sms-tools card">
      <label className="studio-field"><span>وضعیت</span><select className="input" value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value, page: 1 })}><option value="">همه</option>{Object.entries(STATUS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label className="studio-field"><span>رویداد</span><select className="input" value={filters.event} onChange={e => setFilters({ ...filters, event: e.target.value, page: 1 })}><option value="">همه</option>{events.map(event => <option key={event.id} value={event.id}>{event.label}</option>)}</select></label>
      <label className="studio-field"><span>شماره گیرنده</span><input className="input" dir="ltr" inputMode="numeric" value={filters.phone} onChange={e => setFilters({ ...filters, phone: latinDigits(e.target.value).replace(/[^0-9]/g, ''), page: 1 })} /><small>حداقل چهار رقم؛ ارقام فارسی هم پذیرفته می‌شوند.</small></label>
      <label className="studio-field"><span>بازه</span><select className="input" value={filters.days} onChange={e => setFilters({ ...filters, days: e.target.value, page: 1 })}><option value="7">۷ روز</option><option value="30">۳۰ روز</option><option value="90">۹۰ روز</option></select></label>
    </div><p className="muted">پذیرفته‌شدن در پنل به معنی تحویل به گوشی نیست. نتیجهٔ نامشخص را در پنل بررسی کنید.</p><div className="table-wrap card" tabIndex={0} role="region" aria-label="جدول گزارش پیامک؛ برای دیدن ستون‌ها پیمایش کنید"><table className="table"><thead><tr><th>زمان</th><th>گیرنده</th><th>رویداد</th><th>متن</th><th>وضعیت</th></tr></thead><tbody>
      {log.map((row) => <tr key={row.id}>
        <td className="num">{new Date(row.createdAt).toLocaleString('fa-IR')}</td>
        <td dir="ltr" className="num">{row.phone.replace(/^\+98/, '0')}</td>
        <td><small>{row.event}</small></td>
        <td className="sms-log-body">{row.body}</td>
        <td><span className={`badge${row.status === 'SENT' ? ' badge-green' : row.status === 'FAILED' ? ' badge-red' : ''}`}>{STATUS[row.status] || row.status}</span>{row.error && <><br /><small className="muted">{row.error}</small></>}{row.providerId && <><br /><small dir="ltr">{row.providerId}</small></>}</td>
      </tr>)}
      {!log.length && <tr><td colSpan={5} className="muted">هنوز پیامکی ارسال نشده است.</td></tr>}
    </tbody></table></div><div className="sms-pagination"><button type="button" className="btn btn-ghost" disabled={pagination.page <= 1} onClick={() => setFilters({ ...filters, page: pagination.page - 1 })}>صفحهٔ قبل</button><span>صفحهٔ {pagination.page.toLocaleString('fa-IR')} از {Math.max(1, pagination.pages).toLocaleString('fa-IR')} · {pagination.total.toLocaleString('fa-IR')} مورد</span><button type="button" className="btn btn-ghost" disabled={pagination.page >= pagination.pages} onClick={() => setFilters({ ...filters, page: pagination.page + 1 })}>صفحهٔ بعد</button></div></section>}
  </div>
}
