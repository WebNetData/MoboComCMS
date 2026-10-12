'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import { useI18n } from '@/i18n/LocaleProvider'
import { formatCurrency, BASE_CURRENCY } from '@/shared/money/client'

interface Expense {
  id: number
  title: string
  category: string
  amount: number
  currency: string
  spentAt: string
  note: string
}

const EMPTY = { title: '', category: 'SERVER', amount: '', currency: BASE_CURRENCY, spentAt: '', note: '' }

export default function AdminExpensesPage() {
  const { t, locale } = useI18n()
  const isFa = locale === 'fa'
  const [rows, setRows] = useState<Expense[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [byCategory, setByCategory] = useState<Record<string, number>>({})
  const [total, setTotal] = useState(0)
  const [currency, setCurrency] = useState(BASE_CURRENCY)
  const [currencies, setCurrencies] = useState<string[]>([BASE_CURRENCY])
  const [form, setForm] = useState<any>(EMPTY)
  const [msg, setMsg] = useState('')
  const [msgOk, setMsgOk] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/expenses?currency=${encodeURIComponent(currency)}`)
    if (res.ok) {
      const data = await res.json()
      setRows(data.expenses || [])
      setCategories(data.categories || [])
      setByCategory(data.byCategory || {})
      setTotal(data.total || 0)
      setCurrencies(data.currencies || [data.currency || currency])
    }
  }, [currency])

  useEffect(() => {
    load()
  }, [load])

  const money = (n: number) => formatCurrency(n || 0, currency, isFa ? 'fa-IR' : 'en-US')
  const fmtDate = (d: string) => new Date(d).toLocaleDateString(isFa ? 'fa-IR' : 'en-US')
  const catLabel = (c: string) => (t as Record<string, string>)[`exp${c}`] || c
  const maxCat = Math.max(1, ...Object.values(byCategory))

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setMsg('')
    const res = await fetch('/api/admin/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, amount: Number(form.amount) }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setMsgOk(false)
      setMsg(data?.error || t.errGeneric)
      return
    }
    setMsgOk(true)
    setMsg(t.saved)
    setForm({ ...EMPTY, currency })
    load()
  }

  async function remove(id: number) {
    if (!confirm(t.confirmDelete)) return
    await fetch(`/api/admin/expenses?id=${id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <div>
          <h1 className="h2">{t.expensesAdmin}</h1>
          <p className="muted">{t.expensesHint}</p>
        </div>
        <div className="flex items-center gap-2">
          <select className="select imp-w-24" value={currency} onChange={(e) => { setCurrency(e.target.value); setForm((f: any) => ({ ...f, currency: e.target.value })) }} aria-label={t.currency}>
            {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <Link href="/admin/finance" className="btn btn-ghost">{t.financeAdmin}</Link>
        </div>
      </div>

      <div className="grid-2 mb-6">
        <div className="card kpi">
          <div className="kpi-icon">🧮</div>
          <div>
            <div className="muted text-xs">{t.totalExpenses}</div>
            <div className="num text-2xl font-extrabold">{money(total)}</div>
          </div>
        </div>
        <div className="card">
          <h3 className="font-bold mb-3">{t.byCategory}</h3>
          <div className="space-y-3">
            {Object.entries(byCategory).map(([c, v]) => (
              <div key={c}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span>{catLabel(c)}</span>
                  <span className="num">{money(v)}</span>
                </div>
                <div className="meter"><div className="meter-fill meter-danger" style={{ width: `${(v / maxCat) * 100}%` }} /></div>
              </div>
            ))}
            {Object.keys(byCategory).length === 0 && <p className="muted">—</p>}
          </div>
        </div>
      </div>

      <form onSubmit={save} className="card mb-6 grid-3 items-end">
        <div>
          <label className="label">{t.expenseTitle}</label>
          <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
        </div>
        <div>
          <label className="label">{t.expenseCategory}</label>
          <select className="select" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {categories.map((c) => (
              <option key={c} value={c}>{catLabel(c)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">{t.amount}</label>
          <input className="input num" type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
        </div>
        <div>
          <label className="label">{t.currency}</label>
          <input className="input" dir="ltr" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} required />
        </div>
        <div>
          <label className="label">{t.spentAt}</label>
          <input className="input" type="date" value={form.spentAt} onChange={(e) => setForm({ ...form, spentAt: e.target.value })} />
        </div>
        <div>
          <label className="label">{t.notes}</label>
          <input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </div>
        <div className="flex gap-2">
          <button className="btn btn-primary flex-1">{t.addExpense}</button>
        </div>
      </form>

      {msg && <p className={`${msgOk ? 'success-text' : 'error-text'} mb-4`}>{msg}</p>}

      <div className="card overflow-x-auto">
        {rows.length === 0 ? (
          <p className="muted text-center py-8">{t.noExpenses}</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>#</th>
                <th>{t.expenseTitle}</th>
                <th>{t.expenseCategory}</th>
                <th>{t.amount}</th>
                <th>{t.spentAt}</th>
                <th>{t.notes}</th>
                <th>{t.actions}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  <td className="num">{e.id}</td>
                  <td>{e.title}</td>
                  <td><span className="badge badge-gray">{catLabel(e.category)}</span></td>
                  <td className="num font-semibold">{money(e.amount)}</td>
                  <td className="num">{fmtDate(e.spentAt)}</td>
                  <td className="muted truncate">{e.note || '—'}</td>
                  <td><button className="badge badge-red" onClick={() => remove(e.id)}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
