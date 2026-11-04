'use client'

import { useState, type FormEvent } from 'react'
import { Notice, ServerShell, fa, faDate, useServerApi, useServerJson } from '../shared'

type Overview = {
  service: { installed: boolean; version: string; configured: boolean; active: boolean }
  helperError: string
  settings: { enabled: boolean; configured: boolean; label: string; protocol: string; server: string; appliedAt: string }
}
type Test = { results: { name: string; ok: boolean; status?: number; error?: string; ms: number }[] }
type Tone = { tone: 'ok' | 'error'; text: string } | null

const PROTOCOL: Record<string, string> = { vless: 'VLESS', vmess: 'VMess', trojan: 'Trojan', shadowsocks: 'Shadowsocks', socks: 'SOCKS', http: 'HTTP' }
const TARGET: Record<string, string> = { telegram: 'تلگرام (api.telegram.org)', instagram: 'اینستاگرام (graph.facebook.com)' }

type Op = <T>(body: Record<string, unknown>, success?: (data: T) => string) => Promise<T | null>

function ServiceCard({ data }: { data: Overview }) {
  const { service, settings } = data
  return <section className="sa-card">
    <header className="sa-card-head">
      <h2>هستهٔ Xray</h2>
      <span className={`sa-state ${service.active ? 'is-ok' : service.installed ? 'is-warn' : 'is-bad'}`}>{service.active ? 'در حال اجرا' : service.installed ? 'نصب‌شده، خاموش' : 'نصب نیست'}</span>
    </header>
    <p className="sa-hint">پروکسی فقط روی همین سرور (127.0.0.1) گوش می‌دهد و از بیرون در دسترس نیست. فقط درخواست‌های سایت به تلگرام و اینستاگرام از آن عبور می‌کند؛ بقیهٔ اتصال‌ها مثل قبل مستقیم است.</p>
    {data.helperError && <Notice tone="error">{data.helperError}</Notice>}
    <dl className="sp-proxy-facts">
      <div><dt>نسخه</dt><dd dir="ltr">{service.version || '—'}</dd></div>
      <div><dt>پیکربندی</dt><dd>{settings.configured ? `${PROTOCOL[settings.protocol] || settings.protocol}${settings.label ? ` · ${settings.label}` : ''}` : 'تنظیم نشده'}</dd></div>
      <div><dt>سرور</dt><dd dir="ltr">{settings.server || '—'}</dd></div>
      <div><dt>آخرین اعمال</dt><dd>{settings.appliedAt ? faDate(settings.appliedAt) : '—'}</dd></div>
    </dl>
  </section>
}

function ConfigCard({ data, busy, op, onSaved }: { data: Overview; busy: string; op: Op; onSaved: () => void }) {
  const [link, setLink] = useState('')
  async function save(event: FormEvent) {
    event.preventDefault()
    const saved = await op<{ protocol: string; server: string }>({ op: 'save', link }, (r) => `پیکربندی ${PROTOCOL[r.protocol] || r.protocol} به ${r.server} ذخیره شد و پروکسی اجرا شد. ارسال تلگرام و اینستاگرام از این مسیر روشن است.`)
    if (saved) { setLink(''); onSaved() }
  }
  async function reveal() { const result = await op<{ link: string }>({ op: 'reveal' }); if (result) setLink(result.link) }
  return <section className="sa-card">
    <header className="sa-card-head"><h2>پیکربندی خروجی</h2></header>
    <form className="sa-form" onSubmit={save}>
      <label className="sa-field">
        <span>لینک یا JSON پیکربندی</span>
        <textarea className="input" dir="ltr" rows={4} spellCheck={false} autoComplete="off" value={link} onChange={(event) => setLink(event.target.value)} placeholder="vless://… · vmess://… · trojan://… · ss://… · {&quot;protocol&quot;: …}" required />
      </label>
      <p className="sa-hint">لینک اشتراک یک سرور (VLESS با REALITY یا TLS، VMess، Trojan، Shadowsocks، SOCKS یا HTTP) یا JSON خروجی Xray را وارد کنید. پیش از جایگزینی، Xray خودش پیکربندی را بررسی می‌کند؛ پیکربندی نامعتبر جای پیکربندی فعلی را نمی‌گیرد. لینک رمزگذاری‌شده ذخیره می‌شود.</p>
      <div className="sp-proxy-actions">
        <button type="submit" className="btn btn-primary" disabled={!!busy || !data.service.installed || !link.trim()}>{busy === 'save' ? 'در حال اعمال…' : 'ذخیره و اجرا'}</button>
        {data.settings.configured && <button type="button" className="btn btn-ghost" disabled={!!busy} onClick={() => void reveal()}>نمایش پیکربندی فعلی</button>}
      </div>
    </form>
  </section>
}

function UsageCard({ data, busy, op, test, setTest }: { data: Overview; busy: string; op: Op; test: Test | null; setTest: (test: Test | null) => void }) {
  const { service, settings } = data
  async function runTest() { setTest(null); const result = await op<Test>({ op: 'test' }); if (result) setTest(result) }
  function remove() {
    if (window.confirm('پروکسی متوقف و پیکربندی آن حذف شود؟ تلگرام و اینستاگرام دوباره مستقیم ارسال می‌شوند.')) void op({ op: 'remove' }, () => 'پروکسی متوقف و پیکربندی آن حذف شد.')
  }
  return <section className="sa-card">
    <header className="sa-card-head">
      <h2>استفادهٔ سایت از پروکسی</h2>
      <span className={`sa-state ${settings.enabled ? 'is-ok' : ''}`}>{settings.enabled ? 'روشن' : 'خاموش'}</span>
    </header>
    <p className="sa-hint">وقتی روشن است، ربات و مینی‌اپ تلگرام، ارسال خودکار به کانال تلگرام و انتشار در اینستاگرام از این پروکسی استفاده می‌کنند.</p>
    <div className="sp-proxy-actions">
      <button type="button" className={`btn ${settings.enabled ? 'btn-ghost' : 'btn-primary'}`} disabled={!!busy} onClick={() => void op({ op: 'enable', enabled: !settings.enabled }, (r: { enabled: boolean }) => r.enabled ? 'تلگرام و اینستاگرام از پروکسی ارسال می‌شوند.' : 'تلگرام و اینستاگرام دوباره مستقیم ارسال می‌شوند.')}>{settings.enabled ? 'خاموش کردن' : 'روشن کردن'}</button>
      <button type="button" className="btn btn-ghost" disabled={!!busy || !service.active} onClick={() => void runTest()}>{busy === 'test' ? 'در حال آزمایش…' : 'آزمایش اتصال'}</button>
      <button type="button" className="btn btn-ghost" disabled={!!busy} onClick={remove}>حذف پیکربندی</button>
    </div>
    {test && <ul className="sp-checks sp-proxy-checks" aria-live="polite">
      {test.results.map((item) => <li key={item.name} className={item.ok ? 'is-ok' : 'is-bad'}>
        <b>{TARGET[item.name] || item.name}</b>
        <span>{item.ok ? `پاسخ داد (HTTP ${fa(item.status || 0)}) در ${fa(item.ms)} میلی‌ثانیه` : `وصل نشد: ${item.error}`}</span>
      </li>)}
    </ul>}
  </section>
}

function Proxy() {
  const api = useServerApi()
  const { data, error, reload } = useServerJson<Overview>('/api/admin/server/proxy')
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState<Tone>(null)
  const [test, setTest] = useState<Test | null>(null)

  const op: Op = async (body, success) => {
    setBusy(String(body.op)); setNotice(null)
    const result = await api<never>('/api/admin/server/proxy', { body })
    setBusy('')
    if (!result.ok) { setNotice({ tone: 'error', text: result.error }); return null }
    if (success) setNotice({ tone: 'ok', text: success(result.data) })
    void reload()
    return result.data
  }

  if (error) return <Notice tone="error">{error}</Notice>
  if (!data) return <div className="sa-skeleton" aria-busy="true" />
  return <>
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    <ServiceCard data={data} />
    <ConfigCard data={data} busy={busy} op={op} onSaved={() => setTest(null)} />
    {data.settings.configured && <UsageCard data={data} busy={busy} op={op} test={test} setTest={setTest} />}
  </>
}

export default function ProxyPage() {
  return <ServerShell title="پروکسی شبکه‌های اجتماعی"><Proxy /></ServerShell>
}
