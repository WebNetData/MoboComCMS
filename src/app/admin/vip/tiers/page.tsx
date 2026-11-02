'use client'

import { useState } from 'react'
import Link from '@/components/AppLink'
import { Notice, fa, send, useJson } from '../../store/shared'
import { VipShell } from '../shared'
import './tiers.css'

type Tier = { id: number; name: string; tagline: string; color: string; rank: number; storeDiscountPercent: number; freeShipping: boolean; hideAds: boolean; active: boolean; plans: number }
type Draft = Omit<Tier, 'id' | 'plans'> & { id?: number }
const API = '/api/admin/membership/tiers'
const EMPTY: Draft = { name: '', tagline: '', color: '#b45309', rank: 1, storeDiscountPercent: 0, freeShipping: false, hideAds: false, active: true }

function TierEditor({ draft, onDone, onCancel }: { draft: Draft; onDone: () => void; onCancel: () => void }) {
  const [form, setForm] = useState(draft)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setForm((current) => ({ ...current, [key]: value }))
  async function save() {
    setBusy(true); setError('')
    const result = await send(API, 'POST', { op: 'save', id: form.id, tier: form })
    setBusy(false)
    if (result.ok) onDone(); else setError(result.error)
  }
  return <section className="sa-card" aria-labelledby="tier-editor">
    <header className="sa-card-head"><h2 id="tier-editor">{form.id ? 'ویرایش سطح' : 'سطح تازه'}</h2></header>
    {error && <Notice tone="error">{error}</Notice>}
    <div className="vt-grid">
      <label className="sa-field"><span>نام سطح</span><input className="input" maxLength={60} placeholder="مثلاً: طلایی" value={form.name} onChange={(event) => set('name', event.target.value)} /></label>
      <label className="sa-field"><span>رتبه (بالاتر یعنی سطح بالاتر)</span><input className="input" type="number" min={1} max={99} dir="ltr" value={form.rank} onChange={(event) => set('rank', Number(event.target.value))} /></label>
      <label className="sa-field"><span>رنگ</span><input className="input" type="color" value={form.color} onChange={(event) => set('color', event.target.value)} /></label>
      <label className="sa-field vt-wide"><span>یک جمله دربارهٔ این سطح</span><input className="input" maxLength={160} value={form.tagline} onChange={(event) => set('tagline', event.target.value)} /></label>
      <label className="sa-field"><span>تخفیف فروشگاه (درصد)</span><input className="input" type="number" min={0} max={90} dir="ltr" value={form.storeDiscountPercent} onChange={(event) => set('storeDiscountPercent', Number(event.target.value))} /></label>
    </div>
    <div className="vt-checks">
      <label><input type="checkbox" checked={form.freeShipping} onChange={(event) => set('freeShipping', event.target.checked)} /> ارسال رایگان</label>
      <label><input type="checkbox" checked={form.hideAds} onChange={(event) => set('hideAds', event.target.checked)} /> سایت بدون تبلیغ</label>
      <label><input type="checkbox" checked={form.active} onChange={(event) => set('active', event.target.checked)} /> نمایش در صفحهٔ پلن‌ها</label>
    </div>
    <div className="vt-actions"><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'در حال ذخیره…' : 'ذخیرهٔ سطح'}</button><button type="button" className="btn btn-ghost" onClick={onCancel}>انصراف</button></div>
  </section>
}

/** VIP tiers: the order of levels, and what each gives across the site. */
export default function VipTiersPage() {
  const { data, error, reload } = useJson<{ tiers: Tier[] }>(API)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [notice, setNotice] = useState('')
  async function remove(tier: Tier) {
    if (!window.confirm(`سطح «${tier.name}» حذف شود؟ پلن‌های آن بدون سطح می‌مانند و اعضا اشتراکشان را از دست نمی‌دهند.`)) return
    const result = await send(API, 'POST', { op: 'delete', id: tier.id })
    if (result.ok) { setNotice('سطح حذف شد.'); void reload() } else setNotice(result.error)
  }
  const next = Math.max(0, ...(data?.tiers || []).map((tier) => tier.rank)) + 1
  return <VipShell title="سطح‌های عضویت" actions={!draft && <button type="button" className="btn btn-primary" onClick={() => { setNotice(''); setDraft({ ...EMPTY, rank: next }) }}>سطح تازه</button>}>
    {notice && <Notice tone="ok">{notice}</Notice>}
    {error && <Notice tone="error">{error}</Notice>}
    {draft && <TierEditor key={draft.id || 'new'} draft={draft} onCancel={() => setDraft(null)} onDone={() => { setDraft(null); setNotice('سطح ذخیره شد.'); void reload() }} />}
    {data && <section className="sa-card" aria-label="فهرست سطح‌ها">
      {data.tiers.length ? <div className="vt-scroll"><table className="sa-table">
        <thead><tr><th>سطح</th><th>رتبه</th><th>پلن‌ها</th><th>مزایا</th><th>وضعیت</th><th><span className="sr-only">کارها</span></th></tr></thead>
        <tbody>{data.tiers.map((tier) => <tr key={tier.id}>
          <td><span className="vt-dot" style={{ background: tier.color }} aria-hidden="true" />{tier.name}</td>
          <td>{fa(tier.rank)}</td>
          <td>{fa(tier.plans)}</td>
          <td>{[tier.storeDiscountPercent > 0 && `${fa(tier.storeDiscountPercent)}٪ تخفیف`, tier.freeShipping && 'ارسال رایگان', tier.hideAds && 'بدون تبلیغ'].filter(Boolean).join('، ') || '—'}</td>
          <td><span className={`sa-state ${tier.active ? 'is-ok' : ''}`}>{tier.active ? 'فعال' : 'پنهان'}</span></td>
          <td><button type="button" className="btn btn-ghost" onClick={() => { setNotice(''); setDraft(tier) }}>ویرایش</button><button type="button" className="btn btn-ghost" onClick={() => void remove(tier)}>حذف</button></td>
        </tr>)}</tbody>
      </table></div> : <p className="sa-hint">هنوز سطحی ساخته نشده است. بدون سطح، همهٔ پلن‌ها یک سطح حساب می‌شوند. قیمت هر سطح را در <Link href="/admin/vip/plans">پلن‌ها</Link> تعیین کنید.</p>}
    </section>}
  </VipShell>
}
