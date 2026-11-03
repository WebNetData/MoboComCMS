'use client'

import { useRef, useState } from 'react'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import { send, useJson } from '@/app/admin/store/shared'
import PricingRulesEditor, { type PricingFormRule } from './PricingRulesEditor'

type Item = { price: string; memberPrice: string; currency: string; vipAccess: string; active: boolean; pricingRules: PricingFormRule[]; revision: string }
type Data = { enabled: boolean; item: Item | null; revision: string; userGroups: { id: number; name: string; active: boolean }[] }
type Props = { ownerType: string; ownerId: number | null; noun?: string }
type Notice = { ok: boolean; text: string }

function PriceForm({ initial, ownerType, ownerId, noun, reload, notice, setNotice }: Props & { initial: Data; reload: () => void | Promise<void>; notice: Notice | null; setNotice: (value: Notice | null) => void }) {
  const [form, setForm] = useState({ price: initial.item?.price || '', currency: initial.item?.currency || 'IRT', active: initial.item?.active ?? true })
  const [on, setOn] = useState(!!initial.item), [busy, setBusy] = useState(false)
  const revision = useRef(initial.revision)
  const [rules, setRules] = useState<PricingFormRule[]>(() => {
    const rows = [...initial.item?.pricingRules || []]
    if (!rows.some(row => row.audience === 'vip') && initial.item?.vipAccess === 'FREE') rows.unshift({ audience: 'vip', mode: 'FREE', value: '0' })
    if (!rows.some(row => row.audience === 'vip') && initial.item?.vipAccess === 'DISCOUNT') rows.unshift({ audience: 'vip', mode: 'PRICE', value: initial.item.memberPrice })
    return rows
  })
  async function save() {
    if (busy) return
    if (!on && initial.item && !window.confirm('فروش این محتوا برداشته شود؟ محتوا به دسترسی عادی برمی‌گردد و خریدهای قبلی حفظ می‌شوند.')) return
    if (!on && !initial.item) return
    setBusy(true); setNotice(null)
    const result = on ? await send<{ item?: Item }>('/api/admin/paywall', 'PUT', { ownerType, ownerId, ...form, vipAccess: 'NONE', memberPrice: '', pricingRules: rules, revision: revision.current }) : await send<{ item?: Item }>(`/api/admin/paywall?${new URLSearchParams({ ownerType, ownerId: String(ownerId), revision: revision.current })}`, 'DELETE')
    setBusy(false)
    if (!result.ok) { setNotice({ ok: false, text: result.error }); return }
    if (result.data.item) revision.current = result.data.item.revision
    setNotice({ ok: true, text: on ? 'قیمت و قوانین اختصاصی ذخیره شدند' : 'فروش برداشته شد' }); await reload()
  }
  const change = (patch: Partial<typeof form>) => setForm(current => ({ ...current, ...patch }))
  return <section className="pw-admin pw-admin-premium" aria-label={`فروش ${noun}`} dir="rtl">
    <header className="pw-admin-head"><div><span className="pw-eyebrow"><Icon name="wallet" size={15} />فروش محتوا</span><h2>قیمت‌گذاری {noun}</h2></div><label className="pw-enable"><input type="checkbox" checked={on} onChange={event => setOn(event.target.checked)} disabled={busy} />فروشی باشد</label></header>
    {!initial.enabled && <p className="pw-config-note">تنظیم قیمت امکان‌پذیر است؛ برای شروع فروش، ماژول «فروش محتوا» را در <Link href="/admin/extensions">افزونه‌ها</Link> فعال کنید.</p>}
    {on && <fieldset disabled={busy} className="pw-fieldset"><legend className="sr-only">قیمت و قوانین فروش</legend><div className="pw-admin-grid">
      <label><span>قیمت عادی</span><input className="input" inputMode="decimal" dir="ltr" value={form.price} onChange={event => change({ price: event.target.value })} maxLength={18} placeholder="250000" /></label>
      <label><span>واحد پول</span><select className="select" value={form.currency} onChange={event => change({ currency: event.target.value })}><option value="IRT">تومان</option><option value="IRR">ریال</option><option value="USD">دلار</option></select></label>
      <label className="pw-enable"><input type="checkbox" checked={form.active} onChange={event => change({ active: event.target.checked })} />قانون فروش فعال باشد</label>
    </div><PricingRulesEditor rules={rules} onChange={setRules} groups={initial.userGroups} price={form.price} currency={form.currency} /><p className="pw-config-note">خرید، دسترسی دائمی می‌دهد. دسترسی رایگان VIP و گروهی تا پایان اعتبار عضویت برقرار است. انتشار و مخاطبان محتوا همچنان از تنظیمات همان بخش پیروی می‌کنند.</p></fieldset>}
    <div className="pw-admin-actions"><button type="button" className="btn btn-primary" disabled={busy || !on && !initial.item} onClick={() => void save()}>{busy ? 'در حال ذخیره…' : 'ذخیرهٔ تنظیمات فروش'}</button><button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void reload()}>بارگذاری دوباره</button>{notice && <p role={notice.ok ? 'status' : 'alert'} className={notice.ok ? 'pw-config-note' : 'pw-error'}>{notice.text}</p>}</div>
  </section>
}

export default function PaidItemEditor({ ownerType, ownerId, noun = 'این مورد' }: Props) {
  const [notice, setNotice] = useState<(Notice & { owner: string }) | null>(null)
  const owner = `${ownerType}:${ownerId}`
  const { data, error, reload } = useJson<Data>(ownerId ? `/api/admin/paywall?${new URLSearchParams({ ownerType, ownerId: String(ownerId) })}` : null)
  if (!ownerId) return <section className="pw-admin"><h2>فروش {noun}</h2><p className="muted">پس از ذخیرهٔ اولیه، قیمت و مخاطبان فروش را تعیین کنید.</p></section>
  if (error) return <section className="pw-admin"><p role="alert">{error}</p><button type="button" className="btn btn-ghost" onClick={() => void reload()}>تلاش دوباره</button></section>
  if (!data) return <section className="pw-admin" role="status">در حال دریافت تنظیمات فروش…</section>
  return <PriceForm key={`${owner}:${data.revision}`} {...{ ownerType, ownerId, noun }} initial={data} reload={reload} notice={notice?.owner === owner ? notice : null} setNotice={value => setNotice(value ? { ...value, owner } : null)} />
}
