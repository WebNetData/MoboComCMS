'use client'

import { useState } from 'react'
import Icon from '@/components/site/Icon'
import { startCheckout } from '@/modules/checkout/ui/client'

export type Addons = {
  extraTrafficGb: number
  traffic: { packGb: number; packPrice: number } | null
  upgrades: { productId: number; name: string; tagline: string; cpuCores: number; ramMb: number; diskGb: number; diskType: string; trafficGb: number; newPrice: number; now: number }[]
  cycleLabel: string
  renewFirst: boolean
}

const nf = (value: number) => Math.round(value).toLocaleString('fa-IR')
const ram = (mb: number) => (mb >= 1024 ? `${nf(mb / 1024)} گیگ رم` : `${nf(mb)} مگ رم`)

/** Extra traffic packs and upgrades to a bigger plan, paid through checkout (hourly upgrades change the rate only). */
export default function AddonsPanel({ addons, serviceId, hourly, onChanged }: { addons: Addons; serviceId: number; hourly: boolean; onChanged: () => void }) {
  const [packs, setPacks] = useState(1)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  if (!addons.traffic && !addons.upgrades.length) return null

  async function pay(addon: { kind: 'TRAFFIC' | 'UPGRADE'; packs?: number; productId?: number }, tag: string) {
    setBusy(tag); setError('')
    try {
      const result = await startCheckout({ hostingAddon: { serviceId, ...addon } })
      if (!result.ok) { if (result.code === 'GATEWAY_AMBIGUOUS' && result.invoiceUrl) { window.location.assign(result.invoiceUrl); return } setError(result.code === 'NO_GATEWAY' ? 'موجودی کیف پول کافی نیست و درگاه پرداختی فعال نیست.' : result.message || 'ثبت نشد'); return }
      const destination = result.paid ? `/payment/result?invoice=${encodeURIComponent(result.invoiceNumber)}` : result.paymentUrl || result.invoiceUrl
      if (destination) window.location.assign(destination)
    } catch { setError('ارتباط با سرور برقرار نشد') } finally { setBusy('') }
  }

  async function upgradeHourly(productId: number) {
    setBusy(`u${productId}`); setError('')
    const response = await fetch(`/api/hosting/services/${serviceId}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'upgrade-hourly', productId }) }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy('')
    if (response?.ok) onChanged()
    else setError(String(data?.error || 'ارتقا انجام نشد'))
  }

  return <section className="hs-panel hs-addons" aria-labelledby="hs-addons-title">
    <h2 id="hs-addons-title"><Icon name="sparkles" size={18} />افزودنی‌ها</h2>
    {addons.traffic && <div className="hs-addon">
      <div className="hs-addon-head"><b>ترافیک اضافه</b>{addons.extraTrafficGb > 0 && <span>تا الان {nf(addons.extraTrafficGb)} گیگ اضافه</span>}</div>
      <div className="hs-stepper" role="group" aria-label="تعداد بسته">
        <button type="button" aria-label="کمتر" disabled={packs <= 1} onClick={() => setPacks((n) => Math.max(1, n - 1))}>−</button>
        <output aria-live="polite"><b className="num">{nf(packs * addons.traffic.packGb)}</b> گیگ</output>
        <button type="button" aria-label="بیشتر" disabled={packs >= 20} onClick={() => setPacks((n) => Math.min(20, n + 1))}>+</button>
      </div>
      <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => void pay({ kind: 'TRAFFIC', packs }, 'traffic')}>{busy === 'traffic' ? 'در حال ثبت…' : `خرید · ${nf(packs * addons.traffic.packPrice)} تومان`}</button>
    </div>}
    {addons.upgrades.length > 0 && <div className="hs-addon">
      <div className="hs-addon-head"><b>ارتقا به پلن بالاتر</b>{!hourly && <span>فقط مابه‌التفاوت روزهای باقی‌ماندهٔ این دوره</span>}</div>
      {addons.renewFirst && !hourly ? <p className="hs-addon-note">پیش از ارتقا، سرویس را تمدید کنید.</p>
        : <ul className="hs-upgrades">{addons.upgrades.map((row) => <li key={row.productId}>
          <div><b>{row.name}</b><span>{[row.cpuCores && `${nf(row.cpuCores)} هسته`, row.ramMb && ram(row.ramMb), row.diskGb && `${nf(row.diskGb)} گیگ ${row.diskType}`].filter(Boolean).join(' · ')}</span><small>{hourly ? `نرخ تازه ${nf(row.newPrice)} تومان در ساعت، از ساعت بعد` : `از دورهٔ بعد ${nf(row.newPrice)} تومان / ${addons.cycleLabel}`}</small></div>
          {hourly
            ? <button type="button" className="btn btn-ghost" disabled={!!busy} onClick={() => void upgradeHourly(row.productId)}>{busy === `u${row.productId}` ? '…' : 'ارتقا'}</button>
            : <button type="button" className="btn btn-ghost" disabled={!!busy} onClick={() => void pay({ kind: 'UPGRADE', productId: row.productId }, `u${row.productId}`)}>{busy === `u${row.productId}` ? '…' : `ارتقا · ${nf(row.now)} تومان`}</button>}
        </li>)}</ul>}
    </div>}
    {error && <p className="hs-error" role="alert">{error}</p>}
  </section>
}
