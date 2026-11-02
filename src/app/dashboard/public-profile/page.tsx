'use client'

import Link from '@/components/AppLink'
import { useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { LINK_KINDS, MESSAGE_POLICY, PROFILE_VISIBILITY, type Privacy } from '@/modules/identity/domain/profile'

type Profile = { username: string; name: string; headline: string; bio: string; location: string; website: string; avatar: string; cover: string; links: { kind: string; url: string }[]; privacy: Privacy }

const SECTIONS = [
  { id: 'pe-images', label: 'تصویر و کاور' },
  { id: 'pe-identity', label: 'هویت و معرفی' },
  { id: 'pe-links', label: 'شبکه‌های اجتماعی' },
  { id: 'pe-privacy', label: 'حریم خصوصی' },
]

const SWITCHES: [keyof Privacy, string, string][] = [
  ['showActivity', 'فعالیت‌های تالار و نقدها', 'پست‌ها، پاسخ‌ها و نقدهای شما در پروفایل نمایش داده شود.'],
  ['showLibrary', 'کتابخانهٔ بازی', 'بازی‌هایی که بازی کرده‌اید یا در صف دارید.'],
  ['showFavorites', 'علاقه‌مندی‌ها', 'فیلم، موزیک، نرم‌افزار و بازی‌های نشان‌شده.'],
  ['showFollows', 'دنبال‌کننده‌ها و دنبال‌شونده‌ها', 'فهرست افراد برای دیگران قابل مشاهده باشد.'],
  ['showOnline', 'وضعیت آنلاین', 'نشانگر «آنلاین» کنار نام شما.'],
]

function useUpload(onDone: (url: string) => void) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function pick(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    setBusy(true); setError('')
    const form = new FormData(); form.append('file', file)
    const response = await fetch('/api/profile/media', { method: 'POST', body: form }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) { setError(data?.error || 'بارگذاری انجام نشد'); return }
    onDone(data.url)
  }
  const field = <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { void pick(e.target.files); e.target.value = '' }} />
  return { open: () => input.current?.click(), busy, error, field }
}

const Camera = () => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>

/** Public profile editor: images, identity, social links and privacy, with a live preview. */
export default function PublicProfilePage() {
  const { update } = useSession()
  const [form, setForm] = useState<Profile | null>(null)
  const [saved, setSaved] = useState<Profile | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const cover = useUpload((url) => set({ cover: url }))
  const avatar = useUpload((url) => set({ avatar: url }))
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/profile/public', { cache: 'no-store', signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('profile unavailable')
      const data = await response.json().catch(() => null)
      if (controller.signal.aborted) return
      if (!data) { setMessage({ ok: false, text: 'بارگذاری پروفایل انجام نشد' }); return }
      setForm(data); setSaved(data)
    }).catch(() => { if (!controller.signal.aborted) setMessage({ ok: false, text: 'بارگذاری پروفایل انجام نشد' }) })
    return () => controller.abort()
  }, [loadAttempt])
  const dirty = !!form && JSON.stringify(form) !== JSON.stringify(saved)
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  if (!form) return <div className="dash-page" dir="rtl"><header className="dash-page-head"><div><h1>تصویر و پروفایل من</h1><p>نمایه، تصویر و اطلاعاتی که دیگران از شما می‌بینند.</p></div></header>{message ? <div className="dt-empty is-bad" role="alert"><b>{message.text}</b><span>اتصال را بررسی کنید و دوباره تلاش کنید.</span><button type="button" className="btn btn-ghost" onClick={() => { setMessage(null); setLoadAttempt(attempt => attempt + 1) }}>تلاش دوباره</button></div> : <div className="pp-skeleton" role="status" aria-label="در حال دریافت پروفایل" aria-busy="true" />}</div>
  function set(patch: Partial<Profile>) { setMessage(null); setForm((current) => current && { ...current, ...patch }) }
  const setPrivacy = (patch: Partial<Privacy>) => set({ privacy: { ...form.privacy, ...patch } })
  const link = (kind: string) => form.links.find((l) => l.kind === kind)?.url || ''
  const setLink = (kind: string, url: string) => set({ links: [...form.links.filter((l) => l.kind !== kind), ...(url ? [{ kind, url }] : [])] })

  async function save() {
    if (!form) return
    setBusy(true); setMessage(null)
    const response = await fetch('/api/profile/public', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) { setMessage({ ok: false, text: data?.error || 'ذخیره نشد' }); return }
    setForm(data); setSaved(data); setMessage({ ok: true, text: 'پروفایل به‌روز شد' })
    void update().catch(() => undefined)
  }

  const checks = [
    { label: 'تصویر پروفایل', done: !!form.avatar, section: 'pe-images' },
    { label: 'تصویر کاور', done: !!form.cover, section: 'pe-images' },
    { label: 'تیتر کوتاه', done: form.headline.trim().length > 0, section: 'pe-identity' },
    { label: 'درباره من', done: form.bio.trim().length >= 20, section: 'pe-identity' },
    { label: 'شهر یا وب‌سایت', done: !!(form.location.trim() || form.website.trim()), section: 'pe-identity' },
    { label: 'یک شبکهٔ اجتماعی', done: form.links.length > 0, section: 'pe-links' },
  ]
  const percent = Math.round((checks.filter((c) => c.done).length / checks.length) * 100)
  const initial = (form.name || form.username || '?').charAt(0)
  const bg = (url: string) => (url ? { backgroundImage: `url("${url}")` } : undefined)

  return <div className="dash-page" dir="rtl">
    <header className="dash-page-head">
      <div><h1>پروفایل عمومی</h1><p>چهرهٔ شما در تالار گفتمان، نقدها، کتابخانهٔ بازی و پست‌ها. تغییرات پس از ذخیره برای همه نمایش داده می‌شود.</p></div>
      <div className="dash-page-actions"><Link href={`/u/${saved?.username}`} className="btn btn-ghost">مشاهدهٔ پروفایل</Link><button type="button" className="btn btn-primary" disabled={busy || !dirty} onClick={() => void save()}>{busy ? 'در حال ذخیره…' : 'ذخیرهٔ تغییرات'}</button></div>
    </header>
    {message && <p className={`dash-note ${message.ok ? 'is-ok' : 'is-error'}`} role={message.ok ? 'status' : 'alert'}>{message.text}</p>}

    <div className="dash-split">
      <div className="dash-page">
        <section id="pe-images" className="pe-media" aria-label="تصویر و کاور">
          <div className="pe-cover" style={bg(form.cover)}>
            <div className="pe-cover-actions">
              <button type="button" className="pe-chip-btn" disabled={cover.busy} onClick={cover.open}><Camera />{cover.busy ? 'در حال بارگذاری…' : form.cover ? 'تغییر کاور' : 'افزودن کاور'}</button>
              {form.cover && <button type="button" className="pe-chip-btn" onClick={() => set({ cover: '' })}>حذف</button>}
            </div>
          </div>
          <div className="pe-identity">
            <div className="pe-avatar" style={{ ...bg(form.avatar), backgroundColor: form.avatar ? undefined : 'var(--primary)' }}>
              {!form.avatar && initial}
              <button type="button" className="pe-avatar-btn" disabled={avatar.busy} onClick={avatar.open} aria-label={form.avatar ? 'تغییر تصویر پروفایل' : 'افزودن تصویر پروفایل'}><Camera /></button>
            </div>
            <div className="pe-identity-text">
              <b>{form.name || 'بدون نام'}</b>
              <span dir="ltr">@{form.username}</span>
              {form.avatar && <button type="button" className="pe-text-btn" onClick={() => set({ avatar: '' })}>حذف تصویر پروفایل</button>}
            </div>
          </div>
          {(cover.error || avatar.error) && <div className="pe-media-foot"><span className="pe-error" role="alert">{cover.error || avatar.error}</span></div>}
          {cover.field}{avatar.field}
        </section>

        <section id="pe-identity" className="dash-card">
          <div className="dash-card-head"><div><h2>هویت و معرفی</h2><p>نام و نشانی پروفایل شما در همهٔ بخش‌ها استفاده می‌شود.</p></div></div>
          <div className="dash-grid">
            <label className="dash-field"><span>نام نمایشی</span><input className="input" value={form.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} /></label>
            <label className="dash-field"><span>نام کاربری</span><span className="pe-prefix" dir="ltr"><span>@</span><input className="input" value={form.username} maxLength={20} onChange={(e) => set({ username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })} /></span><small>نشانی: <bdi dir="ltr">/u/{form.username}</bdi> — روزی حداکثر سه بار قابل تغییر</small></label>
          </div>
          <label className="dash-field"><span>تیتر کوتاه</span><input className="input" value={form.headline} maxLength={120} onChange={(e) => set({ headline: e.target.value })} placeholder="مثلاً: گیمر، عاشق فیلم‌های علمی‌تخیلی و برنامه‌نویس" /><small className="num">{(120 - form.headline.length).toLocaleString('fa-IR')} نویسه باقی مانده</small></label>
          <label className="dash-field"><span>درباره من</span><textarea className="input" rows={5} value={form.bio} maxLength={1000} onChange={(e) => set({ bio: e.target.value })} placeholder="کمی از خودتان، علاقه‌ها و کارهایتان بنویسید…" /><small className="num">{(1000 - form.bio.length).toLocaleString('fa-IR')} نویسه باقی مانده</small></label>
          <div className="dash-grid">
            <label className="dash-field"><span>شهر</span><input className="input" value={form.location} maxLength={80} onChange={(e) => set({ location: e.target.value })} placeholder="تهران" /></label>
            <label className="dash-field"><span>وب‌سایت</span><input className="input" dir="ltr" value={form.website} onChange={(e) => set({ website: e.target.value })} placeholder="https://" /></label>
          </div>
        </section>

        <section id="pe-links" className="dash-card">
          <div className="dash-card-head"><div><h2>شبکه‌های اجتماعی</h2><p>نشانی کامل صفحه را وارد کنید؛ فقط نشانی‌های همان شبکه پذیرفته می‌شوند.</p></div><small className="muted">{form.links.length.toLocaleString('fa-IR')} از {Object.keys(LINK_KINDS).length.toLocaleString('fa-IR')}</small></div>
          <div className="pe-links">{Object.entries(LINK_KINDS).map(([kind, info]) => <label key={kind} className="pe-link"><span>{info.label}</span><input className="input" dir="ltr" value={link(kind)} onChange={(e) => setLink(kind, e.target.value.trim())} placeholder={`https://${info.hosts[0]}/…`} /></label>)}</div>
        </section>

        <section id="pe-privacy" className="dash-card">
          <div className="dash-card-head"><div><h2>حریم خصوصی</h2><p>تعیین کنید چه کسانی پروفایل شما را ببینند و به شما پیام بدهند.</p></div></div>
          <div className="dash-grid">
            <label className="dash-field"><span>دیدن پروفایل و فعالیت‌ها</span><select className="select" value={form.privacy.profile} onChange={(e) => setPrivacy({ profile: e.target.value as Privacy['profile'] })}>{Object.entries(PROFILE_VISIBILITY).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <label className="dash-field"><span>ارسال پیام خصوصی</span><select className="select" value={form.privacy.messages} onChange={(e) => setPrivacy({ messages: e.target.value as Privacy['messages'] })}>{Object.entries(MESSAGE_POLICY).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          </div>
          <div>{SWITCHES.map(([key, label, hint]) => <label key={key} className="dash-switch"><span>{label}<small>{hint}</small></span><input type="checkbox" role="switch" checked={!!form.privacy[key]} onChange={(e) => setPrivacy({ [key]: e.target.checked } as Partial<Privacy>)} /></label>)}</div>
        </section>

        {dirty && <div className="dash-savebar" role="region" aria-label="ذخیرهٔ تغییرات"><b>تغییرات ذخیره نشده دارید</b><div><button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => { setForm(saved); setMessage(null) }}>بازگرداندن</button><button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void save()}>{busy ? 'در حال ذخیره…' : 'ذخیره'}</button></div></div>}
      </div>

      <aside className="dash-aside" aria-label="پیش‌نمایش و راهنما">
        <div className="pe-preview" aria-label="پیش‌نمایش پروفایل">
          <div className="pe-preview-cover" style={bg(form.cover)} />
          <div className="pe-preview-body">
            <div className="pe-preview-avatar" style={bg(form.avatar)}>{!form.avatar && initial}</div>
            <b>{form.name || 'بدون نام'}</b>
            <span className="muted" dir="ltr">@{form.username}</span>
            {form.headline && <p>{form.headline}</p>}
            {(form.location || form.links.length > 0) && <div className="pe-preview-chips">{form.location && <span>{form.location}</span>}{form.links.map((item) => <span key={item.kind}>{LINK_KINDS[item.kind as keyof typeof LINK_KINDS]?.label || item.kind}</span>)}</div>}
          </div>
        </div>
        <div className="pe-progress">
          <div className="pe-progress-head"><span>تکمیل پروفایل</span><b className="num">{percent.toLocaleString('fa-IR')}٪</b></div>
          <div className="pe-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="تکمیل پروفایل"><i style={{ inlineSize: `${percent}%` }} /></div>
          <ul>{checks.map((check) => <li key={check.label} className={check.done ? 'is-done' : ''}>{check.done ? check.label : <a href={`#${check.section}`}>{check.label}</a>}</li>)}</ul>
        </div>
        <nav className="dash-toc" aria-label="بخش‌های پروفایل">{SECTIONS.map((section) => <a key={section.id} href={`#${section.id}`}>{section.label}</a>)}</nav>
      </aside>
    </div>
  </div>
}
