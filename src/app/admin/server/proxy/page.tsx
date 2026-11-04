'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { Notice, ServerShell, fa, faDate, useServerApi, useServerJson } from '../shared'

type Profile = { id: string; name: string; protocol: string; server: string; label: string; savedAt: string }
type Purpose = { key: string; label: string; hint: string }
type Overview = {
  service: { installed: boolean; version: string; configured: boolean; active: boolean; builder: number }
  helperError: string
  profiles: Profile[]
  routes: Record<string, string>
  purposes: Purpose[]
  appliedAt: string
  maxProfiles: number
}
type Check = { name: string; ok: boolean; status?: number; error?: string; ms: number }
type Tone = { tone: 'ok' | 'error'; text: string } | null
type Op = <T>(body: Record<string, unknown>, success?: (data: T) => string) => Promise<T | null>

const PROTOCOL: Record<string, string> = { vless: 'VLESS', vmess: 'VMess', trojan: 'Trojan', shadowsocks: 'Shadowsocks', socks: 'SOCKS', http: 'HTTP' }
const INSTALL = 'sudo bash /opt/mobocom/app/deploy/ubuntu/xray-install.sh'

function ServiceCard({ data }: { data: Overview }) {
  const { service } = data
  const used = Object.values(data.routes).filter(Boolean).length
  return <section className="sa-card">
    <header className="sa-card-head">
      <h2>هستهٔ Xray</h2>
      <span className={`sa-state ${service.active ? 'is-ok' : service.installed ? 'is-warn' : 'is-bad'}`}>{service.active ? 'در حال اجرا' : service.installed ? 'نصب‌شده، خاموش' : 'نصب نیست'}</span>
    </header>
    <p className="sa-hint">پروکسی فقط روی همین سرور (127.0.0.1) گوش می‌دهد و از بیرون در دسترس نیست. هر کار فقط به نشانی‌های خودش از پیکربندی‌ای که برایش انتخاب کرده‌اید می‌رود؛ هر اتصال دیگری مسدود است و بقیهٔ سایت مثل قبل مستقیم وصل می‌شود.</p>
    {data.helperError && <Notice tone="error">{data.helperError}</Notice>}
    {service.installed && service.builder < 2 && <Notice tone="error">ابزار Xray روی سرور نسخهٔ قدیمی است: فقط یک پیکربندی، آن هم برای تلگرام و اینستاگرام، اعمال می‌شود. برای چند پیکربندی و کاربردهای دیگر یک بار این دستور را روی سرور اجرا کنید: <code dir="ltr">{INSTALL}</code></Notice>}
    <dl className="sp-proxy-facts">
      <div><dt>نسخه</dt><dd dir="ltr">{service.version || '—'}</dd></div>
      <div><dt>پیکربندی‌ها</dt><dd>{fa(data.profiles.length)} از {fa(data.maxProfiles)}</dd></div>
      <div><dt>کارهای از طریق پروکسی</dt><dd>{used ? fa(used) : 'هیچ'}</dd></div>
      <div><dt>آخرین اعمال</dt><dd>{data.appliedAt ? faDate(data.appliedAt) : '—'}</dd></div>
    </dl>
  </section>
}

function ProfileForm({ data, editing, busy, op, onDone }: { data: Overview; editing: Profile | null; busy: string; op: Op; onDone: () => void }) {
  const [name, setName] = useState(editing?.name || '')
  const [link, setLink] = useState('')
  useEffect(() => { setName(editing?.name || ''); setLink('') }, [editing])
  async function save(event: FormEvent) {
    event.preventDefault()
    const saved = await op<Profile>({ op: 'profile', id: editing?.id, name, link }, (r) => editing ? `پیکربندی «${r.name}» ذخیره شد.` : `پیکربندی «${r.name}» (${PROTOCOL[r.protocol] || r.protocol} · ${r.server}) اضافه شد. حالا آن را برای یک کار انتخاب کنید.`)
    if (saved) { setLink(''); setName(''); onDone() }
  }
  async function reveal() { const result = await op<{ link: string }>({ op: 'reveal', id: editing?.id }); if (result) setLink(result.link) }
  return <form className="sa-form sp-xr-form" onSubmit={save}>
    <h3>{editing ? `ویرایش «${editing.name}»` : 'پیکربندی تازه'}</h3>
    <label className="sa-field">
      <span>نام</span>
      <input className="input" value={name} maxLength={60} onChange={(event) => setName(event.target.value)} placeholder="مثلاً سرور آلمان" required />
    </label>
    <label className="sa-field">
      <span>لینک یا JSON پیکربندی{editing ? ' (خالی بماند تا همان قبلی بماند)' : ''}</span>
      <textarea className="input" dir="ltr" rows={4} spellCheck={false} autoComplete="off" value={link} onChange={(event) => setLink(event.target.value)} placeholder="vless://… · vmess://… · trojan://… · ss://… · {&quot;protocol&quot;: …}" required={!editing} />
    </label>
    <p className="sa-hint">لینک اشتراک یک سرور (VLESS با REALITY یا TLS، VMess، Trojan، Shadowsocks، SOCKS یا HTTP) یا JSON خروجی Xray. Xray پیش از اعمال آن را بررسی می‌کند و پیکربندی نامعتبر جای پیکربندی فعلی را نمی‌گیرد. لینک رمزگذاری‌شده ذخیره می‌شود.</p>
    <div className="sp-proxy-actions">
      <button type="submit" className="btn btn-primary" disabled={!!busy || !data.service.installed || !name.trim() || (!editing && !link.trim())}>{busy === 'profile' ? 'در حال بررسی…' : editing ? 'ذخیرهٔ تغییرات' : 'افزودن پیکربندی'}</button>
      {editing && <button type="button" className="btn btn-ghost" disabled={!!busy} onClick={() => void reveal()}>نمایش لینک فعلی</button>}
      <button type="button" className="btn btn-ghost" disabled={!!busy} onClick={onDone}>انصراف</button>
    </div>
  </form>
}

function ProfilesCard({ data, busy, op }: { data: Overview; busy: string; op: Op }) {
  const [editing, setEditing] = useState<Profile | null>(null)
  const [adding, setAdding] = useState(!data.profiles.length)
  const usedBy = (id: string) => data.purposes.filter((p) => data.routes[p.key] === id).map((p) => p.label)
  function remove(profile: Profile) {
    const users = usedBy(profile.id)
    if (window.confirm(`پیکربندی «${profile.name}» حذف شود؟${users.length ? ` ${users.join('، ')} دوباره مستقیم وصل می‌شود.` : ''}`)) void op({ op: 'remove', id: profile.id }, () => `پیکربندی «${profile.name}» حذف شد.`)
  }
  const open = adding || !!editing
  return <section className="sa-card">
    <header className="sa-card-head">
      <h2>پیکربندی‌ها</h2>
      {!open && data.profiles.length < data.maxProfiles && <button type="button" className="btn btn-primary btn-sm" disabled={!data.service.installed} onClick={() => { setEditing(null); setAdding(true) }}>افزودن پیکربندی</button>}
    </header>
    {data.profiles.length > 0 && <ul className="sp-xr-profiles">
      {data.profiles.map((profile) => {
        const users = usedBy(profile.id)
        return <li key={profile.id} className={editing?.id === profile.id ? 'is-editing' : ''}>
          <div className="sp-xr-profile-main">
            <b>{profile.name}</b>
            <span dir="ltr" className="sp-xr-meta">{PROTOCOL[profile.protocol] || profile.protocol} · {profile.server}</span>
            <span className="sp-xr-users">{users.length ? users.map((u) => <span key={u} className="sa-state is-ok">{u}</span>) : <span className="sa-hint">برای هیچ کاری انتخاب نشده</span>}</span>
          </div>
          <div className="sp-proxy-actions">
            <button type="button" className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => { setAdding(false); setEditing(profile) }}>ویرایش</button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => remove(profile)}>حذف</button>
          </div>
        </li>
      })}
    </ul>}
    {open && <ProfileForm data={data} editing={editing} busy={busy} op={op} onDone={() => { setEditing(null); setAdding(false) }} />}
  </section>
}

function RoutesCard({ data, busy, op }: { data: Overview; busy: string; op: Op }) {
  const [routes, setRoutesState] = useState<Record<string, string>>(data.routes)
  const [checks, setChecks] = useState<Record<string, Check>>({})
  useEffect(() => { setRoutesState(data.routes) }, [data.routes])
  const changed = data.purposes.some((p) => (routes[p.key] || '') !== (data.routes[p.key] || ''))
  const old = data.service.builder < 2
  async function save() {
    const saved = await op<{ routes: Record<string, string> }>({ op: 'routes', routes }, () => 'مسیرها اعمال شد.')
    if (saved) setChecks({})
  }
  async function test() {
    setChecks({})
    const result = await op<{ results: Check[] }>({ op: 'test' })
    if (result) setChecks(Object.fromEntries(result.results.map((r) => [r.name, r])))
  }
  return <section className="sa-card">
    <header className="sa-card-head"><h2>هر کار از کدام پیکربندی</h2></header>
    <p className="sa-hint">برای هر کار یک پیکربندی انتخاب کنید یا «مستقیم» بگذارید. چند کار می‌توانند از یک پیکربندی استفاده کنند.</p>
    <ul className="sp-xr-routes">
      {data.purposes.map((purpose) => {
        const check = checks[purpose.key]
        const blocked = old && !['telegram', 'instagram'].includes(purpose.key)
        return <li key={purpose.key}>
          <div>
            <label htmlFor={`route-${purpose.key}`}><b>{purpose.label}</b></label>
            <span className="sa-hint">{purpose.hint}</span>
            {check && <span className={`sp-xr-check ${check.ok ? 'is-ok' : 'is-bad'}`} role="status">{check.ok ? `وصل شد (HTTP ${fa(check.status || 0)}، ${fa(check.ms)} میلی‌ثانیه)` : `وصل نشد: ${check.error}`}</span>}
          </div>
          <select id={`route-${purpose.key}`} className="input" value={routes[purpose.key] || ''} disabled={!!busy || blocked} onChange={(event) => setRoutesState((r) => ({ ...r, [purpose.key]: event.target.value }))}>
            <option value="">مستقیم (بدون پروکسی)</option>
            {data.profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
          </select>
        </li>
      })}
    </ul>
    <div className="sp-proxy-actions">
      <button type="button" className="btn btn-primary" disabled={!!busy || !changed || !data.service.installed} onClick={() => void save()}>{busy === 'routes' ? 'در حال اعمال…' : 'ذخیره و اعمال'}</button>
      <button type="button" className="btn btn-ghost" disabled={!!busy || changed || !data.service.active || !Object.values(data.routes).some(Boolean)} onClick={() => void test()}>{busy === 'test' ? 'در حال آزمایش…' : 'آزمایش اتصال'}</button>
    </div>
  </section>
}

function Proxy() {
  const api = useServerApi()
  const { data, error, reload } = useServerJson<Overview>('/api/admin/server/proxy')
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState<Tone>(null)

  const op: Op = async (body, success) => {
    setBusy(String(body.op)); setNotice(null)
    const result = await api<never>('/api/admin/server/proxy', { body })
    setBusy('')
    if (!result.ok) { setNotice({ tone: 'error', text: result.error }); return null }
    if (success) setNotice({ tone: 'ok', text: success(result.data) })
    if (body.op !== 'test' && body.op !== 'reveal') void reload()
    return result.data
  }

  if (error) return <Notice tone="error">{error}</Notice>
  if (!data) return <div className="sa-skeleton" aria-busy="true" />
  return <>
    {notice && <div aria-live="polite"><Notice tone={notice.tone}>{notice.text}</Notice></div>}
    <ServiceCard data={data} />
    <ProfilesCard data={data} busy={busy} op={op} />
    {data.profiles.length > 0 && <RoutesCard data={data} busy={busy} op={op} />}
  </>
}

export default function ProxyPage() {
  return <ServerShell title="پروکسی Xray"><Proxy /></ServerShell>
}
