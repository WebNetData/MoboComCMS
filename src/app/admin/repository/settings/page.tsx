'use client'

import { useEffect, useState } from 'react'
import { Notice, RepoShell, fa, send, useJson } from '../shared'

type Overview = { stats: { products: number; licenses: number; active: number; revenue: string; downloads: number }; settings: { enabled: boolean; name: string } }

export default function RepositorySettingsPage() {
  const { data, error, reload } = useJson<Overview>('/api/admin/repository')
  const [form, setForm] = useState<{ enabled: boolean; name: string } | null>(null)
  const [meta, setMeta] = useState<{ name: string; fingerprint: string; publicKey: string } | null>(null)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  useEffect(() => { if (data) setForm(data.settings) }, [data])
  useEffect(() => { if (form?.enabled && data?.settings.enabled) void fetch('/api/repo/v1/meta', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then(setMeta).catch(() => null) }, [form?.enabled, data?.settings.enabled])
  if (!form) return <RepoShell title="تنظیمات مخزن">{error ? <Notice tone="error">{error}</Notice> : <div className="sa-skeleton" aria-busy="true" />}</RepoShell>

  async function save() {
    const r = await send('/api/admin/repository', 'POST', { op: 'settings', ...form })
    setNotice(r.ok ? { tone: 'ok', text: 'ذخیره شد.' } : { tone: 'error', text: r.error })
    if (r.ok) void reload()
  }
  return <RepoShell title="تنظیمات مخزن">
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    <div className="sa-kpis">
      <div className="sa-kpi"><small>محصول</small><b className="num">{fa(data!.stats.products)}</b></div>
      <div className="sa-kpi"><small>لایسنس</small><b className="num">{fa(data!.stats.licenses)}</b><span className="sa-sub">{fa(data!.stats.active)} فعال</span></div>
      <div className="sa-kpi"><small>دانلود</small><b className="num">{fa(data!.stats.downloads)}</b></div>
      <div className="sa-kpi"><small>درآمد فروش</small><b className="num">{data!.stats.revenue}</b></div>
    </div>
    <section className="sa-card ad-form">
      <header className="sa-card-head"><h2>نقش فروشنده</h2></header>
      <label className="sa-check"><input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} /> این سایت مخزن افزونه و قالب باشد <small className="sa-hint">سایت‌های دیگر با نشانی این سایت به آن وصل می‌شوند و می‌خرند/نصب می‌کنند.</small></label>
      <label className="sa-field"><span>نام مخزن (به سایت‌های متصل نشان داده می‌شود)</span><input className="input" value={form.name} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
      <div className="sa-row-actions"><button type="button" className="btn btn-primary" onClick={() => void save()}>ذخیره</button></div>
    </section>
    {meta && <section className="sa-card">
      <header className="sa-card-head"><h2>کلید امضا</h2></header>
      <p className="sa-hint">هر نسخه و هر گواهی لایسنس با این کلید امضا می‌شود. اثر انگشت را در وب‌سایتتان منتشر کنید تا مشتری‌ها هنگام اتصال با آن تطبیق دهند. کلید خصوصی هرگز از سرور خارج نمی‌شود (با متغیر <code dir="ltr">REPOSITORY_SIGNING_KEY</code> می‌توانید کلید خودتان را بدهید).</p>
      <p>اثر انگشت: <code dir="ltr">{meta.fingerprint}</code></p>
      <p>نشانی مخزن برای مشتری‌ها: <code dir="ltr">{typeof window === 'undefined' ? '' : window.location.origin}</code></p>
      <details><summary>کلید عمومی</summary><pre className="rp-notes" dir="ltr">{meta.publicKey}</pre></details>
    </section>}
    <p className="sa-hint">فروش با کیف پول کاربران سایت انجام می‌شود؛ صفحهٔ عمومی فروشگاه در <code dir="ltr">/repository</code> و لایسنس‌های هر خریدار در «پنل کاربری ← لایسنس‌های من» است.</p>
  </RepoShell>
}
