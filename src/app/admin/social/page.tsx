'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from '@/components/AppLink'

type Settings = {
  types: Record<string, boolean>; delayMinutes: number; utm: boolean
  telegram: { enabled: boolean; channel: string; template: string; button: string; silent: boolean }
  instagram: { enabled: boolean; accountId: string; accessToken: string; hasToken?: boolean; graphVersion: string; template: string; hashtags: string }
  push: { enabled: boolean; title: string; body: string }
}
type Post = { id: number; channel: string; itemType: string; itemId: number; status: string; attempts: number; error: string; externalId: string; nextAttemptAt: string; sentAt: string | null; createdAt: string; item: { title: string; url: string } | null }
type Data = { settings: Settings; log: { total: number; page: number; pages: number; posts: Post[] }; pending: number; base: string }

const TYPES: [string, string][] = [['software', '💾 نرم‌افزار'], ['game', '🎮 بازی'], ['title', '🎬 فیلم و سریال'], ['album', '💿 آلبوم'], ['track', '🎵 تک‌آهنگ'], ['post', '📰 مقاله'], ['product', '🛍 محصول']]
const CHANNEL: Record<string, string> = { TELEGRAM: 'تلگرام', INSTAGRAM: 'اینستاگرام', PUSH: 'اعلان مرورگر' }
const STATUS: Record<string, string> = { PENDING: 'در صف', SENDING: 'در حال ارسال', SENT: 'ارسال شد', FAILED: 'ناموفق', SKIPPED: 'رد شد' }
const VARS = '{icon} {type} {title} {subtitle} {summary} {url} {hashtags}'

/** Auto-publishing to Telegram, Instagram and web push, with the announcement log. */
export default function AdminSocialPage() {
  const [data, setData] = useState<Data | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [tab, setTab] = useState<'log' | 'telegram' | 'instagram' | 'rules'>('log')
  const [busy, setBusy] = useState(false)
  const [manual, setManual] = useState('')
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)

  const load = useCallback(async (page = 1) => {
    const response = await fetch(`/api/admin/social?page=${page}`, { cache: 'no-store' }).catch(() => null)
    const body = await response?.json().catch(() => null)
    if (response?.ok) { setData(body); setSettings((current) => current || body.settings) }
    else setMessage({ text: body?.error || 'دریافت اطلاعات ناموفق بود', error: true })
  }, [])
  useEffect(() => { void load() }, [load])

  async function call(method: 'POST' | 'PATCH', body: unknown, success: string) {
    setBusy(true); setMessage(null)
    const response = await fetch('/api/admin/social', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)
    const result = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) { setMessage({ text: result?.error || 'انجام نشد', error: true }); return null }
    setMessage({ text: success, error: false })
    if (method === 'PATCH' && result?.settings) setSettings(result.settings)
    await load(data?.log.page || 1)
    return result
  }

  if (!data || !settings) return <div className="xm-page" dir="rtl">{message ? <div className="xm-notice is-error" role="alert">{message.text}</div> : <div className="tb-empty">در حال بارگذاری…</div>}</div>
  const save = () => void call('PATCH', settings, 'تنظیمات ذخیره شد')
  const tg = settings.telegram
  const ig = settings.instagram

  return <div className="xm-page" dir="rtl">
    <header className="tb-hero"><div><span className="tb-eyebrow">SOCIAL</span><h1>انتشار خودکار در شبکه‌های اجتماعی</h1>
      <p>وقتی نرم‌افزار، بازی، فیلم، موزیک، مقاله یا محصولی برای اولین بار منتشر می‌شود، خودکار با تصویر و لینک در کانال تلگرام، صفحهٔ اینستاگرام و اعلان مرورگر اعلام می‌شود. {data.pending ? `${data.pending.toLocaleString('fa-IR')} مورد در صف.` : ''}</p></div></header>
    <nav className="tb-tabs" role="tablist" aria-label="بخش‌ها">
      {([['log', 'گزارش ارسال‌ها'], ['telegram', `تلگرام${tg.enabled ? ' ✓' : ''}`], ['instagram', `اینستاگرام${ig.enabled ? ' ✓' : ''}`], ['rules', 'قواعد و اعلان مرورگر']] as const).map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'is-active' : ''} onClick={() => setTab(key)}>{label}</button>)}
    </nav>
    {message && <div className={`xm-notice${message.error ? ' is-error' : ''}`} role="status">{message.text}</div>}

    {tab === 'log' && <section className="xm-section">
      <form className="card fa-inline fa-wrap" style={{ padding: '1rem' }} onSubmit={(e) => { e.preventDefault(); void call('POST', { action: 'announce', item: manual.trim() }, 'در صف انتشار قرار گرفت') }}>
        <label className="studio-field fa-grow"><span>انتشار دستی یک مورد (مثلاً <code dir="ltr">software:12</code>)</span><input className="input" dir="ltr" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="type:id" /></label>
        <button className="btn btn-primary btn-sm" disabled={busy || !manual.trim()}>انتشار</button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void call('POST', { action: 'run' }, 'صف پردازش شد')}>پردازش صف</button>
      </form>
      <div className="table-wrap card"><table className="table"><thead><tr><th>مورد</th><th>کانال</th><th>وضعیت</th><th>زمان</th><th /></tr></thead><tbody>
        {data.log.posts.map((post) => <tr key={post.id}>
          <td>{post.item ? <Link href={post.item.url} target="_blank">{post.item.title}</Link> : <span className="muted" dir="ltr">{post.itemType}:{post.itemId}</span>}</td>
          <td>{CHANNEL[post.channel] || post.channel}</td>
          <td><span className={`badge${post.status === 'FAILED' ? ' badge-red' : ''}`}>{STATUS[post.status] || post.status}</span>{post.error && <><br /><small className="muted">{post.error}</small></>}{post.attempts > 1 && <small className="muted"> · {post.attempts.toLocaleString('fa-IR')} تلاش</small>}</td>
          <td><small>{new Date(post.sentAt || post.nextAttemptAt).toLocaleString('fa-IR')}</small></td>
          <td>{['FAILED', 'SKIPPED'].includes(post.status) && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void call('POST', { action: 'retry', id: post.id }, 'دوباره ارسال شد')}>تلاش دوباره</button>}</td>
        </tr>)}
        {!data.log.posts.length && <tr><td colSpan={5} className="muted">هنوز چیزی منتشر نشده است. پس از فعال‌کردن یک کانال، محتوای تازه اینجا دیده می‌شود.</td></tr>}
      </tbody></table></div>
      {data.log.pages > 1 && <div className="fa-inline" style={{ justifyContent: 'center' }}><button type="button" className="btn btn-ghost btn-sm" disabled={data.log.page <= 1} onClick={() => void load(data.log.page - 1)}>قبلی</button><span>{data.log.page.toLocaleString('fa-IR')} / {data.log.pages.toLocaleString('fa-IR')}</span><button type="button" className="btn btn-ghost btn-sm" disabled={data.log.page >= data.log.pages} onClick={() => void load(data.log.page + 1)}>بعدی</button></div>}
    </section>}

    {tab === 'telegram' && <section className="xm-section">
      <form className="card fr-admin-form" onSubmit={(e) => { e.preventDefault(); save() }}>
        <p className="muted fr-admin-wide">از همان ربات تنظیم‌شده در «ربات و مینی‌اپ» استفاده می‌شود. ربات را به‌عنوان <b>مدیر</b> با اجازهٔ ارسال پیام به کانال اضافه کنید.</p>
        <label className="studio-switch fr-admin-wide"><input type="checkbox" checked={tg.enabled} onChange={(e) => setSettings({ ...settings, telegram: { ...tg, enabled: e.target.checked } })} />انتشار خودکار در کانال تلگرام</label>
        <label className="studio-field"><span>کانال</span><input className="input" dir="ltr" value={tg.channel} onChange={(e) => setSettings({ ...settings, telegram: { ...tg, channel: e.target.value } })} placeholder="@mobocom یا -1001234567890" /></label>
        <label className="studio-field"><span>متن دکمه</span><input className="input" value={tg.button} onChange={(e) => setSettings({ ...settings, telegram: { ...tg, button: e.target.value } })} maxLength={40} /></label>
        <label className="studio-switch"><input type="checkbox" checked={tg.silent} onChange={(e) => setSettings({ ...settings, telegram: { ...tg, silent: e.target.checked } })} />ارسال بی‌صدا</label>
        <label className="studio-field fr-admin-wide"><span>قالب پست (متغیرها: <code dir="ltr">{VARS}</code>)</span><textarea className="input" rows={7} value={tg.template} onChange={(e) => setSettings({ ...settings, telegram: { ...tg, template: e.target.value } })} /></label>
        <div className="fr-admin-actions"><button className="btn btn-primary btn-sm" disabled={busy}>ذخیره</button><button type="button" className="btn btn-ghost btn-sm" disabled={busy || !tg.channel} onClick={() => void call('POST', { action: 'test-telegram' }, 'پیام آزمایشی به کانال فرستاده شد')}>ارسال پیام آزمایشی</button></div>
      </form>
    </section>}

    {tab === 'instagram' && <section className="xm-section">
      <form className="card fr-admin-form" onSubmit={(e) => { e.preventDefault(); save() }}>
        <p className="muted fr-admin-wide">اینستاگرام فقط از طریق <b>Instagram Graph API</b> و حساب <b>Business یا Creator</b> متصل به یک صفحهٔ فیسبوک اجازهٔ انتشار خودکار می‌دهد. شناسهٔ حساب اینستاگرام (IG User ID) و یک توکن دسترسی بلندمدت با مجوز <code dir="ltr">instagram_content_publish</code> لازم است. تصویر هر پست به‌صورت خودکار به JPEG ‏۱۰۸۰×۱۳۵۰ تبدیل می‌شود؛ نشانی سایت ({data.base}) باید https و در دسترس اینستاگرام باشد.</p>
        <label className="studio-switch fr-admin-wide"><input type="checkbox" checked={ig.enabled} onChange={(e) => setSettings({ ...settings, instagram: { ...ig, enabled: e.target.checked } })} />انتشار خودکار در اینستاگرام</label>
        <label className="studio-field"><span>IG User ID</span><input className="input" dir="ltr" value={ig.accountId} onChange={(e) => setSettings({ ...settings, instagram: { ...ig, accountId: e.target.value } })} placeholder="17841400000000000" /></label>
        <label className="studio-field"><span>توکن دسترسی {ig.hasToken ? '(ذخیره شده)' : ''}</span><input className="input" dir="ltr" type="password" autoComplete="new-password" value={ig.accessToken} onChange={(e) => setSettings({ ...settings, instagram: { ...ig, accessToken: e.target.value } })} placeholder={ig.hasToken ? '•••••••• (برای تغییر، توکن تازه وارد کنید)' : 'EAAG…'} /></label>
        <label className="studio-field"><span>نسخهٔ Graph API</span><input className="input" dir="ltr" value={ig.graphVersion} onChange={(e) => setSettings({ ...settings, instagram: { ...ig, graphVersion: e.target.value } })} /></label>
        <label className="studio-field"><span>هشتگ‌ها</span><input className="input" value={ig.hashtags} onChange={(e) => setSettings({ ...settings, instagram: { ...ig, hashtags: e.target.value } })} /></label>
        <label className="studio-field fr-admin-wide"><span>قالب کپشن (متغیرها: <code dir="ltr">{VARS}</code>)</span><textarea className="input" rows={7} value={ig.template} onChange={(e) => setSettings({ ...settings, instagram: { ...ig, template: e.target.value } })} /></label>
        <div className="fr-admin-actions"><button className="btn btn-primary btn-sm" disabled={busy}>ذخیره</button></div>
      </form>
    </section>}

    {tab === 'rules' && <section className="xm-section">
      <form className="card fr-admin-form" onSubmit={(e) => { e.preventDefault(); save() }}>
        <fieldset className="fa-perms fr-admin-wide"><legend>چه محتوایی اعلام شود</legend>
          <div className="fa-inline fa-wrap">{TYPES.map(([key, label]) => <label key={key} className="studio-switch"><input type="checkbox" checked={!!settings.types[key]} onChange={(e) => setSettings({ ...settings, types: { ...settings.types, [key]: e.target.checked } })} />{label}</label>)}</div>
        </fieldset>
        <label className="studio-field"><span>تأخیر بعد از انتشار (دقیقه)</span><input className="input" type="number" min={0} max={1440} value={settings.delayMinutes} onChange={(e) => setSettings({ ...settings, delayMinutes: Number(e.target.value) })} /></label>
        <label className="studio-switch"><input type="checkbox" checked={settings.utm} onChange={(e) => setSettings({ ...settings, utm: e.target.checked })} />افزودن UTM به لینک‌ها (برای دیدن سهم هر کانال در آمار)</label>
        <fieldset className="fa-perms fr-admin-wide"><legend>اعلان مرورگر برای محتوای تازه</legend>
          <label className="studio-switch"><input type="checkbox" checked={settings.push.enabled} onChange={(e) => setSettings({ ...settings, push: { ...settings.push, enabled: e.target.checked } })} />برای همهٔ مشترکان اعلان مرورگر ارسال شود</label>
          <label className="studio-field"><span>عنوان</span><input className="input" value={settings.push.title} onChange={(e) => setSettings({ ...settings, push: { ...settings.push, title: e.target.value } })} /></label>
          <label className="studio-field"><span>متن</span><input className="input" value={settings.push.body} onChange={(e) => setSettings({ ...settings, push: { ...settings.push, body: e.target.value } })} /></label>
        </fieldset>
        <div className="fr-admin-actions"><button className="btn btn-primary btn-sm" disabled={busy}>ذخیره</button></div>
      </form>
    </section>}
  </div>
}
