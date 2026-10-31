'use client'

import { useState, type FormEvent } from 'react'
import { Notice, ServerShell, fa, faDate, useServerApi, useServerJson } from '../shared'
import CertificateImport from './CertificateImport'

type Mode = 'app' | 'static' | 'redirect' | 'proxy'
type Cert = { name: string; domains: string[]; expiresAt: string | null; daysLeft: number | null; valid: boolean }
type Site = { domain: string; mode: Mode; target: string; www: boolean; https: boolean; cert: string; note: string; dns: string[]; pointsHere: boolean | null; certificate: Cert | null }
type Tools = { installed: boolean; nginx?: number; certbot?: number; cloudflare?: number; renewTimer?: number; ip?: string; cfCredentials?: number }
type Overview = { tools: Tools; sites: Site[]; certificates: Cert[]; email: string; cloudflare: boolean; siteUrl: string; siteUrlSetting: string; error: string }
type Tone = { tone: 'ok' | 'error'; text: string } | null

const MODE_LABEL: Record<Mode, string> = { app: 'همین سایت', static: 'پوشهٔ فایل / هاست دانلود', redirect: 'انتقال به نشانی دیگر', proxy: 'پراکسی به سرویس دیگر' }
const TARGET_HINT: Record<Mode, string> = { app: '', static: '/var/www/dl', redirect: 'https://example.com', proxy: 'http://127.0.0.1:8080' }

function useOp(reload: () => void) {
  const api = useServerApi()
  const [notice, setNotice] = useState<Tone>(null)
  const [busy, setBusy] = useState('')
  async function op<T>(body: Record<string, unknown>, success: string | ((data: T) => string)) {
    setBusy(String(body.op)); setNotice(null)
    const result = await api<T>('/api/admin/server/domains', { body })
    setBusy('')
    if (result.ok) { setNotice({ tone: 'ok', text: typeof success === 'function' ? success(result.data) : success }); reload() } else setNotice({ tone: 'error', text: result.error })
    return result.ok ? result.data : null
  }
  return { op, notice, busy, setNotice }
}

function CertState({ cert }: { cert: Cert | null }) {
  if (!cert) return <span className="sa-state">بدون گواهی</span>
  const days = cert.daysLeft ?? -1
  return <span className={`sa-state ${!cert.valid ? 'is-bad' : days < 15 ? 'is-warn' : 'is-ok'}`}>{cert.valid ? `${fa(days)} روز اعتبار` : 'منقضی / نامعتبر'}</span>
}

function Tooling({ tools, error }: { tools: Tools; error: string }) {
  const items: [string, boolean][] = [['Nginx', !!tools.nginx], ['Certbot', !!tools.certbot], ['افزونهٔ DNS کلادفلر', !!tools.cloudflare], ['تمدید خودکار (certbot.timer)', !!tools.renewTimer]]
  if (!tools.installed) return <section className="sa-card sp-blocked">
    <h2>ابزار مدیریت دامنه روی سرور نصب نیست</h2>
    <p>{error || 'برنامه نمی‌تواند Nginx و Certbot را مدیریت کند.'} برای فعال‌سازی، اسکریپت نصب پنل را یک بار دیگر اجرا کنید؛ Certbot، افزونهٔ DNS کلادفلر و ابزار <bdi dir="ltr">mobocom-webctl</bdi> نصب و تمدید خودکار روشن می‌شود.</p>
    <pre className="sp-pre" dir="ltr">{'cd /opt/mobocom/app\nsudo bash deploy/ubuntu/server-panel-install.sh\nsudo systemctl restart mobocom'}</pre>
  </section>
  return <section className="sa-card">
    <header className="sa-card-head"><h2>وضعیت سرور</h2>{tools.ip && <small>IP سرور: <bdi dir="ltr">{tools.ip}</bdi></small>}</header>
    <ul className="sp-checks">{items.map(([label, ready]) => <li key={label}><span className={`sa-state ${ready ? 'is-ok' : 'is-warn'}`}>{ready ? 'آماده' : 'نصب نیست'}</span>{label}</li>)}</ul>
  </section>
}

function SiteAddress({ data, reload }: { data: Overview; reload: () => void }) {
  const { op, notice, busy } = useOp(reload)
  const [url, setUrl] = useState(data.siteUrl || data.siteUrlSetting)
  const host = url.replace(/^https?:\/\//, '')
  const secure = url.startsWith('https://')
  const covered = data.certificates.some((cert) => cert.valid && cert.domains.some((name) => name === host || (name.startsWith('*.') && host.endsWith(name.slice(1)) && host.split('.').length === name.split('.').length)))
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!window.confirm(`نشانی سایت به ${url} تغییر کند؟ سایت چند ثانیه دوباره راه‌اندازی می‌شود و ورودها با نشانی تازه کار می‌کنند.`)) return
    await op({ op: 'site-url', url }, 'نشانی ذخیره شد؛ سایت در حال راه‌اندازی دوباره است. چند ثانیه بعد صفحه را با نشانی تازه باز کنید.')
  }
  return <section className="sa-card sa-form">
    <header className="sa-card-head"><h2>نشانی اصلی سایت</h2><small>فعلی: <bdi dir="ltr">{data.siteUrl || '—'}</bdi></small></header>
    <p className="sa-hint">نشانی‌ای که در پیوندهای ایمیل، بازگشت درگاه پرداخت، ورود با تلگرام و نقشهٔ سایت استفاده می‌شود. پیش از تغییر، دامنهٔ تازه را در «دامنه‌ها» با حالت «همین سایت» اضافه و برایش گواهی SSL بگیرید.</p>
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    <form className="sa-toolbar" onSubmit={submit}>
      <input className="input" dir="ltr" value={url} onChange={(e) => setUrl(e.target.value.trim())} placeholder="https://mobocom.net" aria-label="نشانی سایت" />
      <button type="submit" className="btn btn-primary" disabled={!!busy || !/^https?:\/\/[^/]+\.[^/]+$/.test(url) || url === data.siteUrl}>ذخیره و راه‌اندازی دوباره</button>
    </form>
    {secure && host && !covered && <Notice tone="error">برای <bdi dir="ltr">{host}</bdi> گواهی معتبری پیدا نشد؛ با HTTPS، مرورگر بازدیدکنندگان خطا نشان می‌دهد.</Notice>}
  </section>
}

const EMPTY_SITE = { domain: '', mode: 'app' as Mode, target: '', www: true, https: false, cert: '', note: '' }

function Sites({ data, reload }: { data: Overview; reload: () => void }) {
  const { op, notice, busy } = useOp(reload)
  const [form, setForm] = useState<typeof EMPTY_SITE | null>(null)
  const editing = form && data.sites.some((site) => site.domain === form.domain)
  const apex = (domain: string) => domain.split('.').length === 2
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!form) return
    const done = await op<{ domain: string }>({ op: 'site-save', site: { ...form, www: form.www && apex(form.domain) } }, (r) => `دامنهٔ ${r.domain} روی Nginx اعمال شد.`)
    if (done) setForm(null)
  }
  return <section className="sa-card sa-table-wrap">
    <header className="sa-card-head"><h2>دامنه‌ها و زیردامنه‌ها</h2><button type="button" className="btn btn-primary btn-sm" onClick={() => setForm(form ? null : { ...EMPTY_SITE })}>{form ? 'بستن' : 'افزودن دامنه'}</button></header>
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    {form && <form className="sa-form sp-site-form" onSubmit={submit}>
      <div className="sa-cols">
        <label className="sa-field"><span>دامنه یا زیردامنه</span><input className="input" dir="ltr" value={form.domain} readOnly={!!editing} onChange={(e) => setForm({ ...form, domain: e.target.value.trim().toLowerCase() })} placeholder="dl.mobocom.net" required /></label>
        <label className="sa-field"><span>کاربرد</span><select className="select" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value as Mode, target: '' })}>{(Object.keys(MODE_LABEL) as Mode[]).map((mode) => <option key={mode} value={mode}>{MODE_LABEL[mode]}</option>)}</select></label>
      </div>
      {form.mode !== 'app' && <label className="sa-field"><span>{form.mode === 'static' ? 'پوشه روی سرور' : form.mode === 'redirect' ? 'نشانی مقصد' : 'نشانی سرویس داخلی'}</span><input className="input" dir="ltr" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value.trim() })} placeholder={TARGET_HINT[form.mode]} required /></label>}
      <div className="sa-toolbar">
        {apex(form.domain) && <label className="sa-check"><input type="checkbox" checked={form.www} onChange={(e) => setForm({ ...form, www: e.target.checked })} /> <span>www هم پاسخ دهد</span></label>}
        <label className="sa-check"><input type="checkbox" checked={form.https} onChange={(e) => setForm({ ...form, https: e.target.checked })} /> <span>HTTPS (نیاز به گواهی)</span></label>
        {form.https && <select className="select" value={form.cert} onChange={(e) => setForm({ ...form, cert: e.target.value })} aria-label="گواهی"><option value="">انتخاب خودکار گواهی</option>{data.certificates.map((cert) => <option key={cert.name} value={cert.name}>{cert.name} ({cert.domains.join('، ')})</option>)}</select>}
      </div>
      <input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="یادداشت (اختیاری)" aria-label="یادداشت" />
      <p className="sa-hint">پیش از افزودن، در DNS دامنه یک رکورد A به IP سرور{data.tools.ip ? <> (<bdi dir="ltr">{data.tools.ip}</bdi>)</> : ''} بسازید. اگر پیکربندی توسط Nginx پذیرفته نشود، نسخهٔ قبلی به‌طور خودکار برمی‌گردد.</p>
      <button type="submit" className="btn btn-primary" disabled={!!busy || !form.domain}>{busy === 'site-save' ? 'در حال اعمال…' : 'ذخیره و اعمال'}</button>
    </form>}
    <table className="data sa-table" style={{ minWidth: 760 }}><thead><tr><th>دامنه</th><th>کاربرد</th><th>DNS</th><th>SSL</th><th /></tr></thead><tbody>
      {data.sites.map((site) => <tr key={site.domain}>
        <td dir="ltr"><a className="text-link" href={`${site.https ? 'https' : 'http'}://${site.domain}`} target="_blank" rel="noreferrer"><b>{site.domain}</b></a>{site.www && <small> + www</small>}{site.note && <><br /><small dir="auto">{site.note}</small></>}</td>
        <td>{MODE_LABEL[site.mode]}{site.target && <><br /><small dir="ltr"><code>{site.target}</code></small></>}</td>
        <td>{site.pointsHere === true ? <span className="sa-state is-ok">به این سرور</span> : site.dns.length ? <span className="sa-state is-warn" title={site.dns.join(', ')}>به سرور دیگر</span> : <span className="sa-state is-bad">ثبت نشده</span>}</td>
        <td>{site.https ? <CertState cert={site.certificate} /> : <span className="sa-state">HTTP</span>}</td>
        <td className="sp-row-actions">
          <button type="button" className="sa-link" onClick={() => setForm({ domain: site.domain, mode: site.mode, target: site.target, www: site.www, https: site.https, cert: site.cert, note: site.note })}>ویرایش</button>
          {!site.https && <button type="button" className="sa-link" disabled={!!busy} onClick={() => void op({ op: 'cert-issue', domain: site.domain, www: site.www }, 'گواهی صادر شد؛ اکنون HTTPS را روشن کنید.')}>گرفتن SSL</button>}
          <button type="button" className="sa-link is-danger" onClick={() => { if (window.confirm(`دامنهٔ ${site.domain} از Nginx حذف شود؟ گواهی آن باقی می‌ماند.`)) void op({ op: 'site-remove', domain: site.domain }, 'دامنه حذف شد.') }}>حذف</button>
        </td>
      </tr>)}
      {!data.sites.length && <tr><td colSpan={5} className="sa-empty">هنوز دامنه‌ای از این پنل تعریف نشده است.</td></tr>}
    </tbody></table>
  </section>
}

function Certificates({ data, reload }: { data: Overview; reload: () => void }) {
  const { op, notice, busy } = useOp(reload)
  const [form, setForm] = useState({ domain: '', method: 'http', wildcard: false, www: true, email: data.email, extra: '' })
  const [output, setOutput] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault()
    await op<{ name: string; names: string[] }>({ op: 'cert-issue', ...form, extra: form.extra.split(/[\s,،]+/).filter(Boolean) }, (r) => `گواهی ${r.name} برای ${r.names.join('، ')} صادر شد و خودکار تمدید می‌شود.`)
  }
  async function renew(dry: boolean) {
    const r = await op<{ ok: boolean; output: string }>({ op: 'cert-renew', dry }, (res) => res.ok ? (dry ? 'آزمایش تمدید موفق بود؛ تمدید خودکار درست کار می‌کند.' : 'گواهی‌های نزدیک به انقضا تمدید شدند.') : 'تمدید با خطا روبه‌رو شد؛ خروجی را ببینید.')
    if (r) setOutput(r.output)
  }
  return <div className="sa-cols">
    <section className="sa-card sa-table-wrap">
      <header className="sa-card-head"><h2>گواهی‌های SSL</h2>
        <div className="sa-head-actions"><button type="button" className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => void renew(true)}>آزمایش تمدید</button><button type="button" className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => void renew(false)}>{busy === 'cert-renew' ? 'در حال تمدید…' : 'تمدید اکنون'}</button></div>
      </header>
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      <table className="data sa-table" style={{ minWidth: 560 }}><thead><tr><th>نام</th><th>دامنه‌ها</th><th>انقضا</th><th /></tr></thead><tbody>
        {data.certificates.map((cert) => <tr key={cert.name}>
          <td dir="ltr"><b>{cert.name}</b></td>
          <td dir="ltr"><small>{cert.domains.join(' ')}</small></td>
          <td><CertState cert={cert} />{cert.expiresAt && <><br /><small>{faDate(cert.expiresAt)}</small></>}</td>
          <td><button type="button" className="sa-link is-danger" onClick={() => { if (window.confirm(`گواهی ${cert.name} حذف شود؟`)) void op({ op: 'cert-delete', name: cert.name }, 'گواهی حذف شد.') }}>حذف</button></td>
        </tr>)}
        {!data.certificates.length && <tr><td colSpan={4} className="sa-empty">گواهی‌ای روی سرور نیست.</td></tr>}
      </tbody></table>
      <div className="sp-pad"><p className="sa-hint">Certbot گواهی‌های صادرشده را در بازهٔ مناسب پیش از انقضا خودکار تمدید می‌کند{data.tools.renewTimer ? '' : ' — اما تایمر تمدید روی این سرور فعال نیست؛ اسکریپت نصب را دوباره اجرا کنید'}. گواهی‌های با پیشوند manual- بارگذاری‌شده‌اند و باید دستی جایگزین شوند.</p>
      {output && <pre className="sp-pre" dir="ltr">{output}</pre>}</div>
    </section>
    <form className="sa-card sa-form" onSubmit={submit}>
      <header className="sa-card-head"><h2>گرفتن گواهی تازه</h2></header>
      <label className="sa-field"><span>دامنه</span><input className="input" dir="ltr" value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value.trim().toLowerCase() })} placeholder="mobocom.net" required /></label>
      <fieldset className="sp-methods">
        <legend>روش تأیید</legend>
        <label className="sa-check"><input type="radio" name="method" checked={form.method === 'http'} onChange={() => setForm({ ...form, method: 'http', wildcard: false })} /> <span><b>HTTP / Webroot</b> — تأیید از مسیر وب‌سرور فعلی</span></label>
        <label className="sa-check"><input type="radio" name="method" checked={form.method === 'cloudflare'} onChange={() => setForm({ ...form, method: 'cloudflare' })} /> <span><b>DNS کلادفلر</b> — دامنهٔ عادی یا Wildcard، حتی پشت پروکسی</span></label>
        <label className="sa-check"><input type="radio" name="method" checked={form.method === 'standalone'} onChange={() => setForm({ ...form, method: 'standalone', wildcard: false })} /> <span><b>Standalone</b> — پورت ۸۰ باید آزاد باشد؛ سرویس دیگری خودکار متوقف نمی‌شود</span></label>
      </fieldset>
      {form.method === 'cloudflare' && <label className="sa-check"><input type="checkbox" checked={form.wildcard} onChange={event => setForm({ ...form, wildcard: event.target.checked })} />پوشش همهٔ زیردامنه‌ها (Wildcard)</label>}
      {form.method === 'cloudflare' && !data.cloudflare && <Notice tone="error">ابتدا در زبانهٔ Cloudflare توکن API را ثبت کنید.</Notice>}
      {!form.wildcard && <label className="sa-check"><input type="checkbox" checked={form.www} onChange={(e) => setForm({ ...form, www: e.target.checked })} /> <span>www هم پوشش داده شود</span></label>}
      <label className="sa-field"><span>نام‌های بیشتر (اختیاری)</span><input className="input" dir="ltr" value={form.extra} onChange={(e) => setForm({ ...form, extra: e.target.value })} placeholder="dl.mobocom.net shop.mobocom.net" /></label>
      <label className="sa-field"><span>ایمیل (هشدار انقضا از Let&apos;s Encrypt)</span><input className="input" dir="ltr" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
      <button type="submit" className="btn btn-primary" disabled={!!busy || !form.domain || (form.method === 'cloudflare' && !data.cloudflare)}>{busy === 'cert-issue' ? 'در حال صدور (تا چند دقیقه)…' : 'صدور گواهی'}</button>
    </form>
    <CertificateImport reload={reload} />
  </div>
}

type Zone = { id: string; name: string; status: string; nameServers: string[] }
type DnsRecord = { id: string; type: string; name: string; content: string; proxied: boolean; ttl: number }
const EMPTY_RECORD = { id: '', type: 'A', name: '', content: '', proxied: false, ttl: 1 }

function Records({ zone, ip }: { zone: Zone; ip: string }) {
  const { data, error, reload } = useServerJson<{ records: DnsRecord[] }>(`/api/admin/server/domains?view=records&zone=${zone.id}`)
  const { op, notice, busy } = useOp(() => void reload())
  const [form, setForm] = useState({ ...EMPTY_RECORD, content: ip })
  const short = (name: string) => name === zone.name ? '@' : name.replace(`.${zone.name}`, '')
  async function submit(event: FormEvent) {
    event.preventDefault()
    const done = await op({ op: 'dns-save', zone: zone.id, zoneName: zone.name, record: form }, form.id ? 'رکورد به‌روز شد.' : 'رکورد ساخته شد.')
    if (done) setForm({ ...EMPTY_RECORD, content: ip })
  }
  return <div className="sa-stack">
    {(error || notice) && <Notice tone={error ? 'error' : notice!.tone}>{error || notice!.text}</Notice>}
    <form className="sa-toolbar sp-dns-form" onSubmit={submit}>
      <select className="select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} aria-label="نوع">{['A', 'AAAA', 'CNAME', 'TXT', 'MX'].map((type) => <option key={type}>{type}</option>)}</select>
      <input className="input" dir="ltr" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value.trim() })} placeholder="dl یا @" aria-label="نام" />
      <input className="input" dir="ltr" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value.trim() })} placeholder={form.type === 'CNAME' ? zone.name : '1.2.3.4'} aria-label="مقدار" required />
      {['A', 'AAAA', 'CNAME'].includes(form.type) && <label className="sa-check"><input type="checkbox" checked={form.proxied} onChange={(e) => setForm({ ...form, proxied: e.target.checked })} /> <span>پروکسی کلادفلر</span></label>}
      <button type="submit" className="btn btn-primary btn-sm" disabled={!!busy}>{form.id ? 'ذخیرهٔ تغییر' : 'افزودن رکورد'}</button>
      {form.id && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm({ ...EMPTY_RECORD, content: ip })}>انصراف</button>}
    </form>
    {!data ? <div className="sa-skeleton" style={{ height: 120 }} /> : <div className="sa-table-wrap"><table className="data sa-table" style={{ minWidth: 640 }}><thead><tr><th>نوع</th><th>نام</th><th>مقدار</th><th>پروکسی</th><th /></tr></thead><tbody>
      {data.records.map((record) => <tr key={record.id}>
        <td dir="ltr"><code>{record.type}</code></td>
        <td dir="ltr"><b>{short(record.name)}</b></td>
        <td dir="ltr"><code className="sp-trunc">{record.content}</code></td>
        <td>{record.proxied ? <span className="sa-state is-warn">نارنجی</span> : <span className="sa-state">فقط DNS</span>}</td>
        <td className="sp-row-actions">
          <button type="button" className="sa-link" onClick={() => setForm({ id: record.id, type: record.type, name: short(record.name), content: record.content, proxied: record.proxied, ttl: record.ttl })}>ویرایش</button>
          <button type="button" className="sa-link is-danger" onClick={() => { if (window.confirm(`رکورد ${record.type} ${record.name} حذف شود؟`)) void op({ op: 'dns-delete', zone: zone.id, zoneName: zone.name, id: record.id }, 'رکورد حذف شد.') }}>حذف</button>
        </td>
      </tr>)}
      {!data.records.length && <tr><td colSpan={5} className="sa-empty">رکوردی نیست.</td></tr>}
    </tbody></table></div>}
  </div>
}

function Cloudflare({ data, reload }: { data: Overview; reload: () => void }) {
  const { op, notice, busy } = useOp(reload)
  const [token, setToken] = useState('')
  const zones = useServerJson<{ zones: Zone[] }>(data.cloudflare ? '/api/admin/server/domains?view=zones' : null)
  const [zone, setZone] = useState('')
  const active = zones.data?.zones.find((item) => item.id === zone) || zones.data?.zones[0]
  return <>
    <section className="sa-card sa-form">
      <header className="sa-card-head"><h2>اتصال به Cloudflare</h2><span className={`sa-state ${data.cloudflare ? 'is-ok' : 'is-warn'}`}>{data.cloudflare ? 'متصل' : 'متصل نیست'}</span></header>
      <p className="sa-hint">در داشبورد کلادفلر: My Profile ← API Tokens ← Create Token ← قالب «Edit zone DNS» (دسترسی Zone · DNS · Edit برای دامنه‌های شما). توکن رمزنگاری‌شده ذخیره می‌شود و برای ساخت رکوردها و صدور و تمدید خودکار گواهی Wildcard به کار می‌رود.</p>
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      <form className="sa-toolbar" onSubmit={(e) => { e.preventDefault(); void op({ op: 'cf-token', token }, 'توکن بررسی و ذخیره شد.').then((done) => { if (done) { setToken(''); void zones.reload() } }) }}>
        <input className="input" dir="ltr" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value.trim())} placeholder={data.cloudflare ? '•••••••• (برای تعویض، توکن تازه)' : 'Cloudflare API token'} aria-label="توکن API" />
        <button type="submit" className="btn btn-primary" disabled={!!busy || !token}>بررسی و ذخیره</button>
        {data.cloudflare && <button type="button" className="btn btn-ghost sp-danger" onClick={() => { if (window.confirm('اتصال کلادفلر برداشته شود؟ تمدید گواهی‌های Wildcard با فایل اعتبارنامهٔ موجود ادامه می‌یابد.')) void op({ op: 'cf-token', token: '' }, 'اتصال برداشته شد.') }}>قطع اتصال</button>}
      </form>
    </section>
    {data.cloudflare && <section className="sa-card">
      <header className="sa-card-head"><h2>رکوردهای DNS</h2>
        {zones.data && zones.data.zones.length > 0 && <select className="select" dir="ltr" value={active?.id || ''} onChange={(e) => setZone(e.target.value)} aria-label="دامنه">{zones.data.zones.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
      </header>
      {zones.error && <Notice tone="error">{zones.error}</Notice>}
      {active ? <>
        {active.status !== 'active' && <Notice tone="error">این دامنه در کلادفلر فعال نیست؛ Name Serverهای دامنه را به <bdi dir="ltr">{active.nameServers.join(' , ')}</bdi> تغییر دهید.</Notice>}
        <Records key={active.id} zone={active} ip={data.tools.ip || ''} />
      </> : zones.data ? <p className="sa-empty">این توکن به هیچ دامنه‌ای دسترسی ندارد.</p> : <div className="sa-skeleton" />}
    </section>}
  </>
}

function Domains() {
  const { data, error, reload } = useServerJson<Overview>('/api/admin/server/domains')
  const [tab, setTab] = useState<'sites' | 'certs' | 'cloudflare' | 'url'>('sites')
  if (error) return <Notice tone="error">{error}</Notice>
  if (!data) return <div className="sa-skeleton" />
  const refresh = () => void reload()
  const expiring = data.certificates.filter((cert) => (cert.daysLeft ?? 0) < 15)
  return <>
    <Tooling tools={data.tools} error={data.error} />
    {expiring.length > 0 && <Notice tone="error">گواهی {expiring.map((cert) => cert.name).join('، ')} منقضی شده یا کمتر از ۱۵ روز اعتبار دارد. گواهی‌های manual را با فایل تازه جایگزین کنید؛ برای گواهی‌های Certbot، «آزمایش تمدید» را بررسی کنید.</Notice>}
    {data.tools.installed && <>
      <nav className="sa-subtabs sp-subtabs" aria-label="بخش‌های دامنه">
        {([['sites', `دامنه‌ها (${fa(data.sites.length)})`], ['certs', `گواهی SSL (${fa(data.certificates.length)})`], ['cloudflare', 'Cloudflare DNS'], ['url', 'نشانی سایت']] as const).map(([id, label]) => <button key={id} type="button" className={tab === id ? 'is-active' : ''} aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>)}
      </nav>
      {tab === 'sites' && <Sites data={data} reload={refresh} />}
      {tab === 'certs' && <Certificates data={data} reload={refresh} />}
      {tab === 'cloudflare' && <Cloudflare data={data} reload={refresh} />}
      {tab === 'url' && <SiteAddress data={data} reload={refresh} />}
    </>}
  </>
}

export default function DomainsPage() {
  return <ServerShell title="دامنه و SSL"><Domains /></ServerShell>
}
