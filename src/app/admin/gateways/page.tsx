'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import { useI18n } from '@/i18n/LocaleProvider'

interface Gateway {
  id: number
  name: string
  provider: string
  providerLabel: string
  fiat: string
  currencies: string
  feePercent: number
  minAmount: number
  instructions: string
  active: boolean
  isDefault: boolean
  sortOrder: number
  apiKeyMasked: string
  secretMasked: string
  hasApiKey: boolean
  hasSecret: boolean
  accountUser?: string
  baseUrl?: string
  installments?: number
  hasPassword?: boolean
  usable: boolean
}

const INSTALLMENT = ['SNAPPPAY', 'DIGIPAY', 'AZKI']
const INSTALLMENT_NAME: Record<string, string> = { SNAPPPAY: 'خرید اقساطی با اسنپ‌پی', DIGIPAY: 'خرید اعتباری دیجی‌پی', AZKI: 'خرید اقساطی ازکی' }

interface Provider {
  key: string
  label: string
  labelFa: string
  hint: string
  hintFa: string
  needsApiKey: boolean
  needsSecret: boolean
}

const EMPTY = {
  name: 'درگاه پرداخت ارزی ریالی',
  provider: 'FRENZYEX',
  apiKey: '',
  secretKey: '',
  accountUser: '',
  password: '',
  baseUrl: '',
  installments: 4,
  fiat: 'TMN',
  currencies: '',
  feePercent: '',
  minAmount: '',
  instructions: '',
  active: true,
  isDefault: false,
  sortOrder: 0,
}

export default function AdminGatewaysPage() {
  const { t, locale } = useI18n()
  const isFa = locale === 'fa'
  const [gateways, setGateways] = useState<Gateway[]>([])
  const [providers, setProviders] = useState<Provider[]>([])
  const [form, setForm] = useState<any>(EMPTY)
  const [editId, setEditId] = useState<number | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [msg, setMsg] = useState('')
  const [msgOk, setMsgOk] = useState(false)
  const [testing, setTesting] = useState<number | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/gateways')
    if (res.ok) {
      const data = await res.json()
      setGateways(data.gateways || [])
      setProviders(data.providers || [])
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const meta = (key: string) => providers.find((p) => p.key === key)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setMsg('')
    const res = await fetch('/api/admin/gateways', {
      method: editId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editId ? { ...form, id: editId } : form),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setMsgOk(false)
      setMsg(data?.error || t.errGeneric)
      return
    }
    setMsgOk(true)
    setMsg(t.saved)
    setEditId(null)
    setShowForm(false)
    setForm(EMPTY)
    load()
  }

  async function patch(id: number, body: Record<string, unknown>) {
    setMsg('')
    const res = await fetch('/api/admin/gateways', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...body }),
    })
    const data = await res.json().catch(() => null)
    setMsgOk(res.ok)
    if (!res.ok) setMsg(data?.error || t.errGeneric)
    load()
  }

  async function remove(id: number) {
    if (!confirm(t.confirmDelete)) return
    const res = await fetch(`/api/admin/gateways?id=${id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setMsgOk(false)
      setMsg(data?.error || t.errGeneric)
    } else if (data?.deactivated) {
      setMsgOk(true)
      setMsg(t.gatewayDeactivatedInUse)
    }
    load()
  }

  async function test(gw: Gateway) {
    setTesting(gw.id)
    setMsg('')
    const res = await fetch('/api/admin/gateways', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: gw.id }),
    })
    const data = await res.json().catch(() => null)
    setTesting(null)
    setMsgOk(Boolean(data?.ok))
    setMsg(data?.ok ? `${t.gwConnected} ${data?.detail || ''}` : `${t.gwFailed} ${data?.message || ''}`)
  }

  function edit(gw: Gateway) {
    setEditId(gw.id)
    setForm({
      name: gw.name,
      provider: gw.provider,
      apiKey: '',
      secretKey: '',
      accountUser: gw.accountUser || '',
      password: '',
      baseUrl: gw.baseUrl || '',
      installments: gw.installments || 4,
      fiat: gw.fiat,
      currencies: gw.currencies,
      feePercent: String(gw.feePercent),
      minAmount: String(gw.minAmount),
      instructions: gw.instructions,
      active: gw.active,
      isDefault: gw.isDefault,
      sortOrder: gw.sortOrder,
    })
    setShowForm(true)
  }

  const selected = meta(form.provider)

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <div>
          <h1 className="h2">{t.gatewaysAdmin}</h1>
          <p className="muted">{t.gatewaysHint}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/finance" className="btn btn-ghost">{t.financeAdmin}</Link>
          <button className="btn btn-primary" onClick={() => { setEditId(null); setForm(EMPTY); setShowForm((v) => !v) }}>
            {showForm ? t.cancel : `+ ${t.addGateway}`}
          </button>
        </div>
      </div>

      <div className="card mb-6">
        <b>{isFa ? 'چند درگاه هم‌زمان' : 'Multiple active gateways'}</b>
        <p className="muted text-sm mt-2">
          {isFa
            ? 'تمام درگاه‌های فعال و کامل به مشتری نمایش داده می‌شوند. «پیش‌فرض» فقط گزینه‌ای است که از قبل انتخاب می‌شود و جلوی فعال بودن بقیه درگاه‌ها را نمی‌گیرد.'
            : 'All active, complete gateways are offered to customers. “Default” only controls the preselected option; it does not disable the other gateways.'}
        </p>
      </div>

      {showForm && (
        <form onSubmit={save} className="card mb-6 grid-3 items-end">
          <div>
            <label className="label-field"><span className="label">{t.gatewayName}</span>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
          </div>
          <div>
            <label className="label-field"><span className="label">{t.provider}</span>
            <select className="select" value={form.provider} onChange={(e) => { const provider = e.target.value; setForm({ ...form, provider, ...(provider === 'FRENZYEX' ? { name: form.name || 'درگاه پرداخت ارزی ریالی', fiat: 'TMN', currencies: '' } : provider === 'CARD_TRANSFER' ? { name: form.name || 'کارت به کارت / انتقال بانکی', fiat: 'IRR', currencies: '' } : provider === 'MELLAT' ? { name: form.name && form.name !== 'درگاه پرداخت ارزی ریالی' ? form.name : 'پرداخت آنلاین (بانک ملت)', fiat: 'IRR', currencies: '' } : INSTALLMENT.includes(provider) ? { name: !form.name || form.name === 'درگاه پرداخت ارزی ریالی' || Object.values(INSTALLMENT_NAME).includes(form.name) ? INSTALLMENT_NAME[provider] : form.name, fiat: 'IRR', currencies: '' } : {}) }) }}>
              {providers.map((p) => (
                <option key={p.key} value={p.key}>{isFa ? p.labelFa : p.label}</option>
              ))}
            </select></label>
          </div>
          <div>
            <label className="label-field"><span className="label">{t.fiatCurrency}</span>
            <input className="input" dir="ltr" value={form.provider === 'FRENZYEX' ? 'TMN' : form.provider === 'MELLAT' || INSTALLMENT.includes(form.provider) ? 'IRR' : form.fiat} readOnly={form.provider === 'FRENZYEX' || form.provider === 'MELLAT' || INSTALLMENT.includes(form.provider)} onChange={(e) => setForm({ ...form, fiat: e.target.value })} /></label>
          </div>
          {(form.provider === 'SNAPPPAY' || form.provider === 'DIGIPAY') && <>
            <div>
              <label className="label-field"><span className="label">نام کاربری پذیرنده (Username)</span>
              <input className="input" dir="ltr" autoComplete="off" value={form.accountUser} onChange={(e) => setForm({ ...form, accountUser: e.target.value })} /></label>
            </div>
            <div>
              <label className="label-field"><span className="label">رمز پذیرنده (Password)</span>
              <input className="input" dir="ltr" type="password" autoComplete="new-password" value={form.password} placeholder={editId ? t.leaveEmptyNoChange : ''} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
            </div>
          </>}
          {INSTALLMENT.includes(form.provider) && <>
            <div>
              <label className="label-field"><span className="label">نشانی سرویس (خالی = پیش‌فرض؛ برای Sandbox تغییر دهید)</span>
              <input className="input" dir="ltr" placeholder="https://…" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} /></label>
            </div>
            <div>
              <label className="label-field"><span className="label">تعداد اقساط نمایشی در صفحهٔ محصول</span>
              <input className="input num" type="number" min={2} max={24} value={form.installments} onChange={(e) => setForm({ ...form, installments: Number(e.target.value) })} /></label>
            </div>
          </>}
          {form.provider === 'MELLAT' && (
            <div>
              <label className="label-field"><span className="label">نام کاربری پذیرنده (UserName)</span>
              <input className="input" dir="ltr" autoComplete="off" value={form.accountUser} onChange={(e) => setForm({ ...form, accountUser: e.target.value })} /></label>
            </div>
          )}
          {selected?.needsApiKey && (
            <div>
              <label className="label-field"><span className="label">{form.provider === 'MELLAT' ? 'شمارهٔ ترمینال (Terminal ID)' : form.provider === 'AZKI' ? 'شناسهٔ پذیرنده (Merchant ID)' : INSTALLMENT.includes(form.provider) ? 'Client ID' : t.apiKey}</span>
              <input
                className="input"
                dir="ltr"
                value={form.apiKey}
                placeholder={editId ? t.leaveEmptyNoChange : ''}
                onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
              /></label>
            </div>
          )}
          {selected?.needsSecret && (
            <div>
              <label className="label-field"><span className="label">{form.provider === 'MELLAT' ? 'رمز عبور پذیرنده (Password)' : form.provider === 'AZKI' ? 'کلید API' : INSTALLMENT.includes(form.provider) ? 'Client Secret' : t.secretKey}</span>
              <input
                className="input"
                dir="ltr"
                type="password"
                value={form.secretKey}
                placeholder={editId ? t.leaveEmptyNoChange : ''}
                onChange={(e) => setForm({ ...form, secretKey: e.target.value })}
              /></label>
            </div>
          )}
          {form.provider === 'PLISIO' && (
            <div>
              <label className="label-field"><span className="label">{t.cryptoCurrencies}</span>
              <input className="input" dir="ltr" placeholder="BTC,ETH,USDT_TRX" value={form.currencies} onChange={(e) => setForm({ ...form, currencies: e.target.value })} /></label>
            </div>
          )}
          <div>
            <label className="label-field"><span className="label">{t.feePercent}</span>
            <input className="input num" type="number" step="0.01" value={form.feePercent} onChange={(e) => setForm({ ...form, feePercent: e.target.value })} /></label>
          </div>
          <div>
            <label className="label-field"><span className="label">{t.minAmount}</span>
            <input className="input num" type="number" step="0.01" value={form.minAmount} onChange={(e) => setForm({ ...form, minAmount: e.target.value })} /></label>
          </div>
          <div>
            <label className="label-field"><span className="label">{t.sortOrder}</span>
            <input className="input num" type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} /></label>
          </div>
          <div className="grid-column-span-3">
            <label className="label-field"><span className="label">{form.provider === 'MANUAL' ? t.paymentInstructions : t.instructionsOptional}</span>
            <textarea
              className="textarea"
              rows={form.provider === 'MANUAL' ? 4 : 2}
              dir={form.provider === 'MANUAL' ? 'ltr' : undefined}
              value={form.instructions}
              onChange={(e) => setForm({ ...form, instructions: e.target.value })}
            /></label>
          </div>
          <div>
            <span className="label">{t.active}</span>
            <label className="flex items-center gap-2 panel-toggle">
              <input type="checkbox" checked={form.active !== false} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
              <span className="text-sm">{t.active}</span>
            </label>
          </div>
          <div>
            <span className="label">{t.defaultGateway}</span>
            <label className="flex items-center gap-2 panel-toggle">
              <input type="checkbox" checked={form.isDefault === true} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} />
              <span className="text-sm">{t.makeDefault}</span>
            </label>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary flex-1">{editId ? t.save : t.addGateway}</button>
            <button type="button" className="btn btn-ghost" onClick={() => { setShowForm(false); setEditId(null); setForm(EMPTY) }}>{t.cancel}</button>
          </div>
          {selected && <div className="grid-column-span-3 muted text-xs">{isFa ? selected.hintFa : selected.hint}</div>}
        </form>
      )}

      {msg && <p className={`${msgOk ? 'success-text' : 'error-text'} mb-4`}>{msg}</p>}

      {gateways.length > 0 && !gateways.some((g) => g.active && g.usable) && (
        <div className="card mb-6" style={{ borderColor: 'var(--warning)' }}>
          <b>⚠ {t.gwNoneUsable}</b>
          <p className="muted mt-1">{t.gwNoneUsableHint}</p>
        </div>
      )}

      <div className="grid-2">
        {gateways.map((g) => (
          <div key={g.id} className={`card card-hover ${!g.active ? 'opacity-50' : ''}`}>
            <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
              <div>
                <h3 className="font-bold flex items-center gap-2">
                  {g.provider === 'PLISIO' ? '🪙' : g.provider === 'FRENZYEX' || g.provider === 'CARD_TRANSFER' ? '🏦' : '💸'} {g.name}
                  <span className="badge badge-gray">{g.provider}</span>
                </h3>
                <div className="muted text-xs num" dir="ltr">
                  {g.fiat} {g.feePercent ? `· ${g.feePercent}% fee` : ''} {g.minAmount ? `· min ${g.minAmount} ${g.fiat}` : ''}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                {g.isDefault && <span className="badge badge-purple">{t.defaultGateway}</span>}
                {g.active && !g.usable && <span className="badge badge-amber">⚠ {t.gwIncomplete}</span>}
                <span className={`badge ${g.active ? 'badge-green' : 'badge-red'}`}>{g.active ? t.panelActive : t.panelInactive}</span>
              </div>
            </div>

            <div className="credential-row">
              <span className="muted text-xs">{t.apiKey}</span>
              {g.hasApiKey ? <code dir="ltr">{g.apiKeyMasked}</code> : <span className="muted">{t.notSet}</span>}
            </div>
            <div className="credential-row">
              <span className="muted text-xs">{t.secretKey}</span>
              {g.hasSecret ? <code dir="ltr">{g.secretMasked}</code> : <span className="muted">{t.notSet}</span>}
            </div>
            {g.currencies && <div className="muted text-xs mt-2 num" dir="ltr">{t.cryptoCurrencies}: {g.currencies}</div>}

            <div className="flex gap-2 flex-wrap mt-4">
              <button className="btn btn-ghost imp-py-1-5" disabled={testing === g.id} onClick={() => test(g)}>
                {testing === g.id ? t.testing : `🔌 ${t.testGateway}`}
              </button>
              <button className="btn btn-ghost imp-py-1-5" onClick={() => edit(g)}>✏️ {t.edit}</button>
              <button className="btn btn-ghost imp-py-1-5" onClick={() => patch(g.id, { active: !g.active })}>
                {g.active ? `⏸ ${t.deactivate}` : `▶ ${t.activatePanel}`}
              </button>
              {!g.isDefault && g.active && (
                <button className="btn btn-ghost imp-py-1-5" onClick={() => patch(g.id, { isDefault: true })}>⭐ {t.makeDefault}</button>
              )}
              <button className="btn btn-danger imp-py-1-5" onClick={() => remove(g.id)}>{t.delete}</button>
            </div>
          </div>
        ))}
        {gateways.length === 0 && (
          <div className="card text-center py-10">
            <p className="muted mb-3">{t.noGateways}</p>
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ {t.addGateway}</button>
          </div>
        )}
      </div>
    </div>
  )
}
