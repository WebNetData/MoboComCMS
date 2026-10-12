'use client'
import { useCallback, useEffect, useState } from 'react'

type Campaign = { id: number; title: string; body: string; url: string; audience: string; sent: number; failed: number; createdAt: string }
type Data = { total: number; users: number; guests: number; campaigns: Campaign[]; config: { accountEvents: boolean } }
const AUDIENCE: Record<string, string> = { ALL: 'همهٔ مشترکان', USERS: 'فقط کاربران واردشده', VIP: 'فقط اعضای VIP', GUESTS: 'فقط مهمان‌ها' }
const fa = (n: number) => n.toLocaleString('fa-IR')

/** Web push: subscribers, account-event setting and broadcast campaigns. */
export default function AdminPushPage() {
  const [data, setData] = useState<Data | null>(null)
  const [form, setForm] = useState({ title: '', body: '', url: '/', audience: 'ALL' })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)

  const load = useCallback(async () => {
    const response = await fetch('/api/admin/push', { cache: 'no-store' }).catch(() => null)
    const body = await response?.json().catch(() => null)
    if (response?.ok) setData(body)
    else setMessage({ text: body?.error || 'دریافت اطلاعات ناموفق بود', error: true })
  }, [])
  useEffect(() => { void load() }, [load])

  async function post(body: unknown, success: (result: { sent?: number; failed?: number }) => string) {
    setBusy(true); setMessage(null)
    const response = await fetch('/api/admin/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)
    const result = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) { setMessage({ text: result?.error || 'انجام نشد', error: true }); return false }
    setMessage({ text: success(result), error: false })
    await load()
    return true
  }

  return <div className="xm-page" dir="rtl">
    <header className="tb-hero"><div><span className="tb-eyebrow">WEB PUSH</span><h1>اعلان مرورگر</h1>
      <p>{data ? `${fa(data.total)} مرورگر مشترک (${fa(data.users)} کاربر واردشده، ${fa(data.guests)} مهمان).` : ''} اعلان‌ها رایگان‌اند و روی گوشی و دسکتاپ — حتی وقتی سایت باز نیست — نمایش داده می‌شوند. بازدیدکننده‌ها پس از چند بازدید پیشنهاد فعال‌سازی را می‌بینند.</p></div></header>
    {message && <div className={`xm-notice${message.error ? ' is-error' : ''}`} role="status">{message.text}</div>}
    <section className="xm-section">
      <h2>ارسال اعلان همگانی</h2>
      <form className="card fr-admin-form" onSubmit={async (e) => { e.preventDefault(); if (window.confirm(`اعلان برای «${AUDIENCE[form.audience]}» ارسال شود؟`) && await post({ action: 'campaign', ...form }, (r) => `ارسال شد: ${fa(r.sent || 0)} موفق، ${fa(r.failed || 0)} ناموفق`)) setForm({ ...form, title: '', body: '' }) }}>
        <label className="studio-field"><span>عنوان *</span><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={120} required placeholder="مثلاً: تخفیف ۳۰٪ فروشگاه تا جمعه" /></label>
        <label className="studio-field"><span>مخاطب</span><select className="input" value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })}>{Object.entries(AUDIENCE).map(([key, label]) => <option key={key} value={key} data-vip={key === 'VIP' ? '' : undefined}>{label}</option>)}</select></label>
        <label className="studio-field fr-admin-wide"><span>متن</span><input className="input" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} maxLength={300} /></label>
        <label className="studio-field fr-admin-wide"><span>با کلیک باز شود (مسیر داخلی سایت)</span><input className="input" dir="ltr" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="/vip" /></label>
        <div className="pwa-preview fr-admin-wide" aria-hidden="true"><b>{form.title || 'عنوان اعلان'}</b><span>{form.body || 'متن اعلان'}</span></div>
        <div className="fr-admin-actions"><button className="btn btn-primary btn-sm" disabled={busy || form.title.trim().length < 3 || !data?.total}>ارسال اعلان</button></div>
      </form>
    </section>
    <section className="xm-section">
      <h2>اعلان رویدادهای حساب</h2>
      <div className="card" style={{ padding: '1rem' }}>
        <label className="studio-switch"><input type="checkbox" checked={data?.config.accountEvents ?? true} disabled={!data || busy} onChange={(e) => void post({ action: 'config', accountEvents: e.target.checked }, () => 'ذخیره شد')} />پیام‌های حساب کاربری (پرداخت، تحویل سفارش، پاسخ تیکت، تالار، نسخهٔ جدید علاقه‌مندی‌ها…) به‌صورت اعلان مرورگر هم ارسال شوند</label>
        <p className="muted">اعلان محتوای تازه (نرم‌افزار، فیلم، …) از بخش «انتشار خودکار در شبکه‌های اجتماعی ← قواعد» فعال می‌شود.</p>
      </div>
    </section>
    <section className="xm-section">
      <h2>اعلان‌های ارسال‌شده</h2>
      <div className="table-wrap card"><table className="table"><thead><tr><th>عنوان</th><th>مخاطب</th><th>موفق / ناموفق</th><th>زمان</th></tr></thead><tbody>
        {data?.campaigns.map((campaign) => <tr key={campaign.id}><td><b>{campaign.title}</b>{campaign.body && <><br /><small className="muted">{campaign.body}</small></>}</td><td>{AUDIENCE[campaign.audience] || campaign.audience}</td><td>{fa(campaign.sent)} / {fa(campaign.failed)}</td><td><small>{new Date(campaign.createdAt).toLocaleString('fa-IR')}</small></td></tr>)}
        {data && !data.campaigns.length && <tr><td colSpan={4} className="muted">هنوز اعلانی ارسال نشده است.</td></tr>}
      </tbody></table></div>
    </section>
  </div>
}
