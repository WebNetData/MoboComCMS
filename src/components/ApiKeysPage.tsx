'use client'

import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '@/i18n/LocaleProvider'

interface Key {
  id: number
  name: string
  prefix: string
  active: boolean
  requests: number
  lastUsedAt: string | null
  createdAt: string
}

export default function ApiKeysPage() {
  const { t, locale } = useI18n()
  const isFa = locale === 'fa'
  const [keys, setKeys] = useState<Key[]>([])
  const [name, setName] = useState('')
  const [fresh, setFresh] = useState('')
  const [copied, setCopied] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const res = await fetch('/api/keys')
    if (res.ok) setKeys((await res.json()).keys || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const res = await fetch('/api/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    const data = await res.json().catch(() => null)
    setBusy(false)
    if (!res.ok) {
      setError(data?.error || t.errGeneric)
      return
    }
    setFresh(data?.key?.token || '')
    setName('')
    load()
  }

  async function revoke(id: number) {
    if (!confirm(t.confirmDelete)) return
    await fetch(`/api/keys?id=${id}`, { method: 'DELETE' })
    load()
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text)
    setCopied(text)
    setTimeout(() => setCopied(''), 1500)
  }

  const base = typeof window !== 'undefined' ? window.location.origin : 'https://example.com'
  const fmt = (d: string | null) => (d ? new Date(d).toLocaleString(isFa ? 'fa-IR' : 'en-US') : '—')

  const examples: [string, string][] = [
    ['GET /api/v1/me', `curl ${base}/api/v1/me -H "Authorization: Bearer <key>"`],
    ['GET /api/v1/subscriptions', `curl ${base}/api/v1/subscriptions -H "Authorization: Bearer <key>"`],
    ['GET /api/v1/wallet', `curl ${base}/api/v1/wallet -H "Authorization: Bearer <key>"`],
    ['POST /api/v1/subscriptions/{id}/disable', `curl -X POST ${base}/api/v1/subscriptions/12/disable -H "Authorization: Bearer <key>"`],
    ['POST /api/v1/subscriptions/{id}/rotate', `curl -X POST ${base}/api/v1/subscriptions/12/rotate -H "Authorization: Bearer <key>"`],
    ['POST /api/v1/subscriptions/{id}/renew', `curl -X POST ${base}/api/v1/subscriptions/12/renew -H "Authorization: Bearer <key>"`],
    ['GET /api/v1/subscriptions/{id}/devices', `curl ${base}/api/v1/subscriptions/12/devices -H "Authorization: Bearer <key>"`],
    ['DELETE /api/v1/subscriptions/{id}/devices?hwid=...', `curl -X DELETE "${base}/api/v1/subscriptions/12/devices?hwid=abc" -H "Authorization: Bearer <key>"`],
    ['POST /api/v1/wallet { "amount": 25 }', `curl -X POST ${base}/api/v1/wallet -H "Authorization: Bearer <key>" -H "Content-Type: application/json" -d '{"amount":25}'`],
  ]

  return (
    <div>
      <div className="appbar">
        <div>
          <h1 className="h2">🔌 {t.apiAccess}</h1>
          <p className="muted">{t.apiSub}</p>
        </div>
      </div>

      <div className="card mb-6">
        <h2 className="h3 mb-3">{t.createKey}</h2>
        <form onSubmit={create} className="flex gap-2 flex-wrap items-end">
          <div className="flex-1" style={{ minWidth: 220 }}>
            <label className="label">{t.keyName}</label>
            <input className="input" placeholder={t.keyNameHint} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <button className="btn btn-primary" disabled={busy}>{busy ? t.loading : `+ ${t.create}`}</button>
        </form>
        {error && <p className="error-text mt-3">{error}</p>}

        {fresh && (
          <div className="card mt-4" style={{ borderColor: 'var(--primary)' }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="badge badge-amber">⚠️ {t.keyShownOnce}</span>
            </div>
            <div className="flex gap-2">
              <input className="input" dir="ltr" readOnly value={fresh} />
              <button className="btn btn-ghost" onClick={() => copy(fresh)}>{copied === fresh ? '✓' : t.copy}</button>
            </div>
          </div>
        )}
      </div>

      <div className="card mb-6">
        <h2 className="h3 mb-4">{t.yourKeys}</h2>
        {loading && <p className="muted">{t.loading}</p>}
        {!loading && keys.length === 0 && <p className="muted">{t.noKeys}</p>}
        {keys.length > 0 && (
          <div className="overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th>{t.keyName}</th>
                  <th>{t.keyPrefix}</th>
                  <th>{t.requests}</th>
                  <th>{t.lastUsed}</th>
                  <th>{t.status}</th>
                  <th>{t.actions}</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id}>
                    <td>{k.name}</td>
                    <td dir="ltr" className="num">{k.prefix}…</td>
                    <td className="num">{k.requests}</td>
                    <td className="num text-xs">{fmt(k.lastUsedAt)}</td>
                    <td>
                      <span className={`badge ${k.active ? 'badge-green' : 'badge-gray'}`}>
                        {k.active ? t.stACTIVE : t.revoked}
                      </span>
                    </td>
                    <td>
                      {k.active && (
                        <button className="badge badge-red" onClick={() => revoke(k.id)}>{t.revoke}</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="h3 mb-1">{t.apiDocs}</h2>
        <p className="muted text-sm mb-4">{t.apiDocsHint}</p>
        <div className="space-y-3">
          {examples.map(([label, cmd]) => (
            <div key={label} className="api-sample">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="badge badge-primary" dir="ltr">{label}</span>
                <button className="btn btn-ghost" onClick={() => copy(cmd)}>{copied === cmd ? '✓' : t.copy}</button>
              </div>
              <pre dir="ltr"><code>{cmd}</code></pre>
            </div>
          ))}
        </div>
        <p className="muted text-xs mt-4">{t.apiRateLimit}</p>
      </div>
    </div>
  )
}
