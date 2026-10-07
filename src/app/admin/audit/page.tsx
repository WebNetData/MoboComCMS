'use client'

import { useEffect, useState } from 'react'

interface AuditRow {
  id: number
  actorUserId: number
  actorEmail: string
  action: string
  targetType: string
  targetId: string
  requestId: string
  ip: string
  metadata: Record<string, unknown>
  createdAt: string
}

export default function AdminAuditPage() {
  const [rows, setRows] = useState<AuditRow[]>([])
  const [cursor, setCursor] = useState<number | null>(null)
  const [nextCursor, setNextCursor] = useState<number | null>(null)
  const [action, setAction] = useState('')
  const initial = typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search)
  const [targetType, setTargetType] = useState(initial.get('targetType') || '')
  const [targetId, setTargetId] = useState(initial.get('targetId') || '')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [loading, setLoading] = useState(true)

  async function load(next: number | null = null) {
    setLoading(true)
    const sp = new URLSearchParams({ take: '50' })
    if (next) sp.set('cursor', String(next))
    if (action.trim()) sp.set('action', action.trim())
    if (targetType.trim()) sp.set('targetType', targetType.trim())
    if (targetId.trim()) sp.set('targetId', targetId.trim())
    if (from) sp.set('from', from)
    if (to) sp.set('to', to)
    const res = await fetch(`/api/admin/audit?${sp.toString()}`, { cache: 'no-store' })
    const body = res.ok ? await res.json() : null
    setRows(body?.items || [])
    setNextCursor(body?.nextCursor || null)
    setCursor(next)
    setLoading(false)
  }

  useEffect(() => { void load(null) }, [])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Audit log</h1>
        <p className="muted mt-1">Privileged changes with actor, request ID and sanitized metadata.</p>
      </div>

      <form className="card p-4 grid md:grid-cols-[1fr_1fr_auto] gap-3" onSubmit={(e) => { e.preventDefault(); void load(null) }}>
        <input className="input" value={action} onChange={(e) => setAction(e.target.value)} placeholder="Action, e.g. invoice.refund" />
        <input className="input" value={targetType} onChange={(e) => setTargetType(e.target.value)} placeholder="Target type, e.g. invoice" />
        <input className="input" value={targetId} onChange={(e) => setTargetId(e.target.value)} placeholder="Target id" aria-label="Target id" />
        <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From day" />
        <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To day" />
        <button className="btn btn-primary" type="submit">Filter</button>
      </form>

      <div className="card overflow-x-auto">
        <table className="table min-w-[980px]">
          <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Target</th><th>Request</th><th>IP</th><th>Metadata</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="whitespace-nowrap">{new Date(row.createdAt).toLocaleString()}</td>
                <td><div>{row.actorEmail}</div><div className="muted text-xs">#{row.actorUserId}</div></td>
                <td><code>{row.action}</code></td>
                <td><span>{row.targetType}</span>{row.targetId ? <span className="muted"> #{row.targetId}</span> : null}{row.targetId && /^\d+$/.test(row.targetId) && <> · <a href={`/admin/history?type=${encodeURIComponent(row.targetType)}&id=${row.targetId}`}>versions</a></>}</td>
                <td><code className="text-xs">{row.requestId || '—'}</code></td>
                <td>{row.ip || '—'}</td>
                <td><pre className="text-xs whitespace-pre-wrap max-w-[360px]">{JSON.stringify(row.metadata, null, 2)}</pre></td>
              </tr>
            ))}
            {!loading && rows.length === 0 ? <tr><td colSpan={7} className="muted text-center py-8">No audit events found.</td></tr> : null}
          </tbody>
        </table>
      </div>

      <div className="flex gap-2 justify-end">
        <button className="btn" disabled={!cursor || loading} onClick={() => void load(null)}>Newest</button>
        <button className="btn" disabled={!nextCursor || loading} onClick={() => void load(nextCursor)}>Older</button>
      </div>
    </div>
  )
}
