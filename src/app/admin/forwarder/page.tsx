'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Notice, Pager, fa, faDate } from '../store/shared'
import type { ForwarderSettings } from '@/modules/forwarder/domain/forwarder'

type LinkRow = { id: number; slug: string; target: string; title: string; countdown: number | null; active: boolean; clicks: number; lastClickAt: string | null; createdAt: string }
type Settings = ForwarderSettings
type Data = { page: number; pages: number; total: number; stats: { links: number; clicks: number }; rows: LinkRow[]; settings: Settings }
type Tone = { tone: 'ok' | 'error'; text: string } | null

async function call<T>(url: string, method: string, body?: unknown): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const response = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined }).catch(() => null)
  const data = await response?.json().catch(() => null)
  return response?.ok ? { ok: true, data: data as T } : { ok: false, error: data?.error || 'انجام نشد' }
}

/** Short links (custom or random slug), outbound forwarding and the countdown page with its ads. */
export default function ForwarderAdminPage() {
  const [data, setData] = useState<Data | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [savedSettings, setSavedSettings] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [form, setForm] = useState({ target: '', slug: '', title: '', countdown: '' })
  const [edit, setEdit] = useState<{ id: number; target: string; slug: string; title: string; countdown: string } | null>(null)
  const [notice, setNotice] = useState<Tone>(null)
  const [busy, setBusy] = useState(false)
  const [origin, setOrigin] = useState('')
  useEffect(() => setOrigin(window.location.origin), [])

  const load = useCallback(async () => {
    const result = await call<Data>(`/api/admin/forwarder?${new URLSearchParams({ q, page: String(page) })}`, 'GET')
    if (!result.ok) { setNotice({ tone: 'error', text: result.error }); return }
    setData(result.data)
    setSettings((current) => current || result.data.settings)
    setSavedSettings((current) => current || JSON.stringify(result.data.settings))
  }, [q, page])
  useEffect(() => { void load() }, [load])

  const link = (slug: string) => `${origin}/forwarder/${slug}`
  const copy = (text: string) => void navigator.clipboard?.writeText(text).then(() => setNotice({ tone: 'ok', text: `کپی شد: ${text}` }))

  async function create(event: FormEvent) {
    event.preventDefault()
    setBusy(true); setNotice(null)
    const result = await call<{ link: LinkRow }>('/api/admin/forwarder', 'POST', form)
    setBusy(false)
    if (!result.ok) { setNotice({ tone: 'error', text: result.error }); return }
    setForm({ target: '', slug: '', title: '', countdown: '' })
    setNotice({ tone: 'ok', text: `لینک ساخته شد: ${link(result.data.link.slug)}` })
    copy(link(result.data.link.slug))
    void load()
  }

  async function saveEdit() {
    if (!edit) return
    const result = await call(`/api/admin/forwarder/${edit.id}`, 'PATCH', { target: edit.target, slug: edit.slug, title: edit.title, countdown: edit.countdown })
    if (!result.ok) { setNotice({ tone: 'error', text: result.error }); return }
    setEdit(null); void load()
  }

  async function toggle(row: LinkRow) {
    const result = await call(`/api/admin/forwarder/${row.id}`, 'PATCH', { active: !row.active })
    if (!result.ok) setNotice({ tone: 'error', text: result.error }); else void load()
  }

  async function remove(row: LinkRow) {
    if (!window.confirm(`لینک «${row.slug}» حذف شود؟ لینک‌هایی که پخش کرده‌اید از کار می‌افتند.`)) return
    await call(`/api/admin/forwarder/${row.id}`, 'DELETE'); void load()
  }

  async function saveSettings() {
    if (!settings) return
    setBusy(true)
    const previous = JSON.parse(savedSettings) as Settings
    const patch = Object.fromEntries(Object.entries(settings).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(previous[key as keyof Settings])))
    const result = await call<{ settings: Settings }>('/api/admin/forwarder', 'PUT', { settings: patch })
    setBusy(false)
    if (!result.ok) { setNotice({ tone: 'error', text: result.error }); return }
    setSettings(result.data.settings); setSavedSettings(JSON.stringify(result.data.settings)); setNotice({ tone: 'ok', text: 'تنظیمات ذخیره شد.' })
    if (typeof BroadcastChannel !== 'undefined') { const channel = new BroadcastChannel('mobocom-forwarder'); channel.postMessage('refresh'); channel.close() }
  }

  return <div className="sa" dir="rtl">
    <header className="sa-head">
      <div><h1>فورواردر و لینک کوتاه</h1><p className="sa-hint">لینک‌های کوتاه مثل <bdi dir="ltr">{origin || 'https://example.com'}/forwarder/google</bdi> و انتقال به هر نشانی با <bdi dir="ltr">/forwarder/url=google.com</bdi>؛ پیش از انتقال، صفحهٔ «در حال انتقال» با ثانیه‌شمار و تبلیغ نمایش داده می‌شود.</p></div>
    </header>
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    {data && <div className="sa-kpis">
      <div className="sa-kpi"><span>لینک‌ها</span><b className="num">{fa(data.stats.links)}</b></div>
      <div className="sa-kpi"><span>کل بازدیدها</span><b className="num">{fa(data.stats.clicks)}</b></div>
    </div>}

    <div className="sa-cols">
      <div className="sa-stack">
        <form className="sa-card sa-form" onSubmit={create}>
          <header className="sa-card-head"><h2>لینک کوتاه جدید</h2></header>
          <label className="sa-field"><span>نشانی مقصد</span><input className="input" dir="ltr" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} placeholder="https://google.com یا google.com" required /></label>
          <div className="sa-grid">
            <label className="sa-field"><span>نامک (خالی = تصادفی)</span><div className="fw-slug"><bdi dir="ltr">/forwarder/</bdi><input className="input" dir="ltr" value={form.slug} maxLength={64} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="google" /></div></label>
            <label className="sa-field"><span>ثانیه‌شمار (خالی = پیش‌فرض)</span><input className="input num" dir="ltr" inputMode="numeric" value={form.countdown} onChange={(e) => setForm({ ...form, countdown: e.target.value.replace(/\D/g, '') })} /></label>
          </div>
          <label className="sa-field"><span>عنوان (در صفحهٔ انتقال نمایش داده می‌شود)</span><input className="input" maxLength={120} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
          <button type="submit" className="btn btn-primary" disabled={busy}>ساخت لینک و کپی</button>
        </form>

        <section className="sa-card">
          <header className="sa-card-head"><h2>لینک‌ها</h2><form role="search" onSubmit={(e) => { e.preventDefault(); setPage(1); void load() }}><input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="جست‌وجوی نامک یا مقصد" aria-label="جست‌وجو" /></form></header>
          <div className="sa-table-wrap">
            <table className="data sa-table">
              <thead><tr><th>نامک</th><th>مقصد</th><th>بازدید</th><th>وضعیت</th><th /></tr></thead>
              <tbody>
                {data?.rows.map((row) => edit?.id === row.id ? <tr key={row.id}><td colSpan={5}>
                  <div className="sa-grid">
                    <label className="sa-field"><span>نامک</span><input className="input" dir="ltr" value={edit.slug} onChange={(e) => setEdit({ ...edit, slug: e.target.value })} /></label>
                    <label className="sa-field"><span>مقصد</span><input className="input" dir="ltr" value={edit.target} onChange={(e) => setEdit({ ...edit, target: e.target.value })} /></label>
                    <label className="sa-field"><span>عنوان</span><input className="input" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></label>
                    <label className="sa-field"><span>ثانیه‌شمار</span><input className="input num" dir="ltr" value={edit.countdown} onChange={(e) => setEdit({ ...edit, countdown: e.target.value.replace(/\D/g, '') })} /></label>
                  </div>
                  <div className="sa-row"><button type="button" className="btn btn-primary" onClick={() => void saveEdit()}>ذخیره</button><button type="button" className="btn btn-ghost" onClick={() => setEdit(null)}>انصراف</button></div>
                </td></tr> : <tr key={row.id} className={row.active ? '' : 'is-off'}>
                  <td><button type="button" className="sa-link" dir="ltr" onClick={() => copy(link(row.slug))} title="کپی لینک">/forwarder/{row.slug}</button>{row.title && <small className="sa-sub">{row.title}</small>}</td>
                  <td><a className="sa-link fw-target" href={row.target} target="_blank" rel="noreferrer" dir="ltr">{row.target}</a><small className="sa-sub">{faDate(row.createdAt)}</small></td>
                  <td className="num">{fa(row.clicks)}{row.lastClickAt && <small className="sa-sub">{faDate(row.lastClickAt, true)}</small>}</td>
                  <td><button type="button" className={`sa-state ${row.active ? 'is-ok' : ''}`} onClick={() => void toggle(row)}>{row.active ? 'فعال' : 'غیرفعال'}</button></td>
                  <td className="sa-row-actions"><a className="sa-link" href={`/forwarder/${row.slug}`} target="_blank" rel="noreferrer">نمایش</a><button type="button" className="sa-link" onClick={() => setEdit({ id: row.id, target: row.target, slug: row.slug, title: row.title, countdown: row.countdown === null ? '' : String(row.countdown) })}>ویرایش</button><button type="button" className="sa-link is-danger" onClick={() => void remove(row)}>حذف</button></td>
                </tr>)}
                {data && !data.rows.length && <tr><td colSpan={5} className="sa-empty">هنوز لینکی ساخته نشده است.</td></tr>}
              </tbody>
            </table>
          </div>
          {data && <Pager page={data.page} pages={data.pages} onPage={setPage} />}
        </section>
      </div>

      {settings && <section className="sa-card sa-form">
        <header className="sa-card-head"><h2>صفحهٔ «در حال انتقال»</h2></header>
        <label className="sa-check"><input type="checkbox" checked={settings.enabled} onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })} />فورواردر فعال باشد</label>
        <label className="sa-check"><input type="checkbox" checked={settings.autoExternalLinks} aria-describedby="fw-automatic-help" onChange={(e) => setSettings({ ...settings, autoExternalLinks: e.target.checked })} />اعمال خودکار روی همهٔ لینک‌های خارجی</label>
        <p className="sa-hint" id="fw-automatic-help">لینک‌های خارجی در مطالب قبلی و جدید، منوها و بخش‌های سایت از صفحهٔ انتقال عبور می‌کنند. آدرس اصلی در محتوا حفظ می‌شود؛ با خاموش‌کردن این گزینه، فورواردر یا افزونه، لینک‌ها دوباره مستقیم باز می‌شوند. لینک‌های داخلی، پنل مدیریت و محیط ویرایش تغییر نمی‌کنند. ذخیره کنید تا تنظیم اعمال شود.</p>
        <label className="sa-check"><input type="checkbox" checked={settings.allowRawUrls} onChange={(e) => setSettings({ ...settings, allowRawUrls: e.target.checked })} />انتقال به هر نشانی با <bdi dir="ltr">/forwarder/url=…</bdi> (بدون ساخت لینک)</label>
        <label className="sa-check"><input type="checkbox" checked={settings.autoRedirect} onChange={(e) => setSettings({ ...settings, autoRedirect: e.target.checked })} />پس از ثانیه‌شمار خودکار منتقل شود (وگرنه دکمه فعال می‌شود)</label>
        <div className="sa-grid">
          <label className="sa-field"><span>ثانیه‌شمار پیش‌فرض</span><input className="input num" dir="ltr" value={settings.countdown} onChange={(e) => setSettings({ ...settings, countdown: Number(e.target.value.replace(/\D/g, '')) || 0 })} /></label>
          <label className="sa-field"><span>عنوان صفحه</span><input className="input" maxLength={80} value={settings.title} onChange={(e) => setSettings({ ...settings, title: e.target.value })} /></label>
        </div>
        <label className="sa-field"><span>متن زیر ثانیه‌شمار</span><textarea className="input" rows={2} maxLength={400} value={settings.message} onChange={(e) => setSettings({ ...settings, message: e.target.value })} /></label>
        <h3 className="fw-h3">تبلیغات</h3>
        <div className="sa-grid">
          <label className="sa-field"><span>تصویر بنر (https یا مسیر رسانه)</span><input className="input" dir="ltr" value={settings.bannerImage} onChange={(e) => setSettings({ ...settings, bannerImage: e.target.value })} /></label>
          <label className="sa-field"><span>لینک بنر</span><input className="input" dir="ltr" value={settings.bannerLink} onChange={(e) => setSettings({ ...settings, bannerLink: e.target.value })} /></label>
        </div>
        <label className="sa-field"><span>کد تبلیغ بالای صفحه (HTML/اسکریپت شبکهٔ تبلیغاتی)</span><textarea className="input" dir="ltr" rows={4} value={settings.adTop} onChange={(e) => setSettings({ ...settings, adTop: e.target.value })} /></label>
        <label className="sa-field"><span>کد تبلیغ پایین صفحه</span><textarea className="input" dir="ltr" rows={4} value={settings.adBottom} onChange={(e) => setSettings({ ...settings, adBottom: e.target.value })} /></label>
        <p className="sa-hint">کد تبلیغ در قاب ایزوله اجرا می‌شود و به حساب کاربران و کوکی‌های سایت دسترسی ندارد.</p>
        <label className="sa-field"><span>دامنه‌های مسدود (هر خط یکی)</span><textarea className="input" dir="ltr" rows={3} value={settings.blockedHosts.join('\n')} onChange={(e) => setSettings({ ...settings, blockedHosts: e.target.value.split('\n') })} /></label>
        <button type="button" className="btn btn-primary" disabled={busy || JSON.stringify(settings) === savedSettings} onClick={() => void saveSettings()}>ذخیرهٔ تنظیمات</button>
      </section>}
    </div>
  </div>
}
