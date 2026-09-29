'use client'

import { useState } from 'react'
import { Notice, RepoShell, faDate, kb, KIND, send, useJson } from '../shared'

type Release = { id: number; version: string; size: number; changelog: string; requiresCore: string; runtime: string; published: boolean; createdAt: string; sha256: string }
type Product = { id: number; slug: string; kind: string; name: string; summary: string; description: string; icon: string; cover: string; author: string; category: string; price: string; priceLabel: string; siteLimit: number; supportDays: number; active: boolean; featured: boolean; downloads: number; sold: number; licenses: number; releases: Release[] }
type Draft = { id?: number; slug: string; kind: string; name: string; summary: string; description: string; icon: string; author: string; category: string; price: string; siteLimit: number; supportDays: number; active: boolean; featured: boolean }
const EMPTY: Draft = { slug: '', kind: 'PLUGIN', name: '', summary: '', description: '', icon: '', author: '', category: '', price: '0', siteLimit: 1, supportDays: 365, active: false, featured: false }

export default function ProductsPage() {
  const { data, error, reload } = useJson<{ products: Product[] }>('/api/admin/repository?view=products')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [changelog, setChangelog] = useState('')
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => (d ? { ...d, [key]: value } : d))

  async function save() {
    if (!draft) return
    setBusy(true)
    const r = await send('/api/admin/repository', 'POST', { op: 'product.save', ...draft })
    setBusy(false)
    if (!r.ok) { setNotice({ tone: 'error', text: r.error }); return }
    setNotice({ tone: 'ok', text: 'محصول ذخیره شد.' }); setDraft(null); void reload()
  }
  async function upload(p: Product) {
    if (!file) return
    setBusy(true)
    const form = new FormData()
    form.append('productId', String(p.id)); form.append('changelog', changelog); form.append('file', file, file.name)
    const response = await fetch('/api/admin/repository/upload', { method: 'POST', body: form }).catch(() => null)
    const body = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) { setNotice({ tone: 'error', text: body?.error || 'بارگذاری نشد' }); return }
    setNotice({ tone: 'ok', text: `نسخهٔ ${body.version} منتشر شد.` }); setFile(null); setChangelog(''); void reload()
  }
  async function toggle(r: Release) { const res = await send('/api/admin/repository', 'POST', { op: 'release.publish', id: r.id, published: !r.published }); setNotice(res.ok ? { tone: 'ok', text: r.published ? 'نسخه از فهرست برداشته شد.' : 'نسخه منتشر شد.' } : { tone: 'error', text: res.error }); if (res.ok) void reload() }
  async function remove(p: Product) { if (!window.confirm(`«${p.name}» حذف شود؟`)) return; const res = await send('/api/admin/repository', 'POST', { op: 'product.delete', id: p.id }); setNotice(res.ok ? { tone: 'ok', text: 'حذف شد.' } : { tone: 'error', text: res.error }); if (res.ok) void reload() }

  return <RepoShell title="محصولات من (فروش افزونه و قالب)" actions={<button type="button" className="btn btn-primary" onClick={() => setDraft({ ...EMPTY })}>+ محصول تازه</button>}>
    {error && <Notice tone="error">{error}</Notice>}
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    <p className="sa-hint">برای فروش، ابتدا در «تنظیمات» نقش فروشنده را روشن کنید. شناسهٔ محصول باید دقیقاً برابر <code dir="ltr">id</code> در <code dir="ltr">manifest.json</code> بستهٔ zip باشد.</p>
    {draft && <section className="sa-card rp-form" aria-label="ویرایش محصول">
      <header className="sa-card-head"><h2>{draft.id ? 'ویرایش محصول' : 'محصول تازه'}</h2></header>
      <div className="ad-fields">
        <label className="sa-field"><span>نام</span><input className="input" value={draft.name} maxLength={80} onChange={(e) => set('name', e.target.value)} /></label>
        <label className="sa-field"><span>شناسه (id بسته)</span><input className="input" dir="ltr" value={draft.slug} disabled={!!draft.id} onChange={(e) => set('slug', e.target.value.toLowerCase())} placeholder="my-plugin" /></label>
        <label className="sa-field"><span>نوع</span><select className="input" value={draft.kind} disabled={!!draft.id} onChange={(e) => set('kind', e.target.value)}><option value="PLUGIN">افزونه</option><option value="THEME">قالب</option></select></label>
        <label className="sa-field"><span>قیمت (تومان؛ ۰ = رایگان)</span><input className="input" dir="ltr" inputMode="numeric" value={draft.price} onChange={(e) => set('price', e.target.value)} /></label>
        <label className="sa-field"><span>تعداد سایت برای هر لایسنس (۰ = نامحدود)</span><input className="input" type="number" min={0} value={draft.siteLimit} onChange={(e) => set('siteLimit', Number(e.target.value))} /></label>
        <label className="sa-field"><span>روزهای به‌روزرسانی (۰ = همیشه)</span><input className="input" type="number" min={0} value={draft.supportDays} onChange={(e) => set('supportDays', Number(e.target.value))} /></label>
        <label className="sa-field"><span>سازنده</span><input className="input" value={draft.author} onChange={(e) => set('author', e.target.value)} /></label>
        <label className="sa-field"><span>دسته</span><input className="input" value={draft.category} onChange={(e) => set('category', e.target.value)} /></label>
      </div>
      <label className="sa-field"><span>معرفی کوتاه</span><input className="input" value={draft.summary} maxLength={200} onChange={(e) => set('summary', e.target.value)} /></label>
      <label className="sa-field"><span>توضیحات کامل</span><textarea className="input" rows={5} value={draft.description} onChange={(e) => set('description', e.target.value)} /></label>
      <label className="sa-field"><span>نشانی آیکن (https)</span><input className="input" dir="ltr" value={draft.icon} onChange={(e) => set('icon', e.target.value)} /></label>
      <label className="sa-check"><input type="checkbox" checked={draft.active} onChange={(e) => set('active', e.target.checked)} /> در فهرست عمومی نمایش داده شود (نیازمند دست‌کم یک نسخهٔ منتشرشده)</label>
      <label className="sa-check"><input type="checkbox" checked={draft.featured} onChange={(e) => set('featured', e.target.checked)} /> ویژه</label>
      <div className="sa-row-actions"><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>ذخیره</button><button type="button" className="btn btn-ghost" onClick={() => setDraft(null)}>انصراف</button></div>
    </section>}

    <div className="rp-list">{data?.products.map((p) => <section key={p.id} className="sa-card">
      <header className="sa-card-head"><div><h2>{p.name} <span className="sa-state">{KIND[p.kind]}</span> {!p.active && <span className="sa-state is-warn">پیش‌نویس</span>}</h2><small className="sa-sub" dir="ltr">{p.slug}</small></div>
        <div className="sa-row-actions"><button type="button" className="btn btn-ghost btn-sm" onClick={() => setDraft({ id: p.id, slug: p.slug, kind: p.kind, name: p.name, summary: p.summary, description: p.description, icon: p.icon, author: p.author, category: p.category, price: p.price, siteLimit: p.siteLimit, supportDays: p.supportDays, active: p.active, featured: p.featured })}>ویرایش</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(open === p.id ? null : p.id)} aria-expanded={open === p.id}>نسخه‌ها ({p.releases.length.toLocaleString('fa-IR')})</button>
          {p.licenses === 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => void remove(p)}>حذف</button>}</div></header>
      <p className="sa-sub">{p.priceLabel} · {p.sold.toLocaleString('fa-IR')} فروش · {p.downloads.toLocaleString('fa-IR')} دانلود · {p.licenses.toLocaleString('fa-IR')} لایسنس</p>
      {open === p.id && <div className="rp-releases">
        <table className="data sa-table"><thead><tr><th>نسخه</th><th>حجم</th><th>هسته</th><th>زمان</th><th /></tr></thead><tbody>
          {p.releases.map((r) => <tr key={r.id}><td dir="ltr"><b>{r.version}</b> {!r.published && <span className="sa-state is-warn">پنهان</span>}<small className="sa-sub">{r.changelog}</small></td><td>{kb(r.size)}</td><td dir="ltr">{r.requiresCore || '—'}</td><td>{faDate(r.createdAt)}</td><td><button type="button" className="btn btn-ghost btn-sm" onClick={() => void toggle(r)}>{r.published ? 'پنهان کن' : 'منتشر کن'}</button></td></tr>)}
          {!p.releases.length && <tr><td colSpan={5} className="sa-empty">هنوز نسخه‌ای نیست.</td></tr>}
        </tbody></table>
        <div className="rp-upload"><b>انتشار نسخهٔ تازه</b>
          <input type="file" accept=".zip,application/zip" aria-label="فایل zip" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          <input className="input" value={changelog} maxLength={5000} placeholder="تغییرات این نسخه" aria-label="تغییرات" onChange={(e) => setChangelog(e.target.value)} />
          <button type="button" className="btn btn-primary btn-sm" disabled={!file || busy} onClick={() => void upload(p)}>{busy ? 'در حال بارگذاری…' : 'بارگذاری و انتشار'}</button>
          <small className="sa-hint">نسخه از manifest.json خوانده می‌شود و باید از نسخه‌های قبلی بالاتر باشد. ساخت zip: <code dir="ltr">npm run package:zip -- &lt;folder&gt;</code></small></div>
      </div>}
    </section>)}
    {data && !data.products.length && <p className="sa-empty">هنوز محصولی نساخته‌اید.</p>}</div>
  </RepoShell>
}
