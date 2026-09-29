'use client'

import { useState } from 'react'
import { AdsShell, Notice, fa, send, useJson } from '../shared'

type Pkg = { id: number; name: string; description: string; placements: string[]; days: number; impressions: number; clicks: number; price: string; priceLabel: string; active: boolean; sortOrder: number; sold: number }
type Draft = { id?: number; name: string; description: string; placements: string[]; days: number; impressions: number; clicks: number; price: string; active: boolean; sortOrder: number }
type Data = { packages: Pkg[]; placements: { key: string; name: string; width: number; height: number }[] }
const EMPTY: Draft = { name: '', description: '', placements: [], days: 30, impressions: 0, clicks: 0, price: '', active: true, sortOrder: 0 }

export default function PackagesPage() {
  const { data, error, reload } = useJson<Data>('/api/admin/ads?view=packages')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => (d ? { ...d, [key]: value } : d))
  const names = new Map((data?.placements || []).map((p) => [p.key, p.name]))

  async function save() {
    if (!draft) return
    const result = await send('/api/admin/ads', 'POST', { op: 'package.save', ...draft })
    if (!result.ok) { setNotice({ tone: 'error', text: result.error }); return }
    setNotice({ tone: 'ok', text: 'بسته ذخیره شد.' }); setDraft(null); void reload()
  }
  async function remove(row: Pkg) {
    if (!window.confirm(row.sold ? 'این بسته فروخته شده است؛ فقط غیرفعال می‌شود. ادامه می‌دهید؟' : `بستهٔ «${row.name}» حذف شود؟`)) return
    const result = await send('/api/admin/ads', 'POST', { op: 'package.delete', id: row.id })
    setNotice(result.ok ? { tone: 'ok', text: row.sold ? 'بسته غیرفعال شد.' : 'حذف شد.' } : { tone: 'error', text: result.error })
    if (result.ok) void reload()
  }
  const toggle = (key: string) => setDraft((d) => (d ? { ...d, placements: d.placements.includes(key) ? d.placements.filter((k) => k !== key) : [...d.placements, key] } : d))

  return <AdsShell title="بسته‌های فروش تبلیغ" actions={<button type="button" className="btn btn-primary" onClick={() => setDraft({ ...EMPTY })}>+ بستهٔ تازه</button>}>
    {error && <Notice tone="error">{error}</Notice>}
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    <p className="sa-hint">کاربران از صفحهٔ عمومی «تبلیغات» بسته را با کیف پول می‌خرند؛ کمپین پس از تأیید شما فعال می‌شود و در صورت رد، مبلغ به کیف پولشان برمی‌گردد. قیمت‌ها به تومان است.</p>
    {draft && <section className="sa-card ad-form" aria-label="ویرایش بسته">
      <header className="sa-card-head"><h2>{draft.id ? 'ویرایش بسته' : 'بستهٔ تازه'}</h2></header>
      <div className="ad-fields">
        <label className="sa-field"><span>نام بسته</span><input className="input" value={draft.name} onChange={(e) => set('name', e.target.value)} maxLength={80} /></label>
        <label className="sa-field"><span>قیمت (تومان)</span><input className="input" dir="ltr" inputMode="numeric" value={draft.price} onChange={(e) => set('price', e.target.value)} /></label>
        <label className="sa-field"><span>مدت (روز)</span><input className="input" type="number" min={1} max={730} value={draft.days} onChange={(e) => set('days', Number(e.target.value))} /></label>
        <label className="sa-field"><span>سقف نمایش (۰ = نامحدود)</span><input className="input" type="number" min={0} value={draft.impressions} onChange={(e) => set('impressions', Number(e.target.value))} /></label>
        <label className="sa-field"><span>سقف کلیک (۰ = نامحدود)</span><input className="input" type="number" min={0} value={draft.clicks} onChange={(e) => set('clicks', Number(e.target.value))} /></label>
        <label className="sa-field"><span>ترتیب</span><input className="input" type="number" min={0} max={1000} value={draft.sortOrder} onChange={(e) => set('sortOrder', Number(e.target.value))} /></label>
        <label className="sa-check"><input type="checkbox" checked={draft.active} onChange={(e) => set('active', e.target.checked)} /> در دسترس خرید</label>
      </div>
      <label className="sa-field"><span>توضیح</span><input className="input" value={draft.description} onChange={(e) => set('description', e.target.value)} maxLength={300} /></label>
      <fieldset className="ad-choices"><legend>جایگاه‌های بسته</legend>{data?.placements.map((p) => <label key={p.key} className="sa-check"><input type="checkbox" checked={draft.placements.includes(p.key)} onChange={() => toggle(p.key)} /> {p.name}{p.width && p.height ? <small dir="ltr"> {p.width}×{p.height}</small> : null}</label>)}</fieldset>
      <div className="sa-row-actions"><button type="button" className="btn btn-primary" onClick={() => void save()}>ذخیره</button><button type="button" className="btn btn-ghost" onClick={() => setDraft(null)}>انصراف</button></div>
    </section>}
    <section className="sa-card sa-table-wrap">
      <table className="data sa-table" style={{ minWidth: 760 }}><thead><tr><th>بسته</th><th>جایگاه‌ها</th><th>مدت</th><th>سقف نمایش</th><th>قیمت</th><th>فروخته‌شده</th><th /></tr></thead><tbody>
        {data?.packages.map((row) => <tr key={row.id}>
          <td><b>{row.name}</b> {!row.active && <span className="sa-state">غیرفعال</span>}<small className="sa-sub">{row.description}</small></td>
          <td className="sa-sub">{row.placements.map((k) => names.get(k) || k).join('، ')}</td>
          <td className="num">{fa(row.days)} روز</td>
          <td className="num">{row.impressions ? fa(row.impressions) : 'نامحدود'}</td>
          <td>{row.priceLabel}</td><td className="num">{fa(row.sold)}</td>
          <td><div className="sa-row-actions"><button type="button" className="btn btn-ghost btn-sm" onClick={() => setDraft({ id: row.id, name: row.name, description: row.description, placements: row.placements, days: row.days, impressions: row.impressions, clicks: row.clicks, price: row.price, active: row.active, sortOrder: row.sortOrder })}>ویرایش</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => void remove(row)}>حذف</button></div></td>
        </tr>)}
        {data && !data.packages.length && <tr><td colSpan={7} className="sa-empty">بسته‌ای تعریف نشده است. اولین بسته را بسازید تا فروش تبلیغ شروع شود.</td></tr>}
      </tbody></table>
    </section>
  </AdsShell>
}
