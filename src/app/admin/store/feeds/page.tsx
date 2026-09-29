'use client'

import { useState, type FormEvent } from 'react'
import { Notice, StoreShell, fa, useJson } from '../shared'

type Settings = { torob: boolean; emalls: boolean; xml: boolean; includeOutOfStock: boolean; excludeCategories: string[]; emallsToken: string; hasEmallsToken: boolean; titleSuffix: string }
type Overview = {
  settings: Settings
  urls: { torob: string; emalls: string; xml: string }
  eligible: number
  skippedCurrency: number
  sample: { id: number; title: string; price: number; oldPrice: number; available: boolean; category: string; url: string; image: string }[]
}

function FeedCard({ title, logo, on, onToggle, url, steps, extra }: { title: string; logo: string; on: boolean; onToggle: (value: boolean) => void; url: string; steps: string[]; extra?: React.ReactNode }) {
  const [copied, setCopied] = useState(false)
  return <section className={`sa-card fd-card${on ? ' is-on' : ''}`}>
    <header className="sa-card-head">
      <h2><span className="fd-logo" aria-hidden="true">{logo}</span>{title}</h2>
      <label className="sa-check"><input type="checkbox" checked={on} onChange={(e) => onToggle(e.target.checked)} /> <span>{on ? 'فعال' : 'غیرفعال'}</span></label>
    </header>
    <div className="fd-url">
      <code dir="ltr">{url}</code>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => { void navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500) }}>{copied ? 'کپی شد' : 'کپی'}</button>
      {on && <a className="btn btn-ghost btn-sm" href={url.replace('?token=…', '')} target="_blank" rel="noreferrer">مشاهده</a>}
    </div>
    <ol className="fd-steps">{steps.map((step) => <li key={step}>{step}</li>)}</ol>
    {extra}
  </section>
}

export default function FeedsPage() {
  const { data, error, reload, setData } = useJson<Overview>('/api/admin/store/feeds')
  const [form, setForm] = useState<(Settings & { exclude: string }) | null>(null)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  if (error) return <StoreShell title="ترب، ایمالز و خوراک محصولات"><Notice tone="error">{error}</Notice></StoreShell>
  if (!data) return <StoreShell title="ترب، ایمالز و خوراک محصولات"><div className="sa-skeleton" /></StoreShell>
  const current = form || { ...data.settings, emallsToken: '', exclude: data.settings.excludeCategories.join(', ') }
  const set = (patch: Partial<Settings & { exclude: string }>) => setForm({ ...current, ...patch })

  async function save(event?: FormEvent, patch: Partial<Settings> = {}) {
    event?.preventDefault()
    setBusy(true); setNotice(null)
    const settings = { ...current, ...patch, excludeCategories: current.exclude.split(/[\s,،]+/).filter(Boolean) }
    const response = await fetch('/api/admin/store/feeds', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings }) }).catch(() => null)
    const body = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) { setNotice({ tone: 'error', text: body?.error || 'ذخیره انجام نشد' }); return }
    setData(body); setForm(null); setNotice({ tone: 'ok', text: 'تنظیمات خوراک ذخیره شد.' })
  }
  const toggle = (key: 'torob' | 'emalls' | 'xml') => (value: boolean) => void save(undefined, { [key]: value })

  return <StoreShell title="ترب، ایمالز و خوراک محصولات">
    <p className="sa-hint fd-intro">با فعال کردن خوراک، سایت‌های مقایسهٔ قیمت فهرست محصولات، قیمت، تخفیف و موجودی شما را هر چند ساعت یک‌بار خودشان از این نشانی‌ها می‌خوانند؛ محصول تازه یا تغییر قیمت بدون کار اضافه در آن‌ها به‌روز می‌شود. قیمت‌ها به تومان فرستاده می‌شود.</p>
    <div className="sa-kpis">
      <div className="sa-kpi"><small>محصولات قابل ارسال</small><b className="num">{fa(data.eligible)}</b></div>
      <div className="sa-kpi"><small>محصولات با ارز غیرریالی (ارسال نمی‌شوند)</small><b className="num">{fa(data.skippedCurrency)}</b></div>
      <div className="sa-kpi"><small>خوراک‌های فعال</small><b className="num">{fa([data.settings.torob, data.settings.emalls, data.settings.xml].filter(Boolean).length)}</b></div>
    </div>
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    <div className="fd-grid">
      <FeedCard title="ترب (torob.com)" logo="T" on={data.settings.torob} onToggle={toggle('torob')} url={data.urls.torob} steps={[
        'در ترب وارد پنل فروشندگان شوید (torob.com ← ثبت فروشگاه) و دامنهٔ سایت را ثبت کنید.',
        'در بخش «اتصال فروشگاه / API» نوع اتصال را «Torob API نسخهٔ ۳» بگذارید و همین نشانی را وارد کنید.',
        'پس از بررسی ترب، محصولات هر چند ساعت یک‌بار خودکار به‌روز می‌شوند.',
      ]} />
      <FeedCard title="ایمالز (emalls.ir)" logo="E" on={data.settings.emalls} onToggle={toggle('emalls')} url={data.urls.emalls} steps={[
        'در پنل فروشگاه‌های ایمالز ثبت‌نام کنید و فروشگاه را معرفی کنید.',
        'در «وب‌سرویس فروشگاه» همین نشانی را بدهید (اگر رمز گذاشته‌اید، رمز را به‌صورت ?token=… به انتهای نشانی اضافه کنید).',
        'ایمالز صفحه‌به‌صفحه (هر صفحه ۱۰۰ کالا) محصولات را می‌خواند.',
      ]} extra={<label className="sa-field"><span>رمز وب‌سرویس ایمالز (اختیاری) {data.settings.hasEmallsToken && <small>— تنظیم شده؛ خالی = بدون تغییر، «-» = حذف</small>}</span><input className="input" dir="ltr" value={current.emallsToken} onChange={(e) => set({ emallsToken: e.target.value.trim() })} placeholder="حداقل ۸ نویسه" /></label>} />
      <FeedCard title="خوراک XML عمومی (گوگل مرچنت و سایر سایت‌ها)" logo="X" on={data.settings.xml} onToggle={toggle('xml')} url={data.urls.xml} steps={[
        'قالب استاندارد RSS/Google Merchant، برای Google Merchant Center، ترب (روش XML)، بازارهای دیگر و ابزارهای تبلیغاتی.',
        'قیمت در این قالب به ریال (IRR) است، چون استاندارد کد ارز ISO می‌خواهد.',
      ]} />
    </div>
    <form className="sa-card sa-form" onSubmit={(e) => void save(e)}>
      <header className="sa-card-head"><h2>تنظیمات خوراک</h2></header>
      <label className="sa-check"><input type="checkbox" checked={current.includeOutOfStock} onChange={(e) => set({ includeOutOfStock: e.target.checked })} /> <span>کالاهای ناموجود هم (با وضعیت «ناموجود») فرستاده شوند — ترب توصیه می‌کند تا کالا از فهرست حذف نشود</span></label>
      <div className="sa-cols">
        <label className="sa-field"><span>دسته‌هایی که ارسال نشوند (نامک دسته، با کاما)</span><input className="input" dir="ltr" value={current.exclude} onChange={(e) => set({ exclude: e.target.value })} placeholder="gift-cards, services" /></label>
        <label className="sa-field"><span>پسوند عنوان محصولات (اختیاری)</span><input className="input" value={current.titleSuffix} onChange={(e) => set({ titleSuffix: e.target.value })} placeholder="— گارانتی اصالت" /></label>
      </div>
      <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'در حال ذخیره…' : 'ذخیره'}</button>
    </form>
    <section className="sa-card sa-table-wrap">
      <header className="sa-card-head"><h2>پیش‌نمایش آنچه سایت‌ها می‌بینند</h2><button type="button" className="btn btn-ghost btn-sm" onClick={() => void reload()}>تازه‌سازی</button></header>
      <table className="data sa-table" style={{ minWidth: 640 }}><thead><tr><th>محصول</th><th>دسته</th><th>قیمت (تومان)</th><th>وضعیت</th></tr></thead><tbody>
        {data.sample.map((row) => <tr key={row.id}>
          <td><div className="sa-prod">{row.image ? <img src={row.image} alt="" width={40} height={40} /> : <span className="sa-prod-ph" />}<div><a className="sa-link" href={row.url} target="_blank" rel="noreferrer">{row.title}</a></div></div></td>
          <td>{row.category || '—'}</td>
          <td className="num">{row.oldPrice > 0 && <s className="fd-old">{fa(row.oldPrice)}</s>} {fa(row.price)}</td>
          <td><span className={`sa-state ${row.available ? 'is-ok' : 'is-warn'}`}>{row.available ? 'موجود' : 'ناموجود'}</span></td>
        </tr>)}
        {!data.sample.length && <tr><td colSpan={4} className="sa-empty">محصول قابل ارسالی نیست (فقط محصولات فعال، عمومی و با قیمت تومان/ریال ارسال می‌شوند).</td></tr>}
      </tbody></table>
    </section>
  </StoreShell>
}
