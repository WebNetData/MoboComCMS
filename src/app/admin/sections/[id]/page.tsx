'use client'

import { useParams } from '@/platform/routing/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from '@/components/AppLink'
import { Notice, send, useJson } from '../../store/shared'
import type { Definition, Section } from '../shared'

const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])$/i
const SEGMENT = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/

function SettingInput({ def, value, onChange }: { def: Definition; value: unknown; onChange: (value: unknown) => void }) {
  const id = `set-${def.key}`
  if (def.type === 'boolean') return <label data-vip={/members-only$/.test(def.key) ? '' : undefined} className="sa-check"><input id={id} type="checkbox" checked={value === true || (value === undefined && def.default === true)} onChange={(e) => onChange(e.target.checked)} />{def.label}</label>
  const input = def.type === 'textarea' ? <textarea id={id} className="input" rows={3} value={String(value ?? def.default ?? '')} onChange={(e) => onChange(e.target.value)} />
    : def.type === 'select' ? <select id={id} className="select" value={String(value ?? def.default ?? '')} onChange={(e) => onChange(e.target.value)}>{def.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
    : def.type === 'number' ? <input id={id} className="input" type="number" value={String(value ?? def.default ?? '')} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} />
    : <input id={id} className="input" type={def.type === 'secret' ? 'password' : 'text'} value={String(value ?? def.default ?? '')} onChange={(e) => onChange(e.target.value)} autoComplete="off" />
  return <label className="sa-field" htmlFor={id}><span>{def.label}</span>{input}{def.description && <small className="sa-sub">{def.description}</small>}</label>
}

/** One section: public address, on/off, the settings its module declares, and its admin menu. */
export default function SectionSettingsPage() {
  const { id } = useParams<{ id: string }>()
  const { data, error, reload } = useJson<{ section: Section }>(`/api/admin/sections?id=${encodeURIComponent(id)}`)
  const [addresses, setAddresses] = useState<Record<string, string>>({})
  const [hostnames, setHostnames] = useState<Record<string, string>>({})
  const routingRevision = useRef('')
  const [settings, setSettings] = useState<Record<string, unknown>>({})
  const [enabled, setEnabled] = useState(true)
  const [names, setNames] = useState({ fa: '', en: '' })
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const section = data?.section
  useEffect(() => {
    if (!section) return
    setAddresses(Object.fromEntries(section.bases.map((row) => [row.base, (row.alias || '').replace(/^\//, '')])))
    setHostnames(Object.fromEntries(section.bases.map((row) => [row.base, row.hostname || ''])))
    routingRevision.current = section.routingRevision
    setSettings(section.settings)
    setEnabled(section.enabled)
    setNames(section.customName || { fa: '', en: '' })
  }, [section])
  const origin = typeof window === 'undefined' ? '' : window.location.origin
  const invalid = useMemo(() => Object.entries(addresses).find(([, value]) => value && !SEGMENT.test(value.trim().toLowerCase())), [addresses])
  const invalidHost = useMemo(() => Object.values(hostnames).some((value) => !!value.trim() && !HOSTNAME.test(value.trim())), [hostnames])
  const seo = section?.definitions.filter((def) => def.key.startsWith('seo.')) || []
  const other = section?.definitions.filter((def) => !def.key.startsWith('seo.')) || []

  async function save() {
    if (!section) return
    setBusy(true); setMessage(null)
    const response = await send<{ section: Section }>('/api/admin/sections', 'POST', { id: section.id, enabled, settings, addresses, names })
    setBusy(false)
    if (!response.ok) { setMessage({ tone: 'error', text: response.error }); return }
    routingRevision.current = response.data.section.routingRevision
    setMessage({ tone: 'ok', text: 'تنظیمات بخش ذخیره شد' + (Object.values(addresses).some(Boolean) ? '؛ آدرس‌های قدیمی از این پس به آدرس تازه منتقل می‌شوند' : '') })
    window.dispatchEvent(new Event('happ:modules-changed'))
    void reload()
  }

  async function saveHosts() {
    if (!section) return
    setBusy(true); setMessage(null)
    const response = await send<{ section: Section }>('/api/admin/sections', 'POST', { id: section.id, hostnames, hostsRevision: routingRevision.current })
    setBusy(false)
    if (!response.ok) { setMessage({ tone: 'error', text: response.error }); return }
    routingRevision.current = response.data.section.routingRevision
    setMessage({ tone: 'ok', text: 'ساب‌دامنه‌ها ذخیره شدند؛ دسترسی به DNS و گواهی SSL را پیش از استفاده بررسی کنید' })
  }

  if (!section) return <div className="sa" dir="rtl">{error ? <Notice tone="error">{error}</Notice> : <div className="sa-skeleton" aria-busy="true" />}</div>
  return <div className="sa" dir="rtl">
    <Link href="/admin/sections" className="sa-link sa-back">→ همهٔ بخش‌ها</Link>
    <header className="sa-head">
      <div><h1>تنظیمات بخش {section.name}</h1><p className="sa-hint">{section.description}</p></div>
      <div className="sa-head-actions"><button type="button" className="btn btn-primary" disabled={busy || !!invalid} onClick={() => void save()}>{busy ? 'در حال ذخیره…' : 'ذخیره'}</button></div>
    </header>
    {message && <Notice tone={message.tone}>{message.text}</Notice>}
    <div className="sa-cols">
      <div className="sa-stack">
        <section className="sa-card">
          <header className="sa-card-head"><h2>نام بخش</h2><small>خالی = نام پیش‌فرض</small></header>
          <p className="sa-hint">همه‌جا همین نام دیده می‌شود: مسیر صفحه (breadcrumb)، منوی مدیریت، اطلاعیهٔ تعمیرات و لینک‌های بازگشت به بخش. منوی بالای سایت را در «منوها» جدا می‌چینید.</p>
          <div className="sa-grid">
            <label className="sa-field"><span>نام فارسی</span><input className="input" value={names.fa} maxLength={60} placeholder={section.defaultName} onChange={(e) => setNames((current) => ({ ...current, fa: e.target.value }))} /></label>
            <label className="sa-field"><span>نام انگلیسی</span><input className="input" dir="ltr" value={names.en} maxLength={60} placeholder={section.defaultNameEn || section.defaultName} onChange={(e) => setNames((current) => ({ ...current, en: e.target.value }))} /></label>
          </div>
          {(names.fa || names.en) && <button type="button" className="sa-link" onClick={() => setNames({ fa: '', en: '' })}>بازگشت به نام پیش‌فرض ({section.defaultName})</button>}
        </section>
        {section.bases.length > 0 && <section className="sa-card">
          <header className="sa-card-head"><h2>آدرس بخش</h2><small>مثلاً <bdi dir="ltr">/game</bdi> به‌جای <bdi dir="ltr">/games</bdi></small></header>
          <p className="sa-hint">آدرس فعلی روی دامنهٔ اصلی حفظ می‌شود؛ ورود، حساب و مدیریت از دامنهٔ اصلی انجام می‌شود. پیش از استفاده DNS و SSL و میزبانی همین سایت را در <Link href="/admin/server/domains" className="sa-link">مدیریت دامنه‌ها</Link> تنظیم کنید.</p>
          {section.bases.map((row) => {
            const value = addresses[row.base] ?? ''
            const shown = value.trim() ? `/${value.trim().toLowerCase()}` : row.base
            return <div key={row.base} className="sh-address">
              <label className="sa-field"><span>آدرس فعلی: <bdi dir="ltr">{row.base}</bdi></span>
                <span className="sh-address-input" dir="ltr"><span className="sh-origin">{origin}/</span><input className="input" value={value} placeholder={row.base.slice(1)} onChange={(e) => setAddresses((current) => ({ ...current, [row.base]: e.target.value.replace(/^\/+/, '') }))} aria-label={`آدرس تازه برای ${row.base}`} /></span>
              </label>
              {value && !SEGMENT.test(value.trim().toLowerCase()) ? <small className="ga-issues">فقط حروف کوچک انگلیسی، عدد و خط تیره</small>
                : <small className="sa-sub">صفحهٔ نمونه: <bdi dir="ltr">{origin}{shown}/…</bdi>{value && <> — <bdi dir="ltr">{row.base}/…</bdi> با ریدایرکت دائمی (۳۰۸) به آدرس تازه می‌رود</>}</small>}
              {value && <button type="button" className="sa-link" onClick={() => setAddresses((current) => ({ ...current, [row.base]: '' }))}>بازگشت به آدرس پیش‌فرض</button>}
            </div>
          })}
        </section>}
        {section.bases.length > 0 && <section className="sa-card">
          <header className="sa-card-head"><h2>ساب‌دامنه‌های بخش</h2><small>ذخیرهٔ مستقل از سایر تنظیمات</small></header>
          <p className="sa-hint">نام کامل زیردامنهٔ همین سایت را وارد کنید. خالی گذاشتن هر مورد، دسترسی آن زیردامنه را غیرفعال می‌کند.</p>
          {section.bases.map((row) => {
            const hostname = hostnames[row.base] ?? ''
            const validHost = !hostname.trim() || HOSTNAME.test(hostname.trim())
            return <div key={row.base} className="sh-address">
              <label className="sa-field"><span>زیردامنهٔ اختیاری برای <bdi dir="ltr">{row.base}</bdi></span><input className="input" dir="ltr" value={hostname} maxLength={253} autoComplete="off" placeholder="cloud.example.com" disabled={busy} aria-invalid={!validHost} aria-describedby={`host-help-${row.base.slice(1)}`} onChange={(e) => setHostnames((current) => ({ ...current, [row.base]: e.target.value }))} /></label>
              <small id={`host-help-${row.base.slice(1)}`} className={validHost ? 'sa-sub' : 'ga-issues'}>{!validHost ? 'نام کامل دامنه را بدون https، مسیر یا پورت وارد کنید' : hostname.trim() ? <>پیش‌نمایش: <bdi dir="ltr">https://{hostname.trim().toLowerCase()}/</bdi></> : 'خالی = بدون زیردامنه'}</small>
            </div>
          })}
          <button type="button" className="btn btn-primary" disabled={busy || invalidHost} onClick={() => void saveHosts()}>ذخیرهٔ ساب‌دامنه‌ها</button>
        </section>}
        {seo.length > 0 && <section className="sa-card"><header className="sa-card-head"><h2>سئوی صفحهٔ اصلی بخش</h2><small>خالی = متن پیش‌فرض</small></header>
          {seo.map((def) => <SettingInput key={def.key} def={def} value={settings[def.key]} onChange={(value) => setSettings((current) => ({ ...current, [def.key]: value }))} />)}
        </section>}
        {other.length > 0 && <section className="sa-card"><header className="sa-card-head"><h2>تنظیمات پیشرفته</h2></header>
          {other.map((def) => <SettingInput key={def.key} def={def} value={settings[def.key]} onChange={(value) => setSettings((current) => ({ ...current, [def.key]: value }))} />)}
        </section>}
      </div>
      <div className="sa-stack">
        <section className="sa-card">
          <header className="sa-card-head"><h2>وضعیت</h2></header>
          <label className="sa-check"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />بخش {section.name} فعال باشد</label>
          <p className="sa-hint">با غیرفعال کردن، صفحه‌ها و منوهای این بخش پنهان می‌شوند و داده‌ها حذف نمی‌شوند.</p>
        </section>
        <section className="sa-card">
          <header className="sa-card-head"><h2>مدیریت {section.name}</h2></header>
          <ul className="sa-rows">{section.menu.items.filter((item) => !item.href.startsWith('/admin/sections/')).map((item) => <li key={item.href}><Link href={item.href}><span className="sa-grow"><b>{item.label}</b></span><span className="sa-link">ورود</span></Link></li>)}</ul>
        </section>
      </div>
    </div>
  </div>
}
