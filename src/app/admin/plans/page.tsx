'use client'

import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '@/i18n/LocaleProvider'
import { getCookie } from '@/platform/browser/preferences'
import { formatCurrency, BASE_CURRENCY } from '@/shared/money/client'

interface PlanRow {
  id: number
  name: string
  nameEn: string
  description: string
  descriptionEn: string
  trafficGB: number
  days: number
  deviceLimit: number
  price: number
  currency: string
  active: boolean
  featured: boolean
  sort: number
  panel?: { name: string } | null
  panelId?: number | null
}

interface PanelRow {
  id: number
  name: string
  active: boolean
}

const EMPTY = { name: '', nameEn: '', description: '', descriptionEn: '', trafficGB: 50, days: 30, deviceLimit: 2, price: 0, currency: BASE_CURRENCY, sort: 0, panelId: '', access: 'PUBLIC', memberPrice: '', vipGiftDays: 0 }

export default function AdminPlansPage() {
  const { t, locale } = useI18n()
  const theme = getCookie('theme') || 'dark'
  const [plans, setPlans] = useState<PlanRow[]>([])
  const [panels, setPanels] = useState<PanelRow[]>([])
  const [form, setForm] = useState<any>(EMPTY)
  const [editId, setEditId] = useState<number | null>(null)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    const [p, pn] = await Promise.all([fetch('/api/admin/plans'), fetch('/api/admin/panels')])
    if (p.ok) setPlans(await p.json())
    if (pn.ok) setPanels(await pn.json())
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setMsg('')
    const res = await fetch('/api/admin/plans', {
      method: editId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editId ? { ...form, id: editId } : form),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setMsg(data?.error || t.errGeneric)
      return
    }
    setForm(EMPTY)
    setEditId(null)
    load()
  }

  function edit(p: PlanRow) {
    setEditId(p.id)
    setForm({
      name: p.name,
      nameEn: p.nameEn,
      description: p.description,
      descriptionEn: p.descriptionEn,
      trafficGB: p.trafficGB,
      days: p.days,
      deviceLimit: p.deviceLimit,
      price: p.price,
      currency: p.currency || 'USD',
      sort: p.sort,
      panelId: (p as any).panelId || '',
      access: (p as any).access || 'PUBLIC',
      memberPrice: (p as any).memberPrice ?? '',
      vipGiftDays: (p as any).vipGiftDays || 0,
    })
  }

  async function remove(id: number) {
    if (!confirm(t.confirmDelete)) return
    const res = await fetch(`/api/admin/plans?id=${id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => null)
    if (data?.message) setMsg(data.message)
    load()
  }

  return (
    <div>
      <h1 className="h2 mb-6">{t.plansAdmin}</h1>

      <form onSubmit={save} className="card mb-6 grid-4 items-end">
        <div>
          <label className="label">{locale === 'fa' ? 'نام فارسی پلن' : 'Persian plan name'}</label>
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div>
          <label className="label">{locale === 'fa' ? 'نام انگلیسی پلن' : 'English plan name'}</label>
          <input className="input" dir="ltr" value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} required />
        </div>
        <div>
          <label className="label">{locale === 'fa' ? 'توضیح فارسی پلن' : 'Persian plan description'}</label>
          <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div>
          <label className="label">{locale === 'fa' ? 'توضیح انگلیسی پلن' : 'English plan description'}</label>
          <input className="input" dir="ltr" value={form.descriptionEn} onChange={(e) => setForm({ ...form, descriptionEn: e.target.value })} />
        </div>
        <div>
          <label className="label">{t.trafficGB}</label>
          <input className="input num" type="number" value={form.trafficGB} onChange={(e) => setForm({ ...form, trafficGB: e.target.value })} />
        </div>
        <div>
          <label className="label">{t.durationDays}</label>
          <input className="input num" type="number" value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} />
        </div>
        <div>
          <label className="label">{t.price} ({form.currency})</label>
          <input className="input num" inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
        </div>
        <div>
          <label className="label">{t.currency}</label>
          <input className="input" dir="ltr" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} required />
        </div>
        <div>
          <label className="label">{t.devicesLeft}</label>
          <input className="input num" type="number" value={form.deviceLimit} onChange={(e) => setForm({ ...form, deviceLimit: e.target.value })} />
        </div>
        <div>
          <label className="label">{t.targetPanel}</label>
          <select className="select" value={form.panelId} onChange={(e) => setForm({ ...form, panelId: e.target.value })}>
            <option value="">{t.selectPanel}</option>
            {panels.filter((p) => p.active).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">{locale === 'fa' ? 'دسترسی' : 'Access'}</label>
          <select className="select" value={form.access} onChange={(e) => setForm({ ...form, access: e.target.value })}>
            <option value="PUBLIC">{locale === 'fa' ? 'همه' : 'Everyone'}</option>
            <option value="MEMBERS">{locale === 'fa' ? 'فقط اعضای ویژه (VIP)' : 'VIP members only'}</option>
          </select>
        </div>
        <div>
          <label className="label">{locale === 'fa' ? `قیمت اعضای VIP (${form.currency}) · اختیاری` : `VIP price (${form.currency}) · optional`}</label>
          <input className="input num" inputMode="decimal" value={form.memberPrice} onChange={(e) => setForm({ ...form, memberPrice: e.target.value })} />
        </div>
        <div>
          <label className="label">{locale === 'fa' ? 'روز VIP هدیه با خرید' : 'VIP gift days'}</label>
          <input className="input num" type="number" min={0} value={form.vipGiftDays} onChange={(e) => setForm({ ...form, vipGiftDays: e.target.value })} />
        </div>
        <div>
          <label className="label">{t.sortOrder}</label>
          <input className="input num" type="number" value={form.sort} onChange={(e) => setForm({ ...form, sort: e.target.value })} />
        </div>
        <div className="flex gap-2 items-center">
          <label className="flex items-center gap-1 text-sm">
            <input type="checkbox" checked={form.featured === true} onChange={(e) => setForm({ ...form, featured: e.target.checked })} />
            {t.special}
          </label>
          <label className="flex items-center gap-1 text-sm">
            <input type="checkbox" checked={form.active !== false} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            {t.active}
          </label>
          <button className="btn btn-primary flex-1">{editId ? t.save : t.add}</button>
          {editId && <button type="button" className="btn btn-ghost" onClick={() => { setEditId(null); setForm(EMPTY) }}>{t.cancel}</button>}
        </div>
      </form>
      {msg && <p className="error-text mb-4">{msg}</p>}

      <div className="grid-3">
        {plans.map((p) => (
          <div key={p.id} className={`card ${!p.active ? 'opacity-50' : ''}`}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold">{locale === 'fa' ? p.name : p.nameEn || `${p.trafficGB} GB · ${p.days}-day plan`}</h3>
              {p.featured && <span className="badge badge-purple">⭐ {t.special}</span>}
            </div>
            <p className="muted text-sm">{(locale === 'fa' ? p.description : p.descriptionEn) || '—'}</p>
            <ul className="text-sm mt-3 space-y-1">
              <li className="num">📦 {p.trafficGB} GB · {p.days} {t.days}</li>
              <li className="num">💻 {p.deviceLimit} {t.simultaneous}</li>
              <li className="num">💵 {formatCurrency(p.price, p.currency || 'USD')}</li>
              <li className="muted">🖥 {p.panel?.name || t.noPanelSet}</li>
            </ul>
            <div className="flex gap-2 mt-4">
              <button className="btn btn-ghost imp-py-1-5 flex-1" onClick={() => edit(p)}>{t.edit}</button>
              <button className="btn btn-danger imp-py-1-5" onClick={() => remove(p.id)}>{t.delete}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
