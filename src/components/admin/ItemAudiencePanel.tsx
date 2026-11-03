'use client'

import { useRef, useState } from 'react'
import { send, useJson } from '@/app/admin/store/shared'
import GroupPicker from '@/components/admin/GroupPicker'
import type { SiteGroup } from '@/modules/account/domain/site-groups'
import { currencyLabel } from '@/shared/money/format'
import VipRulePanel from '@/components/admin/VipRulePanel'
import PricingRulesEditor, { type PricingFormRule } from '@/components/admin/pricing/PricingRulesEditor'

type Data = { groups: string[]; limited: boolean; revision: string; currency: string; catalog: SiteGroup[]; userGroups: { id: number; name: string }[]; prices: Record<string, string>; pricingRules: PricingFormRule[]; basePrice: string; fileDelivery: boolean }

function AudienceForm({ type, id, noun, initial }: { type: string; id: number; noun: string; initial: Data }) {
  const [limited, setLimited] = useState(initial.limited)
  const revision = useRef(initial.revision)
  const [groups, setGroups] = useState(initial.groups)
  const [pricingRules, setPricingRules] = useState(initial.pricingRules || [])
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ ok: boolean; text: string } | null>(null)

  async function save() {
    if (limited && !groups.length) { setDone({ ok: false, text: 'دست‌کم یک گروه انتخاب کنید' }); return }
    setBusy(true); setDone(null)
    const result = await send<{ revision: string; indexPending: boolean }>('/api/admin/item-audience', 'POST', { type, id, revision: revision.current, groups: limited ? groups : [], ...(type === 'product' ? { pricingRules } : {}) })
    setBusy(false)
    if (result.ok && result.data?.revision) revision.current = result.data.revision
    setDone(result.ok ? { ok: true, text: result.data.indexPending ? 'ذخیره شد؛ فهرست جست‌وجو نیاز به بازسازی دارد' : 'ذخیره شد' } : { ok: false, text: result.error })
  }

  return <>
    <div className="ia-modes" role="radiogroup" aria-label={`چه کسانی ${noun} را ببینند`}>
      <label><input type="radio" name={`audience-${type}-${id}`} checked={!limited} onChange={() => setLimited(false)} />همه</label>
      <label><input type="radio" name={`audience-${type}-${id}`} checked={limited} onChange={() => setLimited(true)} />فقط گروه‌های انتخاب‌شده</label>
    </div>
    {limited && <>
      <GroupPicker legend="گروه‌هایی که این مورد را می‌بینند" groups={initial.catalog} value={groups} onChange={setGroups} />
      <p className="ia-hint">برای دیگران این مورد وجود ندارد: در فهرست‌ها، جست‌وجو، نقشهٔ سایت و پیشنهادها نمی‌آید و نشانی‌اش هم پیدا نمی‌شود.</p>
    </>}
    {type === 'product' && <fieldset disabled={busy} className="pw-fieldset"><legend className="sr-only">قیمت اختصاصی محصول</legend><PricingRulesEditor rules={pricingRules} onChange={setPricingRules} groups={initial.userGroups} price={initial.basePrice} currency={initial.currency} allowFree={initial.fileDelivery} /><p className="ia-hint">قیمت‌ها به {currencyLabel(initial.currency)} و بر مبنای قیمت پایهٔ ذخیره‌شده هستند. تغییر قیمت پایه را ابتدا در فرم اصلی ذخیره کنید. دسترسی رایگان مخصوص محصول با حالت «تحویل فایل» است.</p></fieldset>}
    <div className="ia-actions">
      <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'در حال ذخیره…' : type === 'product' ? 'ذخیرهٔ مخاطبان و قیمت‌ها' : 'ذخیرهٔ مخاطبان'}</button>
      {done && <span role="status" className={done.ok ? 'ia-done' : 'ia-done is-error'}>{done.text}</span>}
    </div>
  </>
}

/** "Who sees this" panel of the section editors. Saved on its own, so it works on any existing item without touching the editor's form. */
export default function ItemAudiencePanel(props: { type: string; id: number | null; noun?: string }) {
  return <><ItemAudienceContent key={`${props.type}:${props.id}`} {...props} /><VipRulePanel key={`rule:${props.type}:${props.id}`} type={props.type} id={props.id} /></>
}

function ItemAudienceContent({ type, id, noun = 'این مورد' }: { type: string; id: number | null; noun?: string }) {
  const { data, error, reload } = useJson<Data>(id ? `/api/admin/item-audience?type=${type}&id=${id}` : null)
  return <section className="ia" aria-label="مخاطبان">
    <div className="ia-head"><b>چه کسانی {noun} را ببینند</b>{type === 'product' && <small>مخاطبان محصول و قیمت آن برای هر گروه</small>}</div>
    {!id ? <p className="ia-hint">پس از ذخیرهٔ اولیه می‌توانید مخاطبان را انتخاب کنید.</p>
      : error ? <p className="ia-done is-error" role="alert">{error} <button type="button" className="btn btn-ghost" onClick={() => void reload()}>تلاش دوباره</button></p>
        : data ? <AudienceForm type={type} id={id} noun={noun} initial={data} /> : <p className="ia-hint">در حال خواندن…</p>}
  </section>
}
