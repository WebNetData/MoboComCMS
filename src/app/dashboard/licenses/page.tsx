'use client'

import { useEffect, useState } from 'react'
import Link from '@/components/AppLink'

type License = { id: number; key: string; product: string; slug: string; status: string; siteLimit: number; updatesUntil: string; createdAt: string; sites: { site: string; active: boolean }[] }
const date = (iso: string) => new Date(iso).toLocaleDateString('fa-IR', { year: 'numeric', month: 'short', day: 'numeric' })

export default function LicensesDashboard() {
  const [rows, setRows] = useState<License[] | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState('')
  const load = () => fetch('/api/repo/mine', { cache: 'no-store' }).then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || 'دریافت نشد'); setRows((await r.json()).licenses) }).catch((e: Error) => setError(e.message))
  useEffect(() => { void load() }, [])
  async function release(l: License, site: string) {
    if (!window.confirm(`لایسنس از «${site}» برداشته شود؟`)) return
    await fetch('/api/repo/mine', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'release-site', licenseId: l.id, site }) })
    void load()
  }
  async function copy(key: string) { try { await navigator.clipboard.writeText(key); setCopied(key); setTimeout(() => setCopied(''), 2000) } catch { /* the key is visible to copy by hand */ } }
  if (error) return <div className="dash-card" role="alert">{error}</div>
  if (!rows) return <div className="dt-skeleton" role="status" aria-label="در حال بارگذاری" aria-busy="true"><i /><i /></div>
  return <div className="pr-portal" dir="rtl">
    <header className="pr-head"><div><h1>لایسنس‌های من</h1><p>کلید هر افزونه و قالب پولی که خریده‌اید</p></div><Link href="/repository" className="btn btn-ghost">فروشگاه افزونه‌ها</Link></header>
    {!rows.length && <div className="dt-empty"><b>هنوز لایسنسی ندارید</b><span>کلید افزونه‌ها و قالب‌هایی که از مخزن می‌خرید، با سایت‌هایی که رویشان فعال است، این‌جا می‌آید.</span><Link href="/repository" className="btn btn-primary">دیدن مخزن افزونه و قالب</Link></div>}
    {rows.map((l) => <section key={l.id} className="dash-card">
      <div className="dash-card-head"><div><h2>{l.product}</h2><p>خرید {date(l.createdAt)} · به‌روزرسانی تا {l.updatesUntil ? date(l.updatesUntil) : 'همیشه'} {l.status !== 'ACTIVE' && <b className="error-text"> · باطل‌شده</b>}</p></div></div>
      <div className="pr-actions"><code dir="ltr" style={{ overflowWrap: 'anywhere' }}>{l.key}</code><button type="button" className="btn btn-ghost btn-sm" onClick={() => void copy(l.key)}>{copied === l.key ? 'کپی شد ✓' : 'کپی'}</button>
        {l.status === 'ACTIVE' && <a className="btn btn-ghost btn-sm" href={`/api/repo/mine/download?license=${l.id}`}>دانلود آخرین نسخه (zip)</a>}</div>
      <p className="sa-hint">در پنل مدیریت سایتتان: «مخزن افزونه و قالب» ← وارد کردن کلید ← نصب.</p>
      <ul className="pr-campaigns">{l.sites.filter((s) => s.active).map((s) => <li key={s.site} className="pr-campaign"><span dir="ltr">{s.site}</span><button type="button" className="btn btn-ghost btn-sm" onClick={() => void release(l, s.site)}>برداشتن از این سایت</button></li>)}
        {!l.sites.some((s) => s.active) && <li className="pr-empty">روی هیچ سایتی فعال نیست ({l.siteLimit ? `${l.siteLimit.toLocaleString('fa-IR')} سایت مجاز` : 'نامحدود'}).</li>}</ul>
    </section>)}
  </div>
}
