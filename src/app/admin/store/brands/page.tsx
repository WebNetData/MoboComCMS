'use client'

import { useState } from 'react'
import CoverField from '../../cms/CoverField'
import { Notice, StoreShell, fa, send, useJson } from '../shared'

type Brand = { id: number; slug: string; name: string; nameEn: string; logo: string; description: string; featured: boolean; sortOrder: number; products: number }
const EMPTY = { slug: '', name: '', nameEn: '', logo: '', description: '', featured: false, sortOrder: 0 }

export default function BrandsPage() {
  const { data, error, reload } = useJson<{ brands: Brand[] }>('/api/admin/store/brands')
  const [form, setForm] = useState<typeof EMPTY & { id?: number }>(EMPTY)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const update = (key: string, value: unknown) => setForm((current) => ({ ...current, [key]: value }))

  async function save() {
    setBusy(true); setResult(null)
    const response = form.id ? await send(`/api/admin/store/brands/${form.id}`, 'PATCH', form) : await send('/api/admin/store/brands', 'POST', form)
    setBusy(false)
    if (!response.ok) { setResult({ tone: 'error', text: response.error }); return }
    setResult({ tone: 'ok', text: form.id ? 'برند به‌روز شد' : 'برند اضافه شد' }); setForm(EMPTY); void reload()
  }
  async function remove(brand: Brand) {
    if (!window.confirm(`برند «${brand.name}» حذف شود؟ ${brand.products ? `${fa(brand.products)} محصول بدون برند می‌شوند.` : ''}`)) return
    const response = await send(`/api/admin/store/brands/${brand.id}`, 'DELETE')
    if (!response.ok) { setResult({ tone: 'error', text: response.error }); return }
    void reload()
  }

  return <StoreShell title="برندها">
    {error && <Notice tone="error">{error}</Notice>}
    {result && <Notice tone={result.tone}>{result.text}</Notice>}
    <div className="sa-cols">
      <section className="sa-card sa-table-wrap">
        <table className="data sa-table"><thead><tr><th>برند</th><th>نامک</th><th>محصولات</th><th /></tr></thead>
          <tbody>{data?.brands.map((brand) => <tr key={brand.id}>
            <td><div className="sa-product-cell">{brand.logo ? <img src={brand.logo} alt="" /> : <span className="sa-ph" />}<span><b>{brand.name}</b>{brand.featured && <span className="sa-tag">ویژه</span>}<small className="sa-sub">{brand.nameEn}</small></span></div></td>
            <td dir="ltr"><small>{brand.slug}</small></td>
            <td className="num"><a className="sa-link" href={`/admin/store/products?brand=${brand.id}`}>{fa(brand.products)}</a></td>
            <td><div className="sa-row-actions"><button type="button" className="sa-link" onClick={() => setForm({ ...brand })}>ویرایش</button><button type="button" className="sa-link is-danger" onClick={() => void remove(brand)}>حذف</button></div></td>
          </tr>)}
          {data && !data.brands.length && <tr><td colSpan={4} className="sa-empty">هنوز برندی ثبت نشده است.</td></tr>}</tbody>
        </table>
      </section>
      <section className="sa-card">
        <header className="sa-card-head"><h2>{form.id ? 'ویرایش برند' : 'برند جدید'}</h2>{form.id && <button type="button" className="sa-link" onClick={() => setForm(EMPTY)}>انصراف</button>}</header>
        <form className="sa-form" onSubmit={(event) => { event.preventDefault(); void save() }}>
          <label className="sa-field"><span>نام برند *</span><input className="input" required value={form.name} onChange={(event) => update('name', event.target.value)} /></label>
          <label className="sa-field"><span>نام انگلیسی</span><input className="input" dir="ltr" value={form.nameEn} onChange={(event) => update('nameEn', event.target.value)} /></label>
          <label className="sa-field"><span>نامک (لاتین) *</span><input className="input" dir="ltr" required pattern="[a-z0-9][a-z0-9-]*" value={form.slug} onChange={(event) => update('slug', event.target.value.toLowerCase())} placeholder="samsung" /></label>
          <div className="sa-field"><span>لوگو</span><CoverField value={form.logo} title={form.name} onChange={(value) => update('logo', value)} onBusy={setBusy} /></div>
          <label className="sa-field"><span>توضیح</span><textarea className="input" rows={3} value={form.description} onChange={(event) => update('description', event.target.value)} /></label>
          <label className="sa-check"><input type="checkbox" checked={form.featured} onChange={(event) => update('featured', event.target.checked)} />در صفحهٔ اصلی فروشگاه جلوتر نمایش داده شود</label>
          <label className="sa-field"><span>ترتیب</span><input className="input" type="number" value={form.sortOrder} onChange={(event) => update('sortOrder', Number(event.target.value))} /></label>
          <button type="submit" className="btn btn-primary" disabled={busy}>{form.id ? 'ذخیره' : 'افزودن برند'}</button>
        </form>
      </section>
    </div>
  </StoreShell>
}
