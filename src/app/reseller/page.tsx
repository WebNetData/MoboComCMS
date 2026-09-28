'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import { useI18n } from '@/i18n/LocaleProvider'
import { money } from '@/modules/checkout/ui/client'
import StatusBadge from '@/components/StatusBadge'
import { newIdempotencyKey } from '@/shared/security/idempotency'

interface Plan {
  id: number
  name: string
  price: number
  currency: string
  listPrice: number
  trafficGB: number
  days: number
  deviceLimit: number
  panel: { name: string; type: string } | null
}

interface Overview {
  owner: boolean
  reseller: {
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
    walletBalance: number
    walletBalances: { currency: string; balance: number }[]
  }
  usage: {
    accounts: number
    activeAccounts: number
    trafficGrantedGB: number
    trafficQuotaLeftGB: number
    accountsUsedPercent: number
    activeUsedPercent: number
    trafficUsedPercent: number
  }
  plans: Plan[]
  recent: { id: number; username: string; planName: string; customer: string; status: string; expiresAt: string; subUrl: string }[]
}

export default function ResellerOverviewPage() {
  const { t, locale } = useI18n()
  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [msgOk, setMsgOk] = useState(false)
  const [result, setResult] = useState<{ username?: string; subUrl?: string; password?: string; customer?: { email: string }; price?: number; currency?: string } | null>(null)

  const [form, setForm] = useState({ email: '', planId: '', username: '', trafficGB: '', days: '', deviceLimit: '' })
  const moneyFor = (value: number, currency = 'USD') => money(value, currency, locale === 'fa' ? 'fa-IR' : 'en-US')
  const commandKey = () => {
    const storage = `happ.reseller.create.${form.email}.${form.planId}`
    try { const old = sessionStorage.getItem(storage); if (old) return { key: old, storage }; const key = newIdempotencyKey('reseller'); sessionStorage.setItem(storage, key); return { key, storage } }
    catch { return { key: newIdempotencyKey('reseller'), storage } }
  }

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/reseller')
    if (res.ok) {
      const d = await res.json()
      setData(d)
      setForm((f) => ({ ...f, planId: f.planId || String(d.plans?.[0]?.id ?? '') }))
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function create() {
    setBusy(true)
    setMsg('')
    setResult(null)
    const token = commandKey()
    let res: Response
    try { res = await fetch('/api/reseller/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': token.key },
      body: JSON.stringify({
        email: form.email,
        planId: Number(form.planId),
        username: form.username || undefined,
        trafficGB: form.trafficGB === '' ? undefined : Number(form.trafficGB),
        days: form.days === '' ? undefined : Number(form.days),
        deviceLimit: form.deviceLimit === '' ? undefined : Number(form.deviceLimit),
      }),
    }) } catch { setBusy(false); setMsgOk(false); setMsg(t.errGeneric); return }
    const d = await res.json().catch(() => null)
    try { sessionStorage.removeItem(token.storage) } catch {}
    setBusy(false)
    if (!res.ok) {
      setMsgOk(false)
      setMsg(
        d?.code === 'INSUFFICIENT_FUNDS'
          ? `${t.topUpToCreate} (${moneyFor(d?.needed || 0, d?.currency || selected?.currency || 'USD')})`
          : d?.code === 'ACCOUNT_LIMIT' || d?.code === 'ACTIVE_LIMIT' || d?.code === 'TRAFFIC_QUOTA' || d?.code === 'TRAFFIC_PER_ACCOUNT' || d?.code === 'DAYS_LIMIT'
            ? `${t.errGeneric}: ${d?.error || ''}`
            : d?.error || t.errGeneric
      )
      return
    }
    setMsgOk(true)
    setMsg(t.accountCreated)
    setResult({ username: d?.username, subUrl: d?.subUrl, password: d?.customer?.password, customer: d?.customer, price: d?.price, currency: d?.currency })
    setForm({ email: '', planId: form.planId, username: '', trafficGB: '', days: '', deviceLimit: '' })
    load()
  }

  const selected = data?.plans.find((p) => String(p.id) === form.planId)

  if (loading || !data) return <p className="muted">{t.loading}</p>

  const { reseller, usage, plans, recent } = data
  const quotaRow = (label: string, value: string, percent: number, hint?: string) => (
    <div className="quota-row">
      <div className="flex items-center justify-between gap-3">
        <span className="muted text-sm">{label}</span>
        <span className="num font-semibold">{value}</span>
      </div>
      {hint && <div className="muted text-xs">{hint}</div>}
      <div className="quota-bar mt-2"><span style={{ width: `${percent}%` }} /></div>
    </div>
  )

  return (
    <div>
      <div className="appbar">
        <div>
          <h1 className="h2">🤝 {t.resellerPanel}</h1>
          <p className="muted">{t.resellerPanelSub}</p>
        </div>
        <Link href="/reseller/accounts" className="btn btn-ghost">{t.myAccounts}</Link>
      </div>

      <div className="grid-4 mb-8">
        {[
          [t.accountsUsed, reseller.maxAccounts > 0 ? `${usage.accounts} / ${reseller.maxAccounts}` : String(usage.accounts), '🔗'],
          [t.activeAccounts, reseller.maxActiveAccounts > 0 ? `${usage.activeAccounts} / ${reseller.maxActiveAccounts}` : String(usage.activeAccounts), '✅'],
          [t.trafficGranted, `${Math.round(usage.trafficGrantedGB)} GB`, '📶'],
          ...(data.owner ? [[t.walletBalance, reseller.walletBalances?.length ? reseller.walletBalances.map((b) => moneyFor(b.balance, b.currency)).join(' · ') : moneyFor(reseller.walletBalance), '💳']] : []),
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

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.2fr)', gap: '1rem' }}>
        <div className="card self-start">
          <h2 className="h3 mb-3">{t.quotaLeft}</h2>
          <div className="flex flex-col gap-4">
            {quotaRow(
              t.accountsUsed,
              reseller.maxAccounts > 0 ? `${usage.accounts} / ${reseller.maxAccounts}` : `${usage.accounts} · ${t.unlimited}`,
              usage.accountsUsedPercent
            )}
            {quotaRow(
              t.trafficGranted,
              reseller.trafficQuotaGB > 0 ? `${Math.round(usage.trafficGrantedGB)} / ${reseller.trafficQuotaGB} GB` : `${Math.round(usage.trafficGrantedGB)} GB · ${t.unlimited}`,
              usage.trafficUsedPercent,
              reseller.trafficQuotaGB > 0 ? `${t.trafficQuotaLeft}: ${Math.round(usage.trafficQuotaLeftGB)} GB` : undefined
            )}
          </div>

          <div className="mt-5 flex flex-col gap-2">
            <div className="flex items-center justify-between text-sm">
              <span className="muted">{t.limitTrafficPerAccount}</span>
              <span className="num">{reseller.maxTrafficPerAccountGB > 0 ? `${reseller.maxTrafficPerAccountGB} GB` : t.unlimited}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="muted">{t.limitMaxDays}</span>
              <span className="num">{reseller.maxDaysPerAccount > 0 ? `${reseller.maxDaysPerAccount} ${t.days}` : t.unlimited}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="muted">{t.limitMaxDevices}</span>
              <span className="num">{reseller.maxDevicesPerAccount > 0 ? reseller.maxDevicesPerAccount : t.unlimited}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="muted">{t.allowUnlimitedTraffic}</span>
              <span>{reseller.allowUnlimitedTraffic ? '✓' : '—'}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="muted">{t.resellerDiscount}</span>
              <span className="num">{reseller.priceMode === 'CUSTOM' ? t.resellerPriceCustom : `${reseller.discountPercent}%`}</span>
            </div>
          </div>
        </div>

        <div className="card">
          <h2 className="h3 mb-1">{t.createAccount}</h2>
          <p className="muted text-sm mb-4">{t.resellerPanelSub}</p>

          <div className="grid-2">
            <div>
              <label className="label">{t.customerEmail}</label>
              <input className="input" dir="ltr" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="client@example.com" />
            </div>
            <div>
              <label className="label">{t.plan}</label>
              <select className="select" value={form.planId} onChange={(e) => setForm({ ...form, planId: e.target.value })}>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {moneyFor(p.price, p.currency)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {selected && (
            <p className="muted text-xs mt-2 num">
              {selected.trafficGB > 0 ? `${selected.trafficGB} GB` : t.unlimited} · {selected.days} {t.days} · {selected.deviceLimit} {t.devices} · {t.price}: {moneyFor(selected.price * (selected.trafficGB > 0 && form.trafficGB !== '' ? Number(form.trafficGB) / selected.trafficGB : 1), selected.currency)}
            </p>
          )}

          <div className="mt-4">
            <label className="label">{t.usernameTitle}</label>
            <input className="input num" dir="ltr" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })} placeholder="client_config" />
          </div>

          <h3 className="h4 mt-5 mb-2">{t.customSpec}</h3>
          <div className="grid-3">
            <div>
              <label className="label">{t.trafficGB}</label><p className="muted text-xs">حجم دلخواه در محدوده قرارداد؛ هزینه متناسب با حجم و تعرفه پلن محاسبه می‌شود.</p>
              <input className="input num" type="number" min={0} step="0.1" dir="ltr" value={form.trafficGB} onChange={(e) => setForm({ ...form, trafficGB: e.target.value })} placeholder={selected ? String(selected.trafficGB) : ''} />
            </div>
            <div>
              <label className="label">{t.days}</label>
              <input className="input num" type="number" min={0} dir="ltr" value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} placeholder={selected ? String(selected.days) : ''} />
            </div>
            <div>
              <label className="label">{t.devices}</label>
              <input className="input num" type="number" min={0} dir="ltr" value={form.deviceLimit} onChange={(e) => setForm({ ...form, deviceLimit: e.target.value })} placeholder={selected ? String(selected.deviceLimit) : ''} />
            </div>
          </div>
          <p className="muted text-xs mt-1">{t.specPlaceholderHint}</p>

          {msg && <p className={msgOk ? 'success-text mt-3' : 'error-text mt-3'}>{msg}</p>}

          {result && (
            <div className="card mt-4" style={{ background: 'var(--bg-soft)' }}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <strong>{t.accountCreated}</strong>
                {result.price != null && <span className="num badge badge-green">{moneyFor(result.price, result.currency || selected?.currency || 'USD')}</span>}
              </div>
              <div className="result-rows">
                <div className="result-row"><span className="muted">{t.customerEmail}</span><span className="num" dir="ltr">{result.customer?.email}</span></div>
                <div className="result-row"><span className="muted">{t.usernameTitle}</span><span className="num" dir="ltr">{result.username}</span></div>
                {result.password && <div className="result-row"><span className="muted">{t.password}</span><span className="num" dir="ltr">{result.password}</span></div>}
                {result.subUrl && (
                  <div className="result-row">
                    <span className="muted">{t.subUrl}</span>
                    <a className="num" dir="ltr" href={result.subUrl} target="_blank" rel="noreferrer">{result.subUrl.slice(0, 42)}…</a>
                  </div>
                )}
              </div>
            </div>
          )}

          <button className="btn btn-primary w-full mt-4" disabled={busy || !form.email} onClick={create}>
            {busy ? t.loading : t.createAccount}
          </button>
          {(reseller.walletBalances?.every((b) => b.balance <= 0) ?? reseller.walletBalance <= 0) && <p className="muted text-xs mt-2">{t.topUpToCreate}</p>}
        </div>
      </div>

      <div className="card mt-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="h3">{t.myAccounts}</h2>
          <Link href="/reseller/accounts" className="btn btn-ghost btn-sm">{t.actions}</Link>
        </div>
        {recent.length === 0 && <p className="muted">{t.noAccounts}</p>}
        {recent.length > 0 && (
          <div className="overflow-x-auto">
            <table className="data">
              <thead>
                <tr><th>{t.usernameTitle}</th><th>{t.customerEmail}</th><th>{t.plan}</th><th>{t.status}</th><th>{t.expires}</th></tr>
              </thead>
              <tbody>
                {recent.map((s) => (
                  <tr key={s.id}>
                    <td className="num" dir="ltr">{s.username}</td>
                    <td dir="ltr">{s.customer}</td>
                    <td>{s.planName}</td>
                    <td><StatusBadge value={s.status} /></td>
                    <td className="num">{new Date(s.expiresAt).toLocaleDateString('en-US')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
