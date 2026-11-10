'use client'

import { useEffect, useState } from 'react'
import { Notice } from '../store/shared'
import SectionSettingsHistoryLink from '@/components/admin/SectionSettingsHistoryLink'

type Field = { key: string; label: string; type: string; builtin?: string; required: boolean; enabled: boolean; placeholder: string; help: string; options: string[] }
type Config = { enforce: boolean; usernamePrefix: string; intro: string; fields: Field[] }

const BUILTIN_NOTE: Record<string, string> = {
  firstName: 'روی نام حساب، فاکتورها و گیرندهٔ مرسوله می‌نشیند.',
  lastName: 'همراه نام، نام کامل حساب را می‌سازد.',
  username: 'هیچ‌وقت ضروری نیست؛ اگر خالی بماند نام کاربری پیش‌فرض ساخته می‌شود.',
  email: 'فقط برای حساب‌هایی نشان داده می‌شود که ایمیل واقعی ندارند (ثبت‌نام با پیامک).',
  address: 'استان، شهر، نشانی، پلاک، کد پستی، موبایل گیرنده و پین روی نقشه؛ آدرس پیش‌فرض سفارش‌ها می‌شود.',
  phone: 'کاربر شمارهٔ موبایلش را با کد پیامکی تأیید می‌کند؛ اگر ضروری باشد، هر کسی که با ایمیل، تلگرام یا راه دیگری ثبت‌نام کرده تا تأیید شماره به صفحهٔ تکمیل مشخصات هدایت می‌شود. تا وقتی ارسال پیامک تنظیم نشده باشد، این مرحله از کاربر خواسته نمی‌شود.',
}

const slug = (label: string, taken: string[]) => {
  let base = `field${taken.length + 1}`
  const latin = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  if (/^[a-z]/.test(latin)) base = latin.slice(0, 30)
  let key = base, n = 2
  while (taken.includes(key)) key = `${base}_${n++}`
  return key
}

/** The registration-fields builder: which details members give, in which order, and which are required. */
export default function ProfileFieldsPage() {
  const [config, setConfig] = useState<Config | null>(null)
  const [revision, setRevision] = useState('')
  const [saved, setSaved] = useState('')
  const [types, setTypes] = useState<Record<string, string>>({})
  const [open, setOpen] = useState<string>('')
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [smsReady, setSmsReady] = useState(true)

  useEffect(() => {
    fetch('/api/admin/profile-fields', { cache: 'no-store' }).then((r) => r.json().then((data) => ({ ok: r.ok, data }))).then(({ ok, data }) => {
      if (!ok) { setNotice({ tone: 'error', text: data?.error || 'بارگذاری انجام نشد' }); return }
      setConfig(data.config); setSaved(JSON.stringify(data.config)); setTypes(data.types); setRevision(data.settingsRevision || ''); setSmsReady(data.smsReady !== false)
    }).catch(() => setNotice({ tone: 'error', text: 'ارتباط برقرار نشد' }))
  }, [])

  if (!config) return <div className="sa" dir="rtl">{notice ? <Notice tone="error">{notice.text}</Notice> : <div className="sa-skeleton" />}</div>
  const dirty = JSON.stringify(config) !== saved
  const update = (key: string, patch: Partial<Field>) => setConfig({ ...config, fields: config.fields.map((field) => field.key === key ? { ...field, ...patch } : field) })
  const move = (index: number, delta: number) => { const fields = [...config.fields]; const [item] = fields.splice(index, 1); fields.splice(index + delta, 0, item); setConfig({ ...config, fields }) }

  function add() {
    if (!config) return
    const key = slug('', config.fields.map((field) => field.key))
    setConfig({ ...config, fields: [...config.fields, { key, label: 'فیلد جدید', type: 'text', required: false, enabled: true, placeholder: '', help: '', options: [] }] })
    setOpen(key)
  }

  async function save() {
    if (!config) return
    const broken = config.fields.find((field) => !field.builtin && ['select', 'radio'].includes(field.type) && field.options.filter(Boolean).length < 2)
    if (broken) { setNotice({ tone: 'error', text: `«${broken.label}» دست‌کم دو گزینه لازم دارد.` }); setOpen(broken.key); return }
    setBusy(true); setNotice(null)
    const response = await fetch('/api/admin/profile-fields', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(revision ? { 'If-Match': revision } : {}) }, body: JSON.stringify({ config }) }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) { setNotice({ tone: 'error', text: data?.error || 'ذخیره انجام نشد' }); return }
    setConfig(data.config); setSaved(JSON.stringify(data.config)); setRevision(data.settingsRevision || ''); setNotice({ tone: 'ok', text: 'ذخیره شد؛ از همین حالا برای ثبت‌نام‌ها و ورودهای بعدی اعمال می‌شود.' })
  }

  const enabled = config.fields.filter((field) => field.enabled)
  return <div className="sa" dir="rtl">
    <header className="sa-head">
      <div><h1>فیلدهای ثبت‌نام و تکمیل مشخصات</h1><p className="sa-hint">کاربر تازه پس از ورود به صفحهٔ «تکمیل مشخصات» هدایت می‌شود. ثبت‌نام جدید با موبایل همیشه نام، نام خانوادگی و ساخت رمز می‌خواهد و ایمیل در این مرحله اختیاری است؛ تنظیمات زیر برای تکمیل اطلاعات پس از آن اعمال می‌شوند.</p></div>
      <div className="sa-head-actions"><SectionSettingsHistoryLink section="profile-fields" /><a href="/welcome" target="_blank" rel="noreferrer" className="btn btn-ghost">پیش‌نمایش صفحه ↗</a><button type="button" className="btn btn-primary" disabled={busy || !dirty} onClick={() => void save()}>{busy ? 'در حال ذخیره…' : 'ذخیره'}</button></div>
    </header>
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

    <div className="sa-cols">
      <section className="sa-card pf-list">
        <header className="sa-card-head"><h2>فیلدها</h2><small>{enabled.length.toLocaleString('fa-IR')} فعال · {enabled.filter((field) => field.required).length.toLocaleString('fa-IR')} ضروری</small></header>
        <ol className="pf-rows">
          {config.fields.map((field, index) => <li key={field.key} className={`pf-row${field.enabled ? '' : ' is-off'}${open === field.key ? ' is-open' : ''}`}>
            <div className="pf-line">
              <span className="pf-order">
                <button type="button" aria-label={`بالا بردن ${field.label}`} disabled={index === 0} onClick={() => move(index, -1)}>▲</button>
                <button type="button" aria-label={`پایین آوردن ${field.label}`} disabled={index === config.fields.length - 1} onClick={() => move(index, 1)}>▼</button>
              </span>
              <button type="button" className="pf-title" aria-expanded={open === field.key} onClick={() => setOpen(open === field.key ? '' : field.key)}>
                <b>{field.label}{field.required && field.enabled && <span className="pf-star" aria-label="ضروری">*</span>}</b>
                <small>{field.builtin ? 'فیلد اصلی' : types[field.type] || field.type} · <bdi dir="ltr">{field.key}</bdi></small>
              </button>
              <label className="pf-toggle" title="ضروری"><input type="checkbox" disabled={!field.enabled || field.builtin === 'username'} checked={field.required} onChange={(e) => update(field.key, { required: e.target.checked })} />ضروری</label>
              <label className="pf-toggle" title="نمایش"><input type="checkbox" checked={field.enabled} onChange={(e) => update(field.key, { enabled: e.target.checked })} />فعال</label>
            </div>
            {open === field.key && <div className="pf-edit">
              {field.builtin && <p className="sa-hint">{BUILTIN_NOTE[field.builtin]}</p>}
              {field.builtin === 'phone' && !smsReady && <Notice tone="error">ارسال پیامک هنوز آماده نیست؛ تا تنظیم سرویس پیامک در <a href="/admin/sms">مدیریت پیامک</a>، تأیید موبایل از کاربران خواسته نمی‌شود.</Notice>}
              <div className="sa-grid">
                <label className="sa-field"><span>عنوان</span><input className="input" value={field.label} maxLength={80} onChange={(e) => update(field.key, { label: e.target.value })} /></label>
                {!field.builtin && <label className="sa-field"><span>نوع</span><select className="select" value={field.type} onChange={(e) => update(field.key, { type: e.target.value })}>{Object.entries(types).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
                {field.builtin !== 'address' && <label className="sa-field"><span>{field.type === 'checkbox' ? 'متن کنار تیک' : 'متن راهنمای داخل فیلد'}</span><input className="input" value={field.placeholder} maxLength={120} onChange={(e) => update(field.key, { placeholder: e.target.value })} /></label>}
                <label className="sa-field"><span>توضیح زیر فیلد</span><input className="input" value={field.help} maxLength={240} onChange={(e) => update(field.key, { help: e.target.value })} /></label>
              </div>
              {!field.builtin && ['select', 'radio'].includes(field.type) && <label className="sa-field"><span>گزینه‌ها (هر خط یک گزینه)</span><textarea className="input" rows={4} value={field.options.join('\n')} onChange={(e) => update(field.key, { options: e.target.value.split('\n') })} /></label>}
              {!field.builtin && <div className="sa-head-actions"><button type="button" className="sa-link is-danger" onClick={() => { if (window.confirm(`فیلد «${field.label}» حذف شود؟ مقادیری که کاربران قبلاً وارد کرده‌اند در حساب‌ها می‌مانند.`)) setConfig({ ...config, fields: config.fields.filter((item) => item.key !== field.key) }) }}>حذف فیلد</button></div>}
            </div>}
          </li>)}
        </ol>
        <button type="button" className="btn btn-ghost" onClick={add}>+ افزودن فیلد دلخواه</button>
      </section>

      <div className="sa-stack">
        <section className="sa-card sa-form">
          <header className="sa-card-head"><h2>تنظیمات</h2></header>
          <label className="sa-check"><input type="checkbox" checked={config.enforce} onChange={(e) => setConfig({ ...config, enforce: e.target.checked })} />تا تکمیل فیلدهای ضروری، کاربر به صفحهٔ تکمیل مشخصات هدایت شود</label>
          <label className="sa-field"><span>پیشوند نام کاربری پیش‌فرض</span><input className="input" dir="ltr" value={config.usernamePrefix} maxLength={16} onChange={(e) => setConfig({ ...config, usernamePrefix: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })} /></label>
          <p className="sa-hint">کاربرانی که نام کاربری انتخاب نکنند به ترتیب <bdi dir="ltr">{config.usernamePrefix || 'mobocomuser'}</bdi>، <bdi dir="ltr">{config.usernamePrefix || 'mobocomuser'}2</bdi>، <bdi dir="ltr">{config.usernamePrefix || 'mobocomuser'}3</bdi> و … می‌گیرند.</p>
          <label className="sa-field"><span>متن بالای صفحهٔ تکمیل مشخصات</span><textarea className="input" rows={3} maxLength={400} value={config.intro} onChange={(e) => setConfig({ ...config, intro: e.target.value })} /></label>
        </section>
        <section className="sa-card">
          <header className="sa-card-head"><h2>کاربر چه می‌بیند</h2></header>
          <ol className="pf-preview">{enabled.map((field) => <li key={field.key}>{field.label}{field.required ? <b> *</b> : <small> (اختیاری)</small>}</li>)}</ol>
          <p className="sa-hint">مدیران هیچ‌وقت به این صفحه هدایت نمی‌شوند.</p>
        </section>
      </div>
    </div>
  </div>
}
