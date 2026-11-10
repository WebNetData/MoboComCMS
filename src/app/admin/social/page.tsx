'use client'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import { hashtag, renderPost, withUtm, type AnnounceType } from '@/modules/social/domain/social'
import { toPublicPath } from '@/platform/routing/aliases'
import './social.css'

type Settings = {
  types: Record<string, boolean>; delayMinutes: number; utm: boolean
  telegram: { enabled: boolean; channel: string; template: string; button: string; silent: boolean; includeImage: boolean }
  instagram: { enabled: boolean; accountId: string; accessToken: string; hasToken?: boolean; graphVersion: string; template: string; hashtags: string }
  push: { enabled: boolean; title: string; body: string }
}
type Post = { id: number; channel: string; itemType: string; itemId: number; status: string; attempts: number; error: string; externalId: string; nextAttemptAt: string; sentAt: string | null; createdAt: string; item: { title: string; url: string; image?: string } | null }
type Sample = { type: string; title: string; subtitle: string; summary: string; url: string; image: string }
type Data = { settings: Settings; log: { total: number; page: number; pages: number; posts: Post[] }; pending: number; base: string; stats?: Record<string, Record<string, number>>; sample?: Sample | null }
type Tab = 'log' | 'telegram' | 'instagram' | 'rules'

const TYPES: { key: AnnounceType; label: string; icon: string }[] = [
  { key: 'software', label: 'نرم‌افزار', icon: 'download' }, { key: 'game', label: 'بازی', icon: 'gamepad' }, { key: 'title', label: 'فیلم و سریال', icon: 'film' },
  { key: 'album', label: 'آلبوم', icon: 'music' }, { key: 'track', label: 'تک‌آهنگ', icon: 'play' }, { key: 'post', label: 'مقاله', icon: 'book' }, { key: 'product', label: 'محصول', icon: 'bag' },
]
const CHANNELS: { key: 'TELEGRAM' | 'INSTAGRAM' | 'PUSH'; tab: Tab; label: string; icon: string }[] = [
  { key: 'TELEGRAM', tab: 'telegram', label: 'کانال تلگرام', icon: 'telegram' },
  { key: 'INSTAGRAM', tab: 'instagram', label: 'اینستاگرام', icon: 'instagram' },
  { key: 'PUSH', tab: 'rules', label: 'اعلان مرورگر', icon: 'bell' },
]
const CHANNEL_NAME: Record<string, string> = { TELEGRAM: 'تلگرام', INSTAGRAM: 'اینستاگرام', PUSH: 'اعلان مرورگر' }
const CHANNEL_ICON: Record<string, string> = { TELEGRAM: 'telegram', INSTAGRAM: 'instagram', PUSH: 'bell' }
const STATUS: Record<string, string> = { PENDING: 'در صف', SENDING: 'در حال ارسال', SENT: 'ارسال شد', FAILED: 'ناموفق', SKIPPED: 'رد شد' }
const VARS: [string, string][] = [['{icon}', 'نماد نوع'], ['{type}', 'نوع'], ['{title}', 'عنوان'], ['{subtitle}', 'زیرعنوان'], ['{summary}', 'خلاصه'], ['{url}', 'لینک'], ['{hashtags}', 'هشتگ‌ها']]
const TG_PRESETS: [string, string][] = [
  ['کامل', '{icon} {title}\n{subtitle}\n\n{summary}\n\n🔗 {url}\n{hashtags}'],
  ['خبری', '{icon} {type} تازه در موبوکام\n\n{title}\n{summary}\n\n{url}'],
  ['کوتاه', '{icon} {title}\n{url}'],
]
const IG_PRESETS: [string, string][] = [
  ['کامل', '{icon} {title}\n{subtitle}\n\n{summary}\n\nلینک در بیو و سایت موبوکام 👆\n{hashtags}'],
  ['معرفی', '{title}\n\n{summary}\n\nبرای دیدن جزئیات به لینک بیو سر بزنید\n{hashtags}'],
  ['کوتاه', '{icon} {title}\n{hashtags}'],
]
const FALLBACK: Sample = { type: 'post', title: 'راهنمای کامل انتخاب سرور مجازی', subtitle: 'مجله · آموزش', summary: 'از منابع و موقعیت دیتاسنتر تا پشتیبانی؛ چیزهایی که پیش از خرید سرور مجازی باید بدانید.', url: '/blog/vps-guide', image: '' }
const fa = (n: number) => n.toLocaleString('fa-IR')
const clock = () => new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })

/** Auto-publishing to Telegram, Instagram and web push: channel status, editors with a live preview, and the send log. */
export default function AdminSocialPage() {
  const [data, setData] = useState<Data | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [saved, setSaved] = useState('')
  const [tab, setTab] = useState<Tab>('log')
  const [busy, setBusy] = useState(false)
  const [manual, setManual] = useState('')
  const [filter, setFilter] = useState({ channel: '', status: '' })
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)

  const load = useCallback(async (page = 1, next = filter) => {
    const query = new URLSearchParams({ page: String(page), ...(next.channel ? { channel: next.channel } : {}), ...(next.status ? { status: next.status } : {}) })
    const response = await fetch(`/api/admin/social?${query}`, { cache: 'no-store' }).catch(() => null)
    const body = await response?.json().catch(() => null)
    if (response?.ok) { setData(body); setSettings((current) => { if (!current) setSaved(JSON.stringify(body.settings)); return current || body.settings }) }
    else setMessage({ text: body?.error || 'دریافت اطلاعات ناموفق بود', error: true })
  }, [filter])
  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function call(method: 'POST' | 'PATCH', body: unknown, success: string) {
    setBusy(true); setMessage(null)
    const response = await fetch('/api/admin/social', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)
    const result = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) { setMessage({ text: result?.error || 'انجام نشد', error: true }); return null }
    setMessage({ text: success, error: false })
    if (method === 'PATCH' && result?.settings) { setSettings(result.settings); setSaved(JSON.stringify(result.settings)) }
    await load(data?.log.page || 1)
    return result
  }

  if (!data || !settings) return <div className="apx-page" dir="rtl">{message ? <div className="apx-notice is-error" role="alert">{message.text}</div> : <div className="apx-loading" aria-busy="true">در حال بارگذاری…</div>}</div>
  const dirty = JSON.stringify(settings) !== saved
  const save = () => void call('PATCH', settings, 'تنظیمات ذخیره شد')
  const sample = data.sample || FALLBACK
  const url = withUtm(`${data.base}${toPublicPath(sample.url)}`, 'TELEGRAM', settings.utm)
  const tg = settings.telegram, ig = settings.instagram
  const setTg = (patch: Partial<Settings['telegram']>) => setSettings({ ...settings, telegram: { ...tg, ...patch } })
  const setIg = (patch: Partial<Settings['instagram']>) => setSettings({ ...settings, instagram: { ...ig, ...patch } })
  const state = (key: string) => key === 'TELEGRAM' ? (!tg.enabled ? 'off' : tg.channel ? 'on' : 'warn') : key === 'INSTAGRAM' ? (!ig.enabled ? 'off' : ig.accountId && ig.hasToken ? 'on' : 'warn') : settings.push.enabled ? 'on' : 'off'
  const stateText = { on: 'فعال', off: 'خاموش', warn: 'تنظیم ناقص' } as const
  const detail = (key: string) => key === 'TELEGRAM' ? (tg.channel || 'کانالی تعیین نشده') : key === 'INSTAGRAM' ? (ig.accountId ? `حساب ${ig.accountId}` : 'حسابی متصل نشده') : 'همهٔ مشترکان اعلان'
  const changeFilter = (patch: Partial<typeof filter>) => { const next = { ...filter, ...patch }; setFilter(next); void load(1, next) }

  return <div className="apx-page" dir="rtl">
    <header className="apx-head">
      <div>
        <h1>انتشار خودکار</h1>
        <p>هر نرم‌افزار، بازی، فیلم، موزیک، مقاله یا محصولی که برای اولین بار منتشر شود، با تصویر و لینک در کانال‌های فعال اعلام می‌شود.</p>
      </div>
      <div className="apx-head-actions">
        {data.pending > 0 && <span className="apx-queue"><span className="apx-dot is-warn" aria-hidden="true" />{fa(data.pending)} پست در صف</span>}
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void call('POST', { action: 'run' }, 'صف پردازش شد')}><Icon name="activity" size={16} />پردازش صف</button>
      </div>
    </header>

    <div className="apx-channels">{CHANNELS.map((channel) => {
      const s = state(channel.key), counts = data.stats?.[channel.key] || {}
      return <button key={channel.key} type="button" className={`apx-channel${tab === channel.tab ? ' is-current' : ''}`} onClick={() => setTab(channel.tab)} aria-label={`${channel.label}: ${stateText[s]}`}>
        <span className="apx-channel-top"><span className={`apx-channel-icon is-${channel.key.toLowerCase()}`} aria-hidden="true"><Icon name={channel.icon} size={20} /></span><b>{channel.label}</b><span className={`apx-status is-${s}`}><span className={`apx-dot is-${s}`} aria-hidden="true" />{stateText[s]}</span></span>
        <span className="apx-channel-detail" dir="auto">{detail(channel.key)}</span>
        <span className="apx-figures"><span><b>{fa(counts.SENT || 0)}</b>ارسال‌شده</span><span><b>{fa(counts.FAILED || 0)}</b>ناموفق</span><span><b>{fa((counts.PENDING || 0) + (counts.SENDING || 0))}</b>در صف</span></span>
      </button>
    })}</div>

    <nav className="apx-tabs" role="tablist" aria-label="بخش‌ها">
      {([['log', 'گزارش ارسال‌ها', 'receipt'], ['telegram', 'تلگرام', 'telegram'], ['instagram', 'اینستاگرام', 'instagram'], ['rules', 'قواعد و اعلان مرورگر', 'sliders']] as const).map(([key, label, icon]) => <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'is-on' : ''} onClick={() => setTab(key)}><Icon name={icon} size={16} />{label}</button>)}
    </nav>
    {message && <div className={`apx-notice${message.error ? ' is-error' : ''}`} role="status">{message.text}</div>}

    {tab === 'log' && <section className="apx-panel" aria-label="گزارش ارسال‌ها">
      <div className="apx-toolbar">
        <form className="apx-manual" onSubmit={(e) => { e.preventDefault(); void call('POST', { action: 'announce', item: manual.trim() }, 'در صف انتشار قرار گرفت') }}>
          <label><span>انتشار دستی</span><input className="input" dir="ltr" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="software:12" aria-describedby="apx-manual-hint" /></label>
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !manual.trim()}>افزودن به صف</button>
          <small id="apx-manual-hint">نوع و شناسهٔ مورد، مثل post:42</small>
        </form>
        <div className="apx-filters">
          <label><span className="sr-only">کانال</span><select className="select" value={filter.channel} onChange={(e) => changeFilter({ channel: e.target.value })}><option value="">همهٔ کانال‌ها</option>{Object.entries(CHANNEL_NAME).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label><span className="sr-only">وضعیت</span><select className="select" value={filter.status} onChange={(e) => changeFilter({ status: e.target.value })}><option value="">همهٔ وضعیت‌ها</option>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        </div>
      </div>
      {data.log.posts.length ? <ul className="apx-log">{data.log.posts.map((post) => <li key={post.id} className={`is-${post.status.toLowerCase()}`}>
        <span className="apx-thumb" aria-hidden="true">{post.item?.image ? <img src={post.item.image} alt="" loading="lazy" /> : <Icon name={TYPES.find((type) => type.key === post.itemType)?.icon || 'file'} size={18} />}</span>
        <span className="apx-log-main">
          {post.item ? <Link href={post.item.url} target="_blank">{post.item.title}</Link> : <span dir="ltr">{post.itemType}:{post.itemId}</span>}
          <small><Icon name={CHANNEL_ICON[post.channel] || 'megaphone'} size={14} />{CHANNEL_NAME[post.channel] || post.channel}<span aria-hidden="true">·</span>{new Date(post.sentAt || post.nextAttemptAt).toLocaleString('fa-IR', { dateStyle: 'medium', timeStyle: 'short' })}{post.attempts > 1 && <><span aria-hidden="true">·</span>{fa(post.attempts)} تلاش</>}</small>
          {post.error && <small className="apx-error">{post.error}</small>}
        </span>
        <span className={`apx-pill is-${post.status.toLowerCase()}`}>{STATUS[post.status] || post.status}</span>
        {['FAILED', 'SKIPPED'].includes(post.status) ? <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void call('POST', { action: 'retry', id: post.id }, 'دوباره در صف قرار گرفت')}>تلاش دوباره</button> : <span />}
      </li>)}</ul> : <div className="apx-empty"><Icon name="megaphone" size={28} /><b>{filter.channel || filter.status ? 'موردی با این فیلتر نیست' : 'هنوز چیزی منتشر نشده است'}</b><span>پس از فعال‌کردن یک کانال، هر محتوای تازه‌ای که منتشر شود این‌جا ثبت می‌شود.</span></div>}
      {data.log.pages > 1 && <div className="apx-pager"><button type="button" className="btn btn-ghost btn-sm" disabled={data.log.page <= 1} onClick={() => void load(data.log.page - 1)}>قبلی</button><span>{fa(data.log.page)} از {fa(data.log.pages)}</span><button type="button" className="btn btn-ghost btn-sm" disabled={data.log.page >= data.log.pages} onClick={() => void load(data.log.page + 1)}>بعدی</button></div>}
    </section>}

    {tab === 'telegram' && <section className="apx-editor" aria-label="تنظیمات تلگرام">
      <form className="apx-form" onSubmit={(e) => { e.preventDefault(); save() }}>
        <Group title="اتصال" text="از ربات تنظیم‌شده در «ربات و مینی‌اپ» استفاده می‌شود؛ ربات باید مدیر کانال با اجازهٔ ارسال پیام باشد.">
          <Switch checked={tg.enabled} onChange={(v) => setTg({ enabled: v })} label="انتشار خودکار در کانال" />
          <div className="apx-row"><label className="apx-field"><span>کانال (نام کاربری یا شناسهٔ عددی)</span><input className="input" dir="ltr" value={tg.channel} onChange={(e) => setTg({ channel: e.target.value })} placeholder="@mobocom" /></label>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy || !tg.channel || dirty} title={dirty ? 'اول تغییرات را ذخیره کنید' : undefined} onClick={() => void call('POST', { action: 'test-telegram' }, 'پیام آزمایشی به کانال فرستاده شد')}><Icon name="telegram" size={16} />پیام آزمایشی</button></div>
        </Group>
        <Group title="ظاهر پیام">
          <Switch checked={tg.includeImage} onChange={(v) => setTg({ includeImage: v })} label="تصویر شاخص همراه پیام" hint="تصویر به JPEG تبدیل و مستقیم بارگذاری می‌شود؛ زیرنویس تصویر حداکثر ۱٬۰۲۴ نویسه است." />
          <Switch checked={tg.silent} onChange={(v) => setTg({ silent: v })} label="ارسال بی‌صدا" hint="اعضا اعلان صدادار نمی‌گیرند." />
          <label className="apx-field"><span>متن دکمهٔ زیر پیام</span><input className="input" value={tg.button} onChange={(e) => setTg({ button: e.target.value })} maxLength={40} placeholder="خالی = بدون دکمه" /></label>
        </Group>
        <TemplateEditor label="قالب پیام" value={tg.template} presets={TG_PRESETS} limit={tg.includeImage && sample.image ? 1024 : 4096} length={renderPost(tg.template, vars(sample, url, 'tg', ''), { max: 100000 }).length} onChange={(template) => setTg({ template })} />
      </form>
      <Preview label="پیش‌نمایش در تلگرام">
        <div className="apx-tg">
          <div className="apx-tg-bar"><span className="apx-tg-avatar" aria-hidden="true"><Icon name="megaphone" size={16} /></span><span><b dir="auto">{tg.channel || 'کانال شما'}</b><small>کانال</small></span></div>
          <div className="apx-tg-chat">
            <div className="apx-tg-bubble">
              {tg.includeImage && sample.image && <img src={sample.image} alt="" />}
              <div className="apx-tg-text" dir="auto" dangerouslySetInnerHTML={{ __html: linkify(renderPost(tg.template, vars(sample, url, 'tg', ''), { html: true, max: tg.includeImage && sample.image ? 1024 : 4096 })) }} />
              <span className="apx-tg-meta"><Icon name="eye" size={12} />۱٫۲K · {clock()}</span>
            </div>
            {tg.button && <span className="apx-tg-button"><Icon name="external" size={14} />{tg.button}</span>}
          </div>
        </div>
      </Preview>
    </section>}

    {tab === 'instagram' && <section className="apx-editor" aria-label="تنظیمات اینستاگرام">
      <form className="apx-form" onSubmit={(e) => { e.preventDefault(); save() }}>
        <Group title="اتصال" text={`فقط از راه Instagram Graph API با حساب Business یا Creator متصل به یک صفحهٔ فیسبوک. نشانی سایت (${data.base}) باید https و از اینترنت در دسترس باشد.`}>
          <Switch checked={ig.enabled} onChange={(v) => setIg({ enabled: v })} label="انتشار خودکار در اینستاگرام" />
          <div className="apx-grid2">
            <label className="apx-field"><span>شناسهٔ حساب (IG User ID)</span><input className="input" dir="ltr" value={ig.accountId} onChange={(e) => setIg({ accountId: e.target.value })} placeholder="17841400000000000" /></label>
            <label className="apx-field"><span>نسخهٔ Graph API</span><input className="input" dir="ltr" value={ig.graphVersion} onChange={(e) => setIg({ graphVersion: e.target.value })} /></label>
          </div>
          <label className="apx-field"><span>توکن دسترسی بلندمدت {ig.hasToken && <em className="apx-saved"><Icon name="lock" size={12} />ذخیره شده</em>}</span><input className="input" dir="ltr" type="password" autoComplete="new-password" value={ig.accessToken} onChange={(e) => setIg({ accessToken: e.target.value })} placeholder={ig.hasToken ? 'برای تغییر، توکن تازه وارد کنید' : 'EAAG…'} /><small>با مجوز <code dir="ltr">instagram_content_publish</code>؛ رمزگذاری‌شده نگهداری می‌شود.</small></label>
        </Group>
        <Group title="هشتگ‌ها و تصویر" text="تصویر هر پست خودکار به JPEG با اندازهٔ ۱۰۸۰×۱۳۵۰ تبدیل می‌شود؛ موردی که تصویر ندارد در اینستاگرام منتشر نمی‌شود.">
          <label className="apx-field"><span>هشتگ‌ها</span><input className="input" value={ig.hashtags} onChange={(e) => setIg({ hashtags: e.target.value })} placeholder="#موبوکام #دانلود" /></label>
        </Group>
        <TemplateEditor label="قالب کپشن" value={ig.template} presets={IG_PRESETS} limit={2200} length={renderPost(ig.template, vars(sample, url, 'ig', ig.hashtags), { max: 100000 }).length} onChange={(template) => setIg({ template })} />
      </form>
      <Preview label="پیش‌نمایش در اینستاگرام">
        <div className="apx-ig">
          <div className="apx-ig-head"><span className="apx-ig-avatar" aria-hidden="true">M</span><b dir="ltr">mobocom</b><Icon name="sliders" size={16} /></div>
          <div className="apx-ig-image">{sample.image ? <img src={sample.image} alt="" /> : <span><Icon name="image" size={28} />این مورد تصویر ندارد؛ در اینستاگرام منتشر نمی‌شود</span>}</div>
          <div className="apx-ig-actions" aria-hidden="true"><Icon name="heart" size={20} /><Icon name="chat" size={20} /><Icon name="external" size={20} /><Icon name="bookmark" size={20} /></div>
          <p className="apx-ig-caption" dir="auto"><b dir="ltr">mobocom</b> {renderPost(ig.template, vars(sample, url, 'ig', ig.hashtags), { max: 2200 })}</p>
        </div>
      </Preview>
    </section>}

    {tab === 'rules' && <section className="apx-editor" aria-label="قواعد انتشار">
      <form className="apx-form" onSubmit={(e) => { e.preventDefault(); save() }}>
        <Group title="چه محتوایی اعلام شود">
          <div className="apx-types">{TYPES.map((type) => <label key={type.key} className={`apx-type${settings.types[type.key] ? ' is-on' : ''}`}><input type="checkbox" checked={!!settings.types[type.key]} onChange={(e) => setSettings({ ...settings, types: { ...settings.types, [type.key]: e.target.checked } })} /><Icon name={type.icon} size={18} /><span>{type.label}</span></label>)}</div>
        </Group>
        <Group title="زمان و لینک">
          <label className="apx-field apx-narrow"><span>تأخیر پس از انتشار</span><span className="apx-unit"><input className="input" type="number" min={0} max={1440} value={settings.delayMinutes} onChange={(e) => setSettings({ ...settings, delayMinutes: Number(e.target.value) })} /><span>دقیقه</span></span><small>فرصت اصلاح اشتباه پیش از اعلام؛ صفر یعنی بلافاصله.</small></label>
          <Switch checked={settings.utm} onChange={(v) => setSettings({ ...settings, utm: v })} label="افزودن UTM به لینک‌ها" hint="سهم هر کانال در بازدیدها در آمار دیده می‌شود." />
        </Group>
        <Group title="اعلان مرورگر" text="برای همهٔ کسانی که اعلان مرورگر سایت را پذیرفته‌اند.">
          <Switch checked={settings.push.enabled} onChange={(v) => setSettings({ ...settings, push: { ...settings.push, enabled: v } })} label="ارسال اعلان برای محتوای تازه" />
          <div className="apx-grid2">
            <label className="apx-field"><span>عنوان</span><input className="input" value={settings.push.title} onChange={(e) => setSettings({ ...settings, push: { ...settings.push, title: e.target.value } })} /></label>
            <label className="apx-field"><span>متن</span><input className="input" value={settings.push.body} onChange={(e) => setSettings({ ...settings, push: { ...settings.push, body: e.target.value } })} /></label>
          </div>
        </Group>
      </form>
      <Preview label="پیش‌نمایش اعلان مرورگر">
        <div className="apx-push">
          <span className="apx-push-icon" aria-hidden="true"><Icon name="bell" size={18} /></span>
          <span className="apx-push-text"><b dir="auto">{renderPost(settings.push.title, vars(sample, url, 'tg', ''), { max: 120 })}</b><span dir="auto">{renderPost(settings.push.body, vars(sample, url, 'tg', ''), { max: 200 })}</span><small dir="ltr">{data.base.replace(/^https?:\/\//, '')}</small></span>
          {sample.image && <img src={sample.image} alt="" />}
        </div>
        <p className="apx-preview-note">پیش‌نمایش با «{sample.title}» ساخته شده است.</p>
      </Preview>
    </section>}

    {tab !== 'log' && <div className={`apx-savebar${dirty ? ' is-dirty' : ''}`} role="region" aria-label="ذخیره">
      <span>{dirty ? 'تغییرات ذخیره نشده‌اند' : 'همهٔ تغییرات ذخیره شده‌اند'}</span>
      {dirty && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setSettings(JSON.parse(saved))}>بازگرداندن</button>}
      <button type="button" className="btn btn-primary btn-sm" disabled={busy || !dirty} onClick={save}>{busy ? 'در حال ذخیره…' : 'ذخیرهٔ تنظیمات'}</button>
    </div>}
  </div>
}

/** Telegram shows addresses as links: an already-escaped http(s) run becomes an isolated left-to-right link span. */
const linkify = (html: string) => html.replace(/https?:\/\/[^\s<]+/g, (m) => `<span class="apx-link" dir="ltr">${m}</span>`)

/** The values a post template is filled with, the same way the sender fills them. */
function vars(sample: Sample, url: string, channel: 'tg' | 'ig', igTags: string) {
  const type = (['software', 'game', 'title', 'album', 'track', 'post', 'product'].includes(sample.type) ? sample.type : 'post') as AnnounceType
  return { type, title: sample.title, subtitle: sample.subtitle, summary: sample.summary, url, hashtags: channel === 'ig' ? igTags : [hashtag(sample.subtitle.split('·')[0] || ''), '#موبوکام'].filter(Boolean).join(' ') }
}

function Group({ title, text, children }: { title: string; text?: string; children: ReactNode }) {
  return <fieldset className="apx-group"><legend>{title}</legend>{text && <p>{text}</p>}{children}</fieldset>
}

function Switch({ checked, onChange, label, hint }: { checked: boolean; onChange: (value: boolean) => void; label: string; hint?: string }) {
  return <label className="apx-switch"><input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} /><span className="apx-track" aria-hidden="true" /><span><b>{label}</b>{hint && <small>{hint}</small>}</span></label>
}

function Preview({ label, children }: { label: string; children: ReactNode }) {
  return <aside className="apx-preview" aria-label={label}><span className="apx-preview-label"><span className="apx-dot is-on" aria-hidden="true" />{label}</span><div className="apx-phone">{children}</div></aside>
}

/** Template text with ready-made layouts, variables inserted at the cursor and the platform's length limit. */
function TemplateEditor({ label, value, presets, limit, length, onChange }: { label: string; value: string; presets: [string, string][]; limit: number; length: number; onChange: (value: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const id = useMemo(() => `apx-tpl-${label.length}-${presets.length}`, [label, presets])
  const insert = (token: string) => {
    const el = ref.current
    if (!el) { onChange(value + token); return }
    const start = el.selectionStart ?? value.length, end = el.selectionEnd ?? value.length
    onChange(value.slice(0, start) + token + value.slice(end))
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + token.length, start + token.length) })
  }
  const over = length > limit
  return <fieldset className="apx-group">
    <legend>{label}</legend>
    <div className="apx-presets" role="group" aria-label="قالب‌های آماده">{presets.map(([name, template]) => <button key={name} type="button" className={value === template ? 'is-on' : ''} aria-pressed={value === template} onClick={() => onChange(template)}>{name}</button>)}</div>
    <textarea ref={ref} id={id} className="input apx-template" rows={8} dir="auto" value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={`${id}-count`} />
    <div className="apx-template-foot">
      <div className="apx-vars" role="group" aria-label="افزودن متغیر">{VARS.map(([token, name]) => <button key={token} type="button" onClick={() => insert(token)} title={`افزودن ${name}`}><code dir="ltr">{token}</code><span>{name}</span></button>)}</div>
      <span id={`${id}-count`} className={`apx-count${over ? ' is-over' : ''}`}>{fa(length)} / {fa(limit)}{over && ' · بقیه کوتاه می‌شود'}</span>
    </div>
  </fieldset>
}
