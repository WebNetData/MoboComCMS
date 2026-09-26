'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import StatusBadge from '@/components/StatusBadge'
import { useI18n } from '@/i18n/LocaleProvider'
import { formatCurrency } from '@/shared/money/client'

interface Detail {
  user: {
    id: number
    email: string
    name: string
    phone: string
    telegramId: string | null
    telegramUsername: string
    telegramLinkedAt: string | null
    role: string
    roleId: number | null
    roleName: string | null
    status: string
    note: string
    walletBalance: number
    walletBalances: { currency: string; balance: number }[]
    lastLoginAt: string | null
    createdAt: string
    lifetimePaid: number
    lifetimePaidByCurrency: { currency: string; amount: number }[]
  }
  subscriptions: any[]
  invoices: any[]
  orders: any[]
  wallet: any[]
  notes: { id: number; body: string; createdAt: string }[]
  tickets: { id: number; subject: string; status: string; createdAt: string }[]
  apiKeys: { id: number; name: string; active: boolean; requests: number; lastUsedAt: string | null }[]
  plans: { id: number; name: string; days: number; trafficGB: number; deviceLimit: number; panel: string }[]
}

type Tab = 'overview' | 'wallet' | 'subs' | 'billing' | 'crm'

export default function AdminCustomerPage() {
  const { id } = useParams<{ id: string }>()
  const { t, locale } = useI18n()
  const isFa = locale === 'fa'
  const [data, setData] = useState<Detail | null>(null)
  const [tab, setTab] = useState<Tab>('overview')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [amount, setAmount] = useState<number>(10)
  const [currency, setCurrency] = useState('USD')
  const [amountNote, setAmountNote] = useState('')
  const [note, setNote] = useState('')
  const [extendDays, setExtendDays] = useState(30)
  const [newPlanId, setNewPlanId] = useState(0)
  const [newUsername, setNewUsername] = useState('')
  const [roles, setRoles] = useState<{ id: number; name: string; nameFa: string }[]>([])

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/users/${id}`)
    if (res.ok) setData(await res.json())
    else setErr(t.errGeneric)
  }, [id, t])

  useEffect(() => {
    load()
    fetch('/api/admin/users')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setRoles(d.roles || []))
      .catch(() => {})
  }, [load])

  async function call(action: string, payload: object = {}, label = action) {
    setBusy(label)
    setMsg('')
    setErr('')
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    })
    const d = await res.json().catch(() => null)
    setBusy(null)
    if (!res.ok) {
      setErr(d?.error || t.errGeneric)
      return
    }
    setMsg(t.savedOk)
    load()
    setTimeout(() => setMsg(''), 2500)
  }

  const money = (n: number, code = 'USD') => formatCurrency(n, code, isFa ? 'fa-IR' : 'en-US')
  const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString(isFa ? 'fa-IR' : 'en-US') : '—')
  const fmtFull = (d?: string | null) => (d ? new Date(d).toLocaleString(isFa ? 'fa-IR' : 'en-US') : '—')

  if (!data) return <p className="muted">{t.loading}</p>
  const u = data.user
  const selectedPlan = data.plans.find((plan) => plan.id === newPlanId)
  const currencyOptions = [...new Set(['USD', ...u.walletBalances.map((b) => b.currency), ...u.lifetimePaidByCurrency.map((b) => b.currency), ...data.invoices.map((i) => i.currency), ...data.orders.map((o) => o.currency), ...data.wallet.map((w) => w.currency)])].sort()

  const TABS: [Tab, string][] = [
    ['overview', t.overview],
    ['wallet', t.wallet],
    ['subs', t.subscriptions],
    ['billing', t.billing],
    ['crm', t.crmNotes],
  ]

  return (
    <div>
      <div className="appbar">
        <div className="flex items-center gap-3">
          <span className="avatar" style={{ background: 'var(--primary)' }}>{(u.name || u.email).charAt(0).toUpperCase()}</span>
          <div>
            <h1 className="h2">{u.name || u.email}</h1>
            <p className="muted" dir="ltr">{u.email} · <span className="num">#{u.id}</span></p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge value={u.status} />
          {u.role === 'ADMIN' && <span className="badge badge-purple">{u.roleName || t.stADMIN}</span>}
          <Link href="/admin/users" className="btn btn-ghost">← {t.customers}</Link>
        </div>
      </div>

      {msg && <p className="success-text mb-3">{msg}</p>}
      {err && <p className="error-text mb-3">{err}</p>}

      <div className="grid-4 mb-6">
        <div className="card kpi kpi-green">
          <div className="kpi-icon">💳</div>
          <div className="min-w-0">
            <div className="muted text-xs">{t.walletBalance}</div>
            <div className="num text-lg font-extrabold">{u.walletBalances.length ? u.walletBalances.map((b) => money(b.balance, b.currency)).join(' · ') : '—'}</div>
          </div>
        </div>
        <div className="card kpi">
          <div className="kpi-icon">💰</div>
          <div className="min-w-0">
            <div className="muted text-xs">{t.lifetimePaid}</div>
            <div className="num text-lg font-extrabold">{u.lifetimePaidByCurrency.length ? u.lifetimePaidByCurrency.map((b) => money(b.amount, b.currency)).join(' · ') : '—'}</div>
          </div>
        </div>
        <div className="card kpi">
          <div className="kpi-icon">🔗</div>
          <div className="min-w-0">
            <div className="muted text-xs">{t.subscriptions}</div>
            <div className="num text-2xl font-extrabold">{data.subscriptions.length}</div>
          </div>
        </div>
        <div className="card kpi">
          <div className="kpi-icon">🧾</div>
          <div className="min-w-0">
            <div className="muted text-xs">{t.ordersShort}</div>
            <div className="num text-2xl font-extrabold">{data.orders.length}</div>
          </div>
        </div>
      </div>

      <div className="tabs mb-6">
        {TABS.map(([key, label]) => (
          <button key={key} className={`tab ${tab === key ? 'tab-active' : ''}`} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: '1rem' }}>
          <div className="card">
            <h2 className="h3 mb-4">{t.accountSettings}</h2>
            <div className="space-y-3 mb-5">
              <div className="flex items-center justify-between">
                <span className="muted text-sm">{t.phoneLabel}</span>
                <span className="num" dir="ltr">{u.phone || '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="muted text-sm">{t.lastLogin}</span>
                <span className="num text-sm">{fmtFull(u.lastLoginAt)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="muted text-sm">{isFa ? 'شناسه عددی تلگرام' : 'Telegram ID'}</span>
                <span className="num text-sm" dir="ltr">{u.telegramId || '—'}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="muted text-sm">{isFa ? 'نام کاربری تلگرام' : 'Telegram username'}</span>
                <span className="text-sm" dir="ltr">{u.telegramUsername ? `@${u.telegramUsername}` : '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="muted text-sm">{t.createdAtLabel}</span>
                <span className="num text-sm">{fmt(u.createdAt)}</span>
              </div>
            </div>

            <label className="label">{t.role}</label>
            <div className="flex gap-2 mb-4">
              <select className="select" value={u.role} onChange={(e) => call('role', { role: e.target.value })}>
                <option value="CUSTOMER">{t.stCUSTOMER}</option>
                <option value="ADMIN">{t.stADMIN}</option>
              </select>
              {u.role === 'ADMIN' && (
                <select className="select" value={u.roleId || ''} onChange={(e) => call('role', { role: 'ADMIN', roleId: Number(e.target.value) || null })}>
                  <option value="">{t.stADMIN} (full)</option>
                  {roles.map((r) => <option key={r.id} value={r.id}>{r.nameFa || r.name}</option>)}
                </select>
              )}
            </div>

            <button
              className={`btn ${u.status === 'BANNED' ? 'btn-primary' : 'btn-danger'}`}
              disabled={busy === 'status'}
              onClick={() => call('status', { status: u.status === 'BANNED' ? 'ACTIVE' : 'BANNED' }, 'status')}
            >
              {u.status === 'BANNED' ? `✓ ${t.unban}` : `⛔ ${t.ban}`}
            </button>
          </div>

          <div className="card">
            <h2 className="h3 mb-4">{t.recentActivity}</h2>
            <div className="space-y-3">
              {data.wallet.slice(0, 5).map((w) => (
                <div key={w.id} className="flex items-center justify-between gap-2 border-b border-var pb-2">
                  <div className="min-w-0">
                    <div className="text-sm truncate">{w.description || w.type}</div>
                    <div className="muted text-xs num">{fmtFull(w.createdAt)}</div>
                  </div>
                  <span className={`num text-sm font-semibold ${w.amount >= 0 ? 'success-text' : 'error-text'}`}>
                    {w.amount >= 0 ? '+' : '−'}{money(Math.abs(w.amount), w.currency)}
                  </span>
                </div>
              ))}
              {data.wallet.length === 0 && <p className="muted">{t.noTx}</p>}
            </div>
            {data.apiKeys.length > 0 && (
              <>
                <h3 className="font-bold mt-5 mb-2">🔌 {t.apiAccess}</h3>
                <p className="muted text-sm">
                  <span className="num">{data.apiKeys.filter((k) => k.active).length}</span> {t.activeKeys} ·{' '}
                  <span className="num">{data.apiKeys.reduce((a, k) => a + k.requests, 0)}</span> {t.requests}
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {tab === 'wallet' && (
        <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.6fr)', gap: '1rem' }}>
          <div className="card self-start">
            <h2 className="h3 mb-1">{t.chargeWallet}</h2>
            <p className="muted text-sm mb-4">{t.chargeWalletHint}</p>
            <label className="label">Currency</label>
            <select className="select mb-3" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {currencyOptions.map((code) => <option key={code} value={code}>{code}</option>)}
            </select>
            <label className="label">{t.amountLabel}</label>
            <input className="input num mb-3" dir="ltr" type="number" step="0.01" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
            <div className="flex gap-2 mb-3 flex-wrap">
              {[5, 10, 25, 50, 100].map((q) => (
                <button key={q} className={`badge ${amount === q ? 'badge-primary' : 'badge-gray'}`} onClick={() => setAmount(q)}>{money(q, currency)}</button>
              ))}
            </div>
            <label className="label">{t.description}</label>
            <input className="input mb-4" value={amountNote} onChange={(e) => setAmountNote(e.target.value)} placeholder={t.chargeNotePlaceholder} />
            <div className="flex gap-2">
              <button className="btn btn-primary flex-1" disabled={busy === 'credit'} onClick={() => call('wallet', { amount: Math.abs(amount), currency, type: 'ADMIN_CREDIT', description: amountNote }, 'credit')}>
                + {t.credit}
              </button>
              <button className="btn btn-ghost flex-1" disabled={busy === 'debit'} onClick={() => call('wallet', { amount: -Math.abs(amount), currency, type: 'ADMIN_DEBIT', description: amountNote }, 'debit')}>
                − {t.debit}
              </button>
            </div>
          </div>

          <div className="card">
            <h2 className="h3 mb-4">{t.txHistory}</h2>
            <div className="overflow-x-auto">
              <table className="data">
                <thead>
                  <tr><th>{t.date}</th><th>{t.type}</th><th>{t.description}</th><th>{t.amountLabel}</th><th>{t.balanceAfter}</th></tr>
                </thead>
                <tbody>
                  {data.wallet.map((w) => (
                    <tr key={w.id}>
                      <td className="num text-xs whitespace-nowrap">{fmtFull(w.createdAt)}</td>
                      <td><StatusBadge value={w.type} /></td>
                      <td className="text-sm">{w.description || '—'}</td>
                      <td className={`num font-semibold ${w.amount >= 0 ? 'success-text' : 'error-text'}`}>
                        {w.amount >= 0 ? '+' : '−'}{money(Math.abs(w.amount), w.currency)}
                      </td>
                      <td className="num">{money(w.balanceAfter, w.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'subs' && (
        <div className="space-y-4">
          <div className="card">
            <h2 className="h3 mb-1">{isFa ? 'افزودن سرویس به کاربر' : 'Add service to customer'}</h2>
            <p className="muted text-sm mb-4">{isFa ? 'سرویس مستقیماً روی پنل VPN ساخته می‌شود و از کیف پول کاربر مبلغی کسر نمی‌شود.' : 'The service is created directly on the VPN panel without charging the customer wallet.'}</p>
            {data.plans.length ? <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr) auto', gap: '.75rem', alignItems: 'end' }}>
              <div>
                <label className="label">{isFa ? 'پلن سرویس' : 'Service plan'}</label>
                <select className="select" value={newPlanId || ''} onChange={(e) => setNewPlanId(Number(e.target.value))}>
                  <option value="">{isFa ? 'انتخاب پلن…' : 'Select a plan…'}</option>
                  {data.plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {plan.trafficGB || '∞'} GB · {plan.days} {t.days} · {plan.panel}</option>)}
                </select>
              </div>
              <div>
                <label className="label">{isFa ? 'نام کاربری دلخواه (اختیاری)' : 'Custom username (optional)'}</label>
                <input className="input num" dir="ltr" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} minLength={3} maxLength={32} placeholder="happ_customer" />
              </div>
              <button className="btn btn-primary" disabled={!selectedPlan || busy === 'provision'} onClick={() => call('provision', { planId: newPlanId, username: newUsername.trim() }, 'provision')}>
                {busy === 'provision' ? t.loading : isFa ? '+ ساخت سرویس' : '+ Create service'}
              </button>
            </div> : <p className="error-text">{isFa ? 'ابتدا یک پلن فعال را به پنل VPN فعال متصل کنید.' : 'Connect an active plan to an active VPN panel first.'}</p>}
          </div>
          <div className="card">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="h3">{t.subscriptions}</h2>
            <div className="flex items-center gap-2">
              <label className="muted text-sm">{t.extendDays}</label>
              <input className="input imp-w-24 num" type="number" min={1} value={extendDays} onChange={(e) => setExtendDays(Number(e.target.value))} />
            </div>
          </div>
          {data.subscriptions.length === 0 && <p className="muted">{t.noSubs}</p>}
          <div className="space-y-3">
            {data.subscriptions.map((s) => (
              <div key={s.id} className="card">
                <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
                  <div>
                    <div className="font-bold">{s.plan} <span className="muted text-xs num">#{s.id}</span></div>
                    <div className="muted text-xs">
                      {s.panel || '—'} · <span dir="ltr" className="num">{s.username}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge value={s.status} />
                    <span className="badge badge-gray num">{s.trafficUsedGB}/{s.trafficLimitGB || '∞'} GB</span>
                    <span className="badge badge-gray num">{fmt(s.expiresAt)}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className={`btn ${s.status === 'DISABLED' ? 'btn-primary' : 'btn-ghost'}`} disabled={busy === `sub-${s.id}`}
                    onClick={() => call('subscription', { subId: s.id, subAction: s.status === 'DISABLED' ? 'enable' : 'disable' }, `sub-${s.id}`)}>
                    {s.status === 'DISABLED' ? `▶ ${t.enableSub}` : `⏸ ${t.disableSub}`}
                  </button>
                  <button className="btn btn-ghost" disabled={busy === `sub-${s.id}`}
                    onClick={() => call('subscription', { subId: s.id, subAction: 'extend', days: extendDays }, `sub-${s.id}`)}>
                    ◎ {t.extendBy} {extendDays} {t.days}
                  </button>
                  <button className="btn btn-ghost" disabled={busy === `sub-${s.id}`}
                    onClick={() => call('subscription', { subId: s.id, subAction: 'rotate' }, `sub-${s.id}`)}>
                    🔄 {t.rotateLink}
                  </button>
                  <button className="btn btn-ghost" disabled={busy === `sub-${s.id}`}
                    onClick={() => call('subscription', { subId: s.id, subAction: 'reset-traffic' }, `sub-${s.id}`)}>
                    🧹 {t.resetTraffic}
                  </button>
                  <button className="btn btn-ghost" disabled={busy === `sub-${s.id}`}
                    onClick={() => call('subscription', { subId: s.id, subAction: 'reset-devices' }, `sub-${s.id}`)}>
                    📱 {t.resetDevices}
                  </button>
                  <button className="btn btn-ghost" disabled={busy === `sub-${s.id}`}
                    onClick={() => call('subscription', { subId: s.id, subAction: 'sync' }, `sub-${s.id}`)}>
                    ↻ {t.syncNow}
                  </button>
                </div>
              </div>
            ))}
          </div>
          </div>
        </div>
      )}

      {tab === 'billing' && (
        <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)', gap: '1rem' }}>
          <div className="card">
            <h2 className="h3 mb-4">{t.myInvoices}</h2>
            <div className="overflow-x-auto">
              <table className="data">
                <thead>
                  <tr><th>{t.invoiceNumber}</th><th>{t.amountLabel}</th><th>{t.status}</th><th>{t.date}</th><th>{t.actions}</th></tr>
                </thead>
                <tbody>
                  {data.invoices.map((i) => (
                    <tr key={i.id}>
                      <td><Link href={`/invoice/${i.number}`} className="num" dir="ltr">{i.number}</Link></td>
                      <td className="num">{money(i.total, i.currency)}</td>
                      <td><StatusBadge value={i.status} /></td>
                      <td className="num text-xs">{fmt(i.createdAt)}</td>
                      <td>
                        <div className="flex gap-1 flex-wrap">
                          {i.status !== 'PAID' && (
                            <button className="badge badge-green" disabled={busy === `inv-${i.id}`}
                              onClick={() => call('invoice', { invoiceId: i.id, invoiceAction: 'markPaid' }, `inv-${i.id}`)}>✓ {t.markPaid}</button>
                          )}
                          {i.status === 'PAID' && (
                            <button className="badge badge-amber" disabled={busy === `inv-${i.id}`}
                              onClick={() => call('invoice', { invoiceId: i.id, invoiceAction: 'refund' }, `inv-${i.id}`)}>↩ {t.refund}</button>
                          )}
                          {i.status !== 'VOID' && i.status !== 'PAID' && (
                            <button className="badge badge-gray" disabled={busy === `inv-${i.id}`}
                              onClick={() => call('invoice', { invoiceId: i.id, invoiceAction: 'void' }, `inv-${i.id}`)}>✕ {t.void}</button>
                          )}
                          {i.status === 'VOID' && (
                            <button className="badge badge-purple" disabled={busy === `inv-${i.id}`}
                              onClick={() => call('invoice', { invoiceId: i.id, invoiceAction: 'unpaid' }, `inv-${i.id}`)}>↺ {t.stUNPAID}</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <h2 className="h3 mb-4">{t.myOrders}</h2>
            <div className="space-y-3">
              {data.orders.map((o) => (
                <div key={o.id} className="flex items-center justify-between gap-2 border-b border-var pb-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{o.plan || `#${o.id}`}</div>
                    <div className="muted text-xs num">{fmtFull(o.createdAt)} · {o.provider}</div>
                  </div>
                  <div className="text-end">
                    <div className="num text-sm font-semibold">{money(o.total, o.currency)}</div>
                    <StatusBadge value={o.status} />
                  </div>
                </div>
              ))}
              {data.orders.length === 0 && <p className="muted">{t.noOrders}</p>}
            </div>
          </div>
        </div>
      )}

      {tab === 'crm' && (
        <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: '1rem' }}>
          <div className="card self-start">
            <h2 className="h3 mb-4">{t.addNote}</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (!note.trim()) return
                call('note', { body: note })
                setNote('')
              }}
            >
              <textarea className="textarea mb-3" rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
              <button className="btn btn-primary w-full" disabled={busy === 'note'}>{t.saveNote}</button>
            </form>

            <h3 className="font-bold mt-6 mb-3">{t.tickets}</h3>
            <div className="space-y-2">
              {data.tickets.map((tk) => (
                <Link key={tk.id} href={`/admin/tickets/${tk.id}`} className="flex items-center justify-between gap-2 border border-var rounded-lg p-2">
                  <span className="text-sm truncate"><span className="num">#{tk.id}</span> {tk.subject}</span>
                  <StatusBadge value={tk.status} />
                </Link>
              ))}
              {data.tickets.length === 0 && <p className="muted">{t.noTickets}</p>}
            </div>
          </div>

          <div className="card">
            <h2 className="h3 mb-4">{t.crmNotes}</h2>
            <div className="space-y-2" style={{ maxHeight: 480, overflowY: 'auto' }}>
              {data.notes.map((n) => (
                <div key={n.id} className="rounded-lg border border-var p-3">
                  <div className="text-sm">{n.body}</div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="muted text-xs num">{fmtFull(n.createdAt)}</span>
                    <button className="badge badge-red" disabled={busy === `note-${n.id}`}
                      onClick={() => call('noteDelete', { noteId: n.id }, `note-${n.id}`)}>✕</button>
                  </div>
                </div>
              ))}
              {data.notes.length === 0 && <p className="muted">{t.noNotes}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
