'use client'

import { useState } from 'react'
import { send, useJson } from '@/app/admin/store/shared'

type Rule = { minRank: number; dripDays: number; tiers: { id: number; name: string; rank: number }[] }

function RuleForm({ type, id, initial }: { type: string; id: number; initial: Rule }) {
  const [minRank, setMinRank] = useState(initial.minRank)
  const [dripDays, setDripDays] = useState(initial.dripDays)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ ok: boolean; text: string } | null>(null)
  async function save() {
    setBusy(true); setDone(null)
    const result = await send('/api/admin/membership/rules', 'POST', { type, id, minRank, dripDays })
    setBusy(false)
    setDone(result.ok ? { ok: true, text: 'ذخیره شد' } : { ok: false, text: result.error })
  }
  return <>
    <div className="ia-prices">
      {initial.tiers.length > 0 && <label><span>حداقل سطح</span><select className="input" value={minRank} onChange={(event) => setMinRank(Number(event.target.value))}><option value={0}>بدون محدودیت سطح</option>{initial.tiers.map((tier) => <option key={tier.id} value={tier.rank}>{tier.name} و بالاتر</option>)}</select></label>}
      <label><span>باز شدن چند روز پس از شروع عضویت</span><input className="input" type="number" min={0} max={3650} dir="ltr" value={dripDays} onChange={(event) => setDripDays(Number(event.target.value))} /></label>
    </div>
    <p className="ia-hint">این مورد در فهرست‌ها می‌ماند و برای کسی که شرط را ندارد قفل است و به صفحهٔ اشتراک هدایت می‌شود. صفر یعنی همان لحظهٔ عضویت باز است.</p>
    <div className="ia-actions">
      <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'در حال ذخیره…' : 'ذخیرهٔ قانون VIP'}</button>
      {done && <span role="status" className={done.ok ? 'ia-done' : 'ia-done is-error'}>{done.text}</span>}
    </div>
  </>
}

/** What this item asks of a VIP member: a tier, or days of membership. Hidden when the item cannot have a rule or VIP is off. */
export default function VipRulePanel({ type, id }: { type: string; id: number | null }) {
  const { data } = useJson<Rule>(id && ['post', 'title', 'game', 'software', 'track', 'album'].includes(type) ? `/api/admin/membership/rules?type=${type}&id=${id}` : null)
  if (!id || !data) return null
  return <section className="ia" aria-label="قانون VIP"><div className="ia-head"><b>قانون اشتراک ویژه</b></div><RuleForm key={`${type}:${id}`} type={type} id={id} initial={data} /></section>
}
