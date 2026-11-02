'use client'

import { useState } from 'react'
import { Notice, fa, useJson } from '../shared'
import { send } from '../../store/shared'
import { VipShell } from '../shared'
import './rules.css'

type Data = {
  tiers: { id: number; name: string; rank: number }[]
  sources: { id: string; label: string; categories: { id: number; name: string }[] }[]
  rules: { id: number; ownerType: string; ownerId: number; source: string; category: string; minRank: number; dripDays: number }[]
}
const API = '/api/admin/membership/rules'

/** Rules on whole categories: everything filed under one, and under the ones below it, asks for this tier or wait. */
export default function VipRulesPage() {
  const { data, error, reload } = useJson<Data>(`${API}?list=1`)
  const [source, setSource] = useState('cat:post')
  const [category, setCategory] = useState(0)
  const [minRank, setMinRank] = useState(0)
  const [dripDays, setDripDays] = useState(0)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const categories = data?.sources.find((row) => row.id === source)?.categories || []
  const tier = (rank: number) => data?.tiers.find((row) => row.rank === rank)?.name || (rank ? `رتبهٔ ${fa(rank)}` : '')

  async function save(ownerType: string, ownerId: number, rank: number, days: number, done: string) {
    const result = await send(API, 'POST', { ownerType, ownerId, minRank: rank, dripDays: days })
    setNotice(result.ok ? { tone: 'ok', text: done } : { tone: 'error', text: result.error })
    if (result.ok) void reload()
  }
  return <VipShell title="قوانین دسته‌ها">
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    {error && <Notice tone="error">{error}</Notice>}
    <section className="sa-card" aria-labelledby="rule-new">
      <header className="sa-card-head"><h2 id="rule-new">قانون تازه</h2></header>
      <p className="sa-hint">قانون روی همهٔ موردهای این دسته و زیردسته‌هایش اعمال می‌شود. مورد در فهرست می‌ماند و برای کسی که شرط را ندارد قفل است؛ در فروشگاه، خرید آن ممکن نیست.</p>
      <div className="vr-grid">
        <label className="sa-field"><span>بخش</span><select className="input" value={source} onChange={(event) => { setSource(event.target.value); setCategory(0) }}>{data?.sources.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}</select></label>
        <label className="sa-field"><span>دسته</span><select className="input" value={category} onChange={(event) => setCategory(Number(event.target.value))}><option value={0}>انتخاب کنید</option>{categories.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
        <label className="sa-field"><span>حداقل سطح</span><select className="input" value={minRank} onChange={(event) => setMinRank(Number(event.target.value))}><option value={0}>بدون محدودیت سطح</option>{data?.tiers.map((row) => <option key={row.id} value={row.rank}>{row.name} و بالاتر</option>)}</select></label>
        <label className="sa-field"><span>باز شدن چند روز پس از شروع عضویت</span><input className="input" type="number" min={0} max={3650} dir="ltr" value={dripDays} onChange={(event) => setDripDays(Number(event.target.value))} /></label>
      </div>
      <button type="button" className="btn btn-primary vr-add" disabled={!category || (!minRank && !dripDays)} onClick={() => void save(source, category, minRank, dripDays, 'قانون ذخیره شد.')}>ذخیرهٔ قانون</button>
    </section>
    {data && <section className="sa-card" aria-label="قانون‌های فعلی">
      {data.rules.length ? <div className="sa-table-wrap"><table className="sa-table">
        <thead><tr><th>بخش</th><th>دسته</th><th>حداقل سطح</th><th>انتظار</th><th><span className="sr-only">کار</span></th></tr></thead>
        <tbody>{data.rules.map((rule) => <tr key={rule.id}><td>{rule.source}</td><td>{rule.category}</td><td>{tier(rule.minRank) || '—'}</td><td>{rule.dripDays ? `${fa(rule.dripDays)} روز` : '—'}</td><td><button type="button" className="btn btn-ghost" onClick={() => void save(rule.ownerType, rule.ownerId, 0, 0, 'قانون حذف شد.')}>حذف</button></td></tr>)}</tbody>
      </table></div> : <p className="sa-hint">هنوز قانونی برای دسته‌ها ثبت نشده است.</p>}
    </section>}
  </VipShell>
}
