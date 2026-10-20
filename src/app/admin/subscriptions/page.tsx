'use client'

import { useCallback, useEffect, useState } from 'react'
import StatusBadge from '@/components/StatusBadge'
import { useI18n } from '@/i18n/LocaleProvider'
import { getCookie } from '@/platform/browser/preferences'
import { panelTypeMeta } from '@/modules/providers/domain/panel-types'

interface SubRow {
  id: number
  user: string
  plan: string
  panel: string
  panelType: string
  username: string
  status: string
  trafficUsedGB: number
  trafficLimitGB: number
  expiresAt: string
}

export default function AdminSubscriptionsPage() {
  const { t, locale } = useI18n()
  const theme = getCookie('theme') || 'dark'
  const [subs, setSubs] = useState<SubRow[]>([])
  const [busy, setBusy] = useState<number | null>(null)
  const [extendDays, setExtendDays] = useState(30)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/subscriptions')
    if (res.ok) setSubs(await res.json())
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function act(id: number, action: string, extra: object = {}) {
    setBusy(id)
    setMsg('')
    const res = await fetch('/api/admin/subscriptions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action, ...extra }),
    })
    const data = await res.json().catch(() => null)
    setBusy(null)
    if (!res.ok) setMsg(data?.error || t.errGeneric)
    else load()
  }

  function fmt(d: string) {
    return new Date(d).toLocaleDateString(locale === 'fa' ? 'fa-IR' : 'en-US')
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="h2">{t.subscriptions}</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="muted">{t.extendDays}</span>
          <input aria-label={t.extendDays} className="input imp-w-24" type="number" min={1} value={extendDays} onChange={(e) => setExtendDays(Number(e.target.value))} />
          <span className="muted">{t.days}</span>
          <button className="btn btn-ghost" onClick={() => load()}>↻ {t.refreshList}</button>
        </div>
      </div>
      {msg && <p className="error-text mb-4">{msg}</p>}

      <div className="card overflow-x-auto">
        <table className="data">
          <thead>
            <tr>
              <th>#</th>
              <th>{t.customer}</th>
              <th>{t.plan}</th>
              <th>{t.panels}</th>
              <th>{t.panelUser}</th>
              <th>{t.trafficUsed}</th>
              <th>{t.expires}</th>
              <th>{t.status}</th>
              <th>{t.actions}</th>
            </tr>
          </thead>
          <tbody>
            {subs.map((s) => (
              <tr key={s.id}>
                <td className="num">{s.id}</td>
                <td dir="ltr">{s.user}</td>
                <td>{s.plan}</td>
                <td>{s.panel} <span className="muted">({panelTypeMeta(s.panelType).label})</span></td>
                <td><code>{s.username}</code></td>
                <td className="num">{s.trafficUsedGB}/{s.trafficLimitGB} GB</td>
                <td>{fmt(s.expiresAt)}</td>
                <td><StatusBadge value={s.status} /></td>
                <td>
                  <div className="flex gap-1 flex-wrap">
                    <button className="badge badge-green" disabled={busy === s.id} onClick={() => act(s.id, 'extend', { days: extendDays })}>{t.extend}</button>
                    <button className="badge badge-purple" disabled={busy === s.id} onClick={() => act(s.id, 'sync')}>{t.sync}</button>
                    <button className="badge badge-amber" disabled={busy === s.id} onClick={() => act(s.id, 'toggle')}>
                      {s.status === 'DISABLED' ? t.enable : t.disable}
                    </button>
                    <button className="badge badge-red" disabled={busy === s.id} onClick={() => act(s.id, 'revoke')}>{t.revoke}</button>
                  </div>
                </td>
              </tr>
            ))}
            {subs.length === 0 && (
              <tr><td colSpan={9} className="muted text-center py-8">{t.noSubsAdmin}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
