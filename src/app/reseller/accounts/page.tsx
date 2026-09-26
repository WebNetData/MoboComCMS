'use client'

import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '@/i18n/LocaleProvider'
import StatusBadge from '@/components/StatusBadge'

interface Account {
  id: number
  username: string
  status: string
  customer: { id: number; email: string; name: string; status: string }
  planName: string
  trafficLimitGB: number
  trafficUsedGB: number
  deviceLimit: number
  expiresAt: string
  subUrl: string
  createdAt: string
}

interface ResellerInfo {
  walletBalance: number
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
}

interface ResellerUsage {
  accounts: number
  activeAccounts: number
  trafficGrantedGB: number
  trafficQuotaLeftGB: number
  accountsUsedPercent: number
  activeUsedPercent: number
  trafficUsedPercent: number
}

interface AgencyPlan {
  id: number
  name: string
  listPrice: number
  price: number
  trafficGB: number
  days: number
  deviceLimit: number
}

interface CreatedAccount {
  username?: string
  subUrl?: string
  expiresAt?: string
  price?: number
  customer?: { email: string; password?: string }
}

const STATUSES = ['', 'ACTIVE', 'DISABLED', 'EXPIRED']
const count = (n: number) => (n > 0 ? String(n) : '∞')

export default function ResellerAccountsPage() {
  const { t } = useI18n()
  const [rows, setRows] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState<number | null>(null)
  const [msg, setMsg] = useState('')
  const [msgOk, setMsgOk] = useState(false)
  const [copied, setCopied] = useState<number | null>(null)
  const [canManage, setCanManage] = useState(false)
  // ---- new account (custom volume) ----
  const [info, setInfo] = useState<ResellerInfo | null>(null)
  const [usage, setUsage] = useState<ResellerUsage | null>(null)
  const [plans, setPlans] = useState<AgencyPlan[]>([])
  const [custom, setCustom] = useState(false)
  const [form, setForm] = useState({ email: '', username: '', planId: '', trafficGB: '', days: '', deviceLimit: '' })
  const [creating, setCreating] = useState(false)
  const [created, setCreated] = useState<CreatedAccount | null>(null)
  const [copiedKey, setCopiedKey] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/reseller/accounts?q=${encodeURIComponent(q)}&status=${status}`)
    if (res.ok) setRows((await res.json())?.accounts || [])
    setLoading(false)
  }, [q, status])

  const loadInfo = useCallback(async () => {
    const res = await fetch('/api/reseller')
    if (!res.ok) return
    const d = await res.json()
    setInfo(d?.reseller || null)
    setUsage(d?.usage || null)
    setPlans(d?.plans || [])
    setForm((f) => (f.planId || !d?.plans?.length ? f : { ...f, planId: String(d.plans[0].id) }))
  }, [])

  useEffect(() => {
    load()
    loadInfo()
    fetch('/api/me').then(r => r.ok ? r.json() : null).then(me => setCanManage(Boolean(me?.resellerIsOwner || me?.resellerPermissions?.includes('accounts.manage')))).catch(() => {})
  }, [load, loadInfo])

  const selectedPlan = plans.find((p) => String(p.id) === form.planId) || null
  /** what the account will really get: the plan, unless a custom size is asked for */
  const target = {
    trafficGB: custom && form.trafficGB !== '' ? Number(form.trafficGB) : selectedPlan?.trafficGB ?? 0,
    days: custom && form.days !== '' ? Number(form.days) : selectedPlan?.days ?? 0,
    deviceLimit: custom && form.deviceLimit !== '' ? Number(form.deviceLimit) : selectedPlan?.deviceLimit ?? 0,
  }
  const quotaLeft = usage?.trafficQuotaLeftGB ?? 0
  const overQuota = Boolean(info && info.trafficQuotaGB > 0 && target.trafficGB > quotaLeft)

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    setMsg('')
    setCreated(null)
    const res = await fetch('/api/reseller/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: form.email,
        planId: Number(form.planId),
        username: form.username || undefined,
        trafficGB: custom && form.trafficGB !== '' ? Number(form.trafficGB) : undefined,
        days: custom && form.days !== '' ? Number(form.days) : undefined,
        deviceLimit: custom && form.deviceLimit !== '' ? Number(form.deviceLimit) : undefined,
      }),
    })
    const d = await res.json().catch(() => null)
    setCreating(false)
    if (!res.ok) {
      setMsgOk(false)
      setMsg(d?.error || t.errGeneric)
      return
    }
    setMsgOk(true)
    setMsg(`${t.accountCreated} ✓`)
    setCreated(d)
    setForm({ ...form, email: '', username: '' })
    load()
    loadInfo()
  }

  const copyKey = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(''), 1600)
  }

  async function act(id: number, action: string, extra: object = {}) {
    setBusy(id)
    setMsg('')
    const res = await fetch(`/api/reseller/accounts/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...extra }),
    })
    const d = await res.json().catch(() => null)
    setBusy(null)
    if (!res.ok) {
      setMsgOk(false)
      setMsg(d?.code === 'INSUFFICIENT_FUNDS' ? t.topUpToCreate : d?.error || t.errGeneric)
      return
    }
    setMsgOk(true)
    setMsg(`${action} ✓`)
    load()
  }

  async function remove(id: number, username: string) {
    if (!confirm(`${t.deleteConfirm} ${username}`)) return
    setBusy(id)
    const res = await fetch(`/api/reseller/accounts/${id}`, { method: 'DELETE' })
    const d = await res.json().catch(() => null)
    setBusy(null)
    setMsgOk(res.ok)
    setMsg(res.ok ? t.accountDeleted : d?.error || t.errGeneric)
    load()
  }

  const copy = (text: string, id: number) => {
    navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 1500)
  }

  return (
    <div>
      <div className="appbar">
        <div>
          <h1 className="h2">🔗 {t.myAccounts}</h1>
          <p className="muted">{t.resellerPanelSub}</p>
        </div>
      </div>

      <div className="card mb-4">
        <div className="flex gap-2 flex-wrap items-center">
          <input className="input imp-w-72" placeholder={t.searchAccounts} value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="select imp-w-40" value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s === '' ? t.all : (t as Record<string, string>)[`st${s}`] || s}</option>
            ))}
          </select>
          <button className="btn btn-ghost btn-sm" onClick={() => load()}>↻ {t.refresh}</button>
        </div>
      </div>

      {msg && <p className={msgOk ? 'success-text mb-4' : 'error-text mb-4'}>{msg}</p>}

      <div className="card">
        {loading && <p className="muted">{t.loading}</p>}
        {!loading && rows.length === 0 && <p className="muted">{t.noAccounts}</p>}

        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th>{t.usernameTitle}</th>
                  <th>{t.customerEmail}</th>
                  <th>{t.plan}</th>
                  <th>{t.bandwidth}</th>
                  <th>{t.expires}</th>
                  <th>{t.status}</th>
                  {canManage && <th>{t.actions}</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id}>
                    <td className="num" dir="ltr">
                      {a.username}
                      {a.subUrl && (
                        <button className="muted text-xs ms-2" onClick={() => copy(a.subUrl, a.id)}>
                          {copied === a.id ? `✓ ${t.copied}` : t.subUrl}
                        </button>
                      )}
                    </td>
                    <td dir="ltr">{a.customer.email}</td>
                    <td className="truncate">{a.planName}</td>
                    <td className="num">
                      {a.trafficUsedGB} / {a.trafficLimitGB > 0 ? `${a.trafficLimitGB} GB` : t.unlimited}
                    </td>
                    <td className="num">{new Date(a.expiresAt).toLocaleDateString('en-US')}</td>
                    <td><StatusBadge value={a.status} /></td>
                    {canManage && <td>
                      <div className="flex gap-2 flex-wrap">
                        <button className="btn btn-ghost btn-sm" disabled={busy === a.id} onClick={() => act(a.id, a.status === 'ACTIVE' ? 'disable' : 'enable')}>
                          {a.status === 'ACTIVE' ? t.disable : t.enable}
                        </button>
                        <button className="btn btn-ghost btn-sm" disabled={busy === a.id} onClick={() => act(a.id, 'rotate')}>↻ {t.resellerLink}</button>
                        <button className="btn btn-ghost btn-sm" disabled={busy === a.id} onClick={() => act(a.id, 'reset-traffic')}>{t.resetTraffic}</button>
                        <button className="btn btn-ghost btn-sm" disabled={busy === a.id} onClick={() => act(a.id, 'renew')}>♻ {t.renewNow}</button>
                        <button className="btn btn-ghost btn-sm" disabled={busy === a.id} onClick={() => act(a.id, 'sync')}>🔄 {t.sync}</button>
                        <button className="btn btn-ghost btn-sm" disabled={busy === a.id} onClick={() => remove(a.id, a.username)}>🗑 {t.deleteAccount}</button>
                      </div>
                    </td>}
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
