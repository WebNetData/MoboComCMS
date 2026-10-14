'use client'

import { useEffect, useState } from 'react'
import type { Gateway, Person } from './desk'

/** Gateways, loaded once for the forms of the desk. */
export function useGateways() {
  const [gateways, setGateways] = useState<Gateway[]>([])
  useEffect(() => {
    let live = true
    fetch('/api/admin/gateways').then((r) => (r.ok ? r.json() : { gateways: [] })).catch(() => ({ gateways: [] }))
      .then((g) => { if (live) setGateways((g.gateways || []).filter((x: Gateway) => x.active !== false)) }).catch(() => undefined)
    return () => { live = false }
  }, [])
  return gateways
}

/** Finds a customer by name or e-mail, asking the server as the admin types. */
export function CustomerPicker({ value, onChange }: { value: Person | null; onChange: (person: Person | null) => void }) {
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<Person[]>([])
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const q = query.trim()
    if (!q) { setMatches([]); return }
    let live = true
    setBusy(true)
    const timer = setTimeout(() => {
      fetch(`/api/admin/users?slim=1&q=${encodeURIComponent(q)}`).then((r) => (r.ok ? r.json() : { users: [] })).catch(() => ({ users: [] }))
        .then((data) => { if (live) setMatches((data.users || []).slice(0, 8)) }).catch(() => undefined).finally(() => { if (live) setBusy(false) })
    }, 250)
    return () => { live = false; clearTimeout(timer) }
  }, [query])
  if (value) return <div className="ivd-chosen"><span className="ivd-avatar">{(value.name || value.email).slice(0, 1).toUpperCase()}</span><div><b>{value.name || '—'}</b><small dir="ltr">{value.email}</small></div><button type="button" className="ivd-link" onClick={() => { onChange(null); setQuery('') }}>تغییر</button></div>
  return <div className="ivd-picker">
    <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="نام یا ایمیل مشتری را بنویسید…" aria-label="جست‌وجوی مشتری" />
    {matches.length > 0 && <ul role="listbox">{matches.map((person) => <li key={person.id}><button type="button" onClick={() => onChange({ id: person.id, email: person.email, name: person.name })}><span className="ivd-avatar">{(person.name || person.email).slice(0, 1).toUpperCase()}</span><span><b>{person.name || '—'}</b><small dir="ltr">{person.email} · #{person.id}</small></span></button></li>)}</ul>}
    {query.trim() && !busy && !matches.length && <p className="ivd-hint">کاربری با این مشخصات پیدا نشد.</p>}
  </div>
}
