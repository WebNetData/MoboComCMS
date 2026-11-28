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
    try {
      const res = await fetch('/api/keys', { cache: 'no-store' })
      if (!res.ok) throw new Error()
      setKeys((await res.json()).keys || [])
    } catch {
      setError(t.errGeneric)
    } finally {
      setLoading(false)
    }
  }, [t.errGeneric])

  useEffect(() => {
    load()
  }, [load])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) {
        const failure = await res.json().catch(() => null)
        throw new Error(failure?.error || t.errGeneric)
      }
      const data = await res.json()
      setFresh(data.key.token)
      setName('')
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.errGeneric)
    } finally {
      setBusy(false)
    }
  }

  async function revoke(id: number) {
    if (!confirm(t.confirmDelete)) return
    setError('')
    try {
      const res = await fetch(`/api/keys?id=${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      await load()
    } catch {
      setError(t.errGeneric)
    }
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text)
    setCopied(text)
    setTimeout(() => setCopied(''), 1500)
  }

  const fmt = (d: string | null) => (d ? new Date(d).toLocaleString(isFa ? 'fa-IR' : 'en-US') : '—')

  return (
    <div>
      <div className="appbar">
        <div>
          <h1 className="h2">{isFa ? 'مدیریت کلیدهای اتصال' : 'Manage integration keys'}</h1>
        </div>
      </div>

      <div className="card mb-6">
        <h2 className="h3 mb-3">{t.createKey}</h2>
        <form onSubmit={create} className="flex gap-2 flex-wrap items-end">
          <div className="flex-1" style={{ minWidth: 220 }}>
            <label className="label" htmlFor="api-key-name">{t.keyName}</label>
            <input id="api-key-name" className="input" maxLength={80} placeholder={t.keyNameHint} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? t.loading : `+ ${t.create}`}</button>
        </form>
        {error && <p className="error-text mt-3" role="alert">{error}</p>}

        {fresh && (
          <div className="card mt-4" style={{ borderColor: 'var(--primary)' }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="badge badge-amber">⚠️ {t.keyShownOnce}</span>
            </div>
            <div className="flex gap-2">
              <input className="input" dir="ltr" aria-label={t.keyShownOnce} readOnly value={fresh} />
              <button type="button" className="btn btn-ghost" onClick={() => copy(fresh)}>{copied === fresh ? '✓' : t.copy}</button>
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
                        <button type="button" className="badge badge-red" onClick={() => revoke(k.id)}>{t.revoke}</button>
                      )}
                    </td>
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
