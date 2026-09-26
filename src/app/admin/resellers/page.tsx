'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useI18n } from '@/i18n/LocaleProvider'
import { formatCurrency } from '@/shared/money/client'

interface Plan {
  id: number
  name: string
  price: number
  currency: string
  trafficGB: number
  days: number
}

interface ResellerRow {
  id: number
  userId: number
  active: boolean
  priceMode: string
  discountPercent: number
  maxAccounts: number
  maxActiveAccounts: number
  trafficQuotaGB: number
  maxTrafficPerAccountGB: number
  allowUnlimitedTraffic: boolean
  maxDaysPerAccount: number
  allowUnlimitedDays: boolean
  maxDevicesPerAccount: number
  note: string
  user: { id: number; email: string; name: string; walletBalance: number; walletBalances: { currency: string; balance: number }[]; status: string } | null
  prices: { planId: number; price: number; planName: string; currency: string }[]
  usage?: { accounts: number; activeAccounts: number; trafficGrantedGB: number; accountsUsedPercent: number; activeUsedPercent: number; trafficUsedPercent: number; trafficQuotaLeftGB: number }
  bot?: { username: string; active: boolean; lastError: string } | null
  botSales?: number
  botReview?: number
}

const EMPTY = {
  email: '',
  name: '',
  active: true,
  priceMode: 'DISCOUNT',
  discountPercent: 0,
  maxAccounts: 0,
  maxActiveAccounts: 0,
  trafficQuotaGB: 0,
  maxTrafficPerAccountGB: 0,
  allowUnlimitedTraffic: false,
  maxDaysPerAccount: 0,
  allowUnlimitedDays: false,
  maxDevicesPerAccount: 0,
  note: '',
  prices: {} as Record<number, string>,
}

export default function AdminResellersPage() {
  const { t, locale } = useI18n()
  const isFa = locale === 'fa'
  const [rows, setRows] = useState<ResellerRow[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [summary, setSummary] = useState({ count: 0, active: 0, accounts: 0, trafficGrantedGB: 0 })
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ ...EMPTY })
  const [editing, setEditing] = useState<ResellerRow | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [msg, setMsg] = useState('')
  const [msgOk, setMsgOk] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/resellers')
    if (res.ok) {
      const d = await res.json()
      setRows(d.resellers || [])
      setPlans(d.plans || [])
      setSummary(d.summary || { count: 0, active: 0, accounts: 0, trafficGrantedGB: 0 })
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const money = (n: number, currency: string) => formatCurrency(n, currency, isFa ? 'fa-IR' : 'en-US')
  const num = (n: number) => new Intl.NumberFormat('en-US').format(Math.round(n || 0))

  function startCreate() {
    setEditing(null)
    setForm({ ...EMPTY, prices: {} })
    setShowForm(true)
    setMsg('')
  }

  function startEdit(r: ResellerRow) {
    const prices: Record<number, string> = {}
    for (const p of r.prices) prices[p.planId] = String(p.price)
    setEditing(r)
    setForm({
      email: r.user?.email || '',
      name: r.user?.name || '',
      active: r.active,
      priceMode: r.priceMode,
      discountPercent: r.discountPercent,
      maxAccounts: r.maxAccounts,
      maxActiveAccounts: r.maxActiveAccounts,
      trafficQuotaGB: r.trafficQuotaGB,
      maxTrafficPerAccountGB: r.maxTrafficPerAccountGB,
      allowUnlimitedTraffic: r.allowUnlimitedTraffic,
      maxDaysPerAccount: r.maxDaysPerAccount,
      allowUnlimitedDays: r.allowUnlimitedDays,
      maxDevicesPerAccount: r.maxDevicesPerAccount,
      note: r.note,
      prices,
    })
    setShowForm(true)
    setMsg('')
  }

  async function save() {
    setBusy(true)
    setMsg('')
    const prices = Object.entries(form.prices)
      .filter(([, v]) => v !== '')
      .map(([planId, price]) => ({ planId: Number(planId), price: Number(price) }))
    const payload: any = { ...form, prices }
    delete payload.prices0
    const res = await fetch('/api/admin/resellers', {
      method: editing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editing ? { id: editing.id, ...payload } : payload),
    })
    const d = await res.json().catch(() => null)
    setBusy(false)
    if (!res.ok) {
      setMsg(d?.error || t.errGeneric)
      setMsgOk(false)
      return
    }
    setMsgOk(true)
    setMsg(
      d?.generatedPassword
        ? `${t.save}: ${t.resellerCreated}` + ` — ${t.password}: ${d.generatedPassword}`
        : t.saved
    )
    setShowForm(false)
    load()
  }

  async function toggleActive(r: ResellerRow) {
    await fetch('/api/admin/resellers', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: r.id, active: !r.active }),
    })
    load()
  }

  async function remove(r: ResellerRow) {
    if (!confirm(`${t.deleteConfirm} — ${r.user?.email}`)) return
    const res = await fetch(`/api/admin/resellers?id=${r.id}`, { method: 'DELETE' })
    const d = await res.json().catch(() => null)
    setMsgOk(res.ok)
    setMsg(res.ok ? (d?.deactivated ? t.resellerDeactivated : t.deleted) : d?.error || t.errGeneric)
    load()
  }

  const numberField = (key: keyof typeof EMPTY, label: string, hint: string) => (
    <div>
      <label className="label">{label}</label>
      <input
        className="input num"
        type="number"
        min={0}
        dir="ltr"
        value={String(form[key] as number)}
        onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) })}
      />
      <p className="muted text-xs mt-1">{hint}</p>
    </div>
  )

  return (
    <div>
      <div className="appbar">
        <div>
          <h1 className="h2">🤝 {t.resellers}</h1>
          <p className="muted">{t.resellersSub}</p>
        </div>
        <button className="btn btn-primary" onClick={startCreate}>＋ {t.newReseller}</button>
      </div>

      <div className="grid-4 mb-8">
        {[
          [t.resellers, num(summary.count), '🤝'],
          [t.active, num(summary.active), '✅'],
          [t.accounts, num(summary.accounts), '🔗'],
          [t.trafficGranted, `${num(summary.trafficGrantedGB)} GB`, '📶'],
        ].map(([label, value, icon]) => (
          <div key={label} className="card kpi">
            <div className="kpi-icon">{icon}</div>
            <div className="min-w-0">
              <div className="muted text-xs">{label}</div>
              <div className="num text-2xl font-extrabold truncate">{value}</div>
            </div>
          </div>
        ))}
      </div>

      {msg && <p className={msgOk ? 'success-text mb-4' : 'error-text mb-4'}>{msg}</p>}

      {showForm && (
        <div className="card mb-6">
          <h2 className="h3 mb-4">{editing ? `${t.editReseller} — ${editing.user?.email}` : t.newReseller}</h2>

          <div className="grid-2">
            {!editing && (
              <>
                <div>
                  <label className="label">{t.email}</label>
                  <input className="input" dir="ltr" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="agency@example.com" />
                  <p className="muted text-xs mt-1">{t.resellerEmailHint}</p>
                </div>
                <div>
                  <label className="label">{t.name}</label>
                  <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
              </>
            )}
            {editing && (
              <div>
                <label className="label">{t.status}</label>
                <select className="select" value={form.active ? '1' : '0'} onChange={(e) => setForm({ ...form, active: e.target.value === '1' })}>
                  <option value="1">{t.active}</option>
                  <option value="0">{t.resellerInactive}</option>
                </select>
              </div>
            )}
          </div>

          <h3 className="h4 mt-6 mb-2">{t.resellerPricing}</h3>
          <div className="grid-2">
            <div>
              <label className="label">{t.resellerPriceMode}</label>
              <select className="select" value={form.priceMode} onChange={(e) => setForm({ ...form, priceMode: e.target.value })}>
                <option value="DISCOUNT">{t.resellerPriceDiscount}</option>
                <option value="CUSTOM">{t.resellerPriceCustom}</option>
              </select>
            </div>
            <div>
              <label className="label">{t.resellerDiscount} %</label>
              <input className="input num" type="number" min={0} max={100} dir="ltr" value={form.discountPercent} onChange={(e) => setForm({ ...form, discountPercent: Number(e.target.value) })} />
            </div>
          </div>

          <div className="overflow-x-auto mt-4">
            <table className="data">
              <thead>
                <tr>
                  <th>{t.plan}</th>
                  <th>{t.listPrice}</th>
                  <th>{t.resellerPrice}</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td className="num">{money(p.price, p.currency)}</td>
                    <td>
                      <input
                        className="input num"
                        dir="ltr"
                        placeholder={form.priceMode === 'DISCOUNT' ? money(p.price * (1 - form.discountPercent / 100), p.currency) : `${p.price} ${p.currency}`}
                        value={form.prices[p.id] ?? ''}
                        onChange={(e) => setForm({ ...form, prices: { ...form.prices, [p.id]: e.target.value } })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted text-xs mt-2">{t.resellerPriceHint}</p>

          <h3 className="h4 mt-6 mb-2">{t.resellerLimits}</h3>
          <div className="grid-3">
            {numberField('maxAccounts', t.limitMaxAccounts, t.limitZeroHint)}
            {numberField('maxActiveAccounts', t.limitMaxActive, t.limitZeroHint)}
            {numberField('trafficQuotaGB', t.limitTrafficQuota, t.limitZeroHint)}
            {numberField('maxTrafficPerAccountGB', t.limitTrafficPerAccount, t.limitPerAccountHint)}
            {numberField('maxDaysPerAccount', t.limitMaxDays, t.limitDaysHint)}
            {numberField('maxDevicesPerAccount', t.limitMaxDevices, t.limitZeroHint)}
          </div>

          <div className="flex gap-6 flex-wrap mt-4">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.allowUnlimitedTraffic} onChange={(e) => setForm({ ...form, allowUnlimitedTraffic: e.target.checked })} />
              {t.allowUnlimitedTraffic}
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.allowUnlimitedDays} onChange={(e) => setForm({ ...form, allowUnlimitedDays: e.target.checked })} />
              {t.allowUnlimitedDays}
            </label>
          </div>

          <div className="mt-4">
            <label className="label">{t.note}</label>
            <input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>

          <div className="flex gap-2 mt-5">
            <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? t.loading : t.save}</button>
            <button className="btn btn-ghost" onClick={() => setShowForm(false)}>{t.cancel}</button>
          </div>
        </div>
      )}

      <div className="card">
        {loading && <p className="muted">{t.loading}</p>}
        {!loading && rows.length === 0 && <p className="muted">{t.noResellers}</p>}

        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th>{t.reseller}</th>
                  <th>{t.accounts}</th>
                  <th>{t.activeAccounts}</th>
                  <th>{t.trafficGranted}</th>
                  <th>{t.resellerDiscount}</th>
                  <th>{t.walletBalance}</th>
                  <th>{isFa ? 'ربات فروش' : 'Sales bot'}</th>
                  <th>{t.status}</th>
                  <th>{t.actions}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div className="font-semibold" dir="ltr">{r.user?.email || '—'}</div>
                      <div className="muted text-xs">
                        {r.user?.name}
                        {r.maxAccounts > 0 ? ` · ${t.limitMaxAccounts}: ${r.maxAccounts}` : ` · ${t.unlimited}`}
                      </div>
                    </td>
                    <td className="num">
                      {r.usage?.accounts ?? 0}
                      {r.maxAccounts > 0 ? ` / ${r.maxAccounts}` : ''}
                      <div className="quota-bar"><span style={{ width: `${r.usage?.accountsUsedPercent || 0}%` }} /></div>
                    </td>
                    <td className="num">
                      {r.usage?.activeAccounts ?? 0}
                      {r.maxActiveAccounts > 0 ? ` / ${r.maxActiveAccounts}` : ''}
                    </td>
                    <td className="num">
                      {num(r.usage?.trafficGrantedGB || 0)} GB
                      {r.trafficQuotaGB > 0 ? ` / ${num(r.trafficQuotaGB)}` : ''}
                      <div className="quota-bar"><span style={{ width: `${r.usage?.trafficUsedPercent || 0}%` }} /></div>
                    </td>
                    <td className="num">
                      {r.priceMode === 'CUSTOM' ? t.resellerPriceCustom : `${r.discountPercent}%`}
                      {r.prices.length > 0 && <div className="muted text-xs">{r.prices.length} {t.plansCustomPriced}</div>}
                    </td>
                    <td className="num">{r.user?.walletBalances?.length ? r.user.walletBalances.map((b) => money(b.balance, b.currency)).join(' · ') : '—'}</td>
                    <td>{r.bot ? <><span className={`badge ${r.bot.active ? 'badge-green' : 'badge-gray'}`}>@{r.bot.username}</span><div className="muted text-xs mt-1">{r.botSales || 0} {isFa ? 'سفارش' : 'orders'} · {r.botReview || 0} {isFa ? 'در انتظار بررسی' : 'to review'}</div>{r.bot.lastError && <div className="text-red-400 text-xs mt-1">{r.bot.lastError}</div>}</> : <span className="muted">—</span>}</td>
                    <td>{r.active ? <span className="badge badge-green">{t.active}</span> : <span className="badge badge-gray">{t.resellerInactive}</span>}</td>
                    <td>
                      <div className="flex gap-2 flex-wrap">
                        <button className="btn btn-ghost btn-sm" onClick={() => startEdit(r)}>{t.edit}</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(r)}>{r.active ? t.disable : t.enable}</button>
                        <Link className="btn btn-ghost btn-sm" href={`/admin/users/${r.userId}`}>{t.customerCard}</Link>
                        <button className="btn btn-ghost btn-sm" onClick={() => remove(r)}>🗑</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isFa && <p className="muted text-xs mt-4">{t.resellerVolumeHint}</p>}
    </div>
  )
}
