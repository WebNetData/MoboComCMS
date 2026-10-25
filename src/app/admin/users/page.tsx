'use client'

import { useCallback, useEffect, useState, useRef } from 'react'
import Link from '@/components/AppLink'
import StatusBadge from '@/components/StatusBadge'
import { useI18n } from '@/i18n/LocaleProvider'
import { formatCurrency } from '@/shared/money/client'
import { useModuleEnabled } from '@/extensions/client/ExtensionProvider'

interface UserRow {
  id: number
  email: string
  name: string
  role: string
  roleId: number | null
  roleName: string | null
  status: string
  createdAt: string
  walletBalance?: number
  walletBalances?: { currency: string; balance: number }[]
  orders: number
  subs: number
  tickets: number
}

interface Role {
  id: number
  name: string
  nameFa: string
}

interface Note {
  id: number
  body: string
  createdAt: string
}

export default function AdminUsersPage() {
  const { t, locale } = useI18n()
  const vpnOn = useModuleEnabled('vpn')
  const [users, setUsers] = useState<UserRow[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [q, setQ] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'CUSTOMER', roleId: '' })
  const [generated, setGenerated] = useState('')
  const [selected, setSelected] = useState<UserRow | null>(null)
  const [notes, setNotes] = useState<Note[]>([])
  const [noteText, setNoteText] = useState('')

  const load = useCallback(async (search = '') => {
    const res = await fetch('/api/admin/users?q=' + encodeURIComponent(search))
    if (res.ok) {
      const d = await res.json()
      setUsers(d.users)
      setRoles(d.roles || [])
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const createUserRunning = useRef(false)
  async function createUser(e: React.FormEvent) {
    e.preventDefault()
    if (createUserRunning.current) return
    createUserRunning.current = true
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) return
      if (data?.generatedPassword) setGenerated(data.generatedPassword)
      setNewUser({ name: '', email: '', password: '', role: 'CUSTOMER', roleId: '' })
      setShowNew(false)
      load()
    
    } finally { createUserRunning.current = false }
  }

  async function patch(id: number, payload: object) {
    await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...payload }),
    })
    load(q)
  }

  async function openNotes(u: UserRow) {
    setSelected(u)
    const res = await fetch(`/api/admin/crm-notes?userId=${u.id}`)
    if (res.ok) setNotes(await res.json())
  }

  const addNoteRunning = useRef(false)
  async function addNote(e: React.FormEvent) {
    e.preventDefault()
    if (addNoteRunning.current) return
    addNoteRunning.current = true
    try {
      if (!selected || !noteText.trim()) return
      await fetch('/api/admin/crm-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selected.id, body: noteText }),
      })
      setNoteText('')
      openNotes(selected)
    
    } finally { addNoteRunning.current = false }
  }

  function fmt(d: string) {
    return new Date(d).toLocaleDateString(locale === 'fa' ? 'fa-IR' : 'en-US')
  }

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <h1 className="h2">{t.customers}</h1>
        <div className="flex gap-2">
          <input
            className="input imp-w-56"
            placeholder={t.search}
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              load(e.target.value)
            }}
          />
          <button className="btn btn-primary" onClick={() => setShowNew(!showNew)}>+ {t.newCustomer}</button>
        </div>
      </div>

      {showNew && (
        <form onSubmit={createUser} className="card mb-6 grid-4 items-end">
          <div>
            <label className="label-field"><span className="label">{t.nameLabel}</span>
            <input className="input" value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} /></label>
          </div>
          <div>
            <label className="label-field"><span className="label">{t.emailLabel}</span>
            <input className="input" dir="ltr" type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} required /></label>
          </div>
          <div>
            <label className="label-field"><span className="label">{t.passAuto}</span>
            <input className="input" dir="ltr" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} /></label>
          </div>
          <div className="flex gap-2">
            <select aria-label={t.role} className="select" value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value, roleId: '' })}>
              <option value="CUSTOMER">{t.stCUSTOMER}</option>
              <option value="ADMIN">{t.stADMIN}</option>
            </select>
            {newUser.role === 'ADMIN' && (
              <select aria-label="سطح دسترسی مدیر" className="select" value={newUser.roleId} onChange={(e) => setNewUser({ ...newUser, roleId: e.target.value })}>
                <option value="">{t.stADMIN} ({locale === 'fa' ? 'دسترسی کامل' : 'full'})</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>{r.nameFa || r.name}</option>
                ))}
              </select>
            )}
            <button type="submit" className="btn btn-primary">{t.create}</button>
          </div>
        </form>
      )}
      {generated && (
        <div className="card mb-6 success-text">
          {t.generatedPass} <code className="font-bold">{generated}</code> — {t.copyIt}
        </div>
      )}

      <div className={`crm-layout${selected ? ' has-notes' : ''}`}>
        <div className="card overflow-x-auto">
          <table className="data crm-table">
            <thead>
              <tr>
                <th>#</th>
                <th>{t.emailLabel}</th>
                <th>{t.nameLabel}</th>
                <th>{t.role}</th>
                <th>{t.status}</th>
                <th>{t.walletBalance}</th>
                <th>{t.ordersShort}</th>
                {vpnOn && <th>{t.subsShort}</th>}
                <th>{t.actions}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="num crm-id">{u.id}</td>
                  <td dir="ltr" className="crm-email"><Link href={`/admin/users/${u.id}`} className="font-semibold" style={{ color: 'var(--admin-accent-text)' }}>{u.email}</Link></td>
                  <td className="crm-name"><Link href={`/admin/users/${u.id}`} className="font-semibold" style={{ color: 'var(--admin-accent-text)' }}>{u.name || '—'}</Link></td>
                  <td data-label={t.role}>
                    {u.role === 'ADMIN' ? (
                      <select
                        aria-label={`${locale === 'fa' ? 'نقش' : 'Role'} ${u.name || u.email}`}
                        className="select !min-h-0 !py-1"
                        style={{ minWidth: 120, fontSize: '0.8rem' }}
                        value={u.roleId || ''}
                        onChange={(e) => patch(u.id, { roleId: e.target.value ? Number(e.target.value) : null })}
                      >
                        <option value="">{t.stADMIN} ({locale === 'fa' ? 'دسترسی کامل' : 'full'})</option>
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>{r.nameFa || r.name}</option>
                        ))}
                      </select>
                    ) : (
                      <StatusBadge value={u.role} />
                    )}
                  </td>
                  <td data-label={t.status}><StatusBadge value={u.status} /></td>
                  <td className="num" data-label={t.walletBalance}>{u.walletBalances?.length ? u.walletBalances.map((b) => formatCurrency(b.balance, b.currency, locale === 'fa' ? 'fa-IR' : 'en-US')).join(' · ') : '—'}</td>
                  <td className="num" data-label={t.ordersShort}>{u.orders}</td>
                  {vpnOn && <td className="num" data-label={t.subsShort}>{u.subs}</td>}
                  <td className="crm-actions">
                    <div className="flex gap-1">
                      <Link href={`/admin/users/${u.id}`} className="badge badge-primary">{t.manageCustomer}</Link>
                      <button
                        className="badge badge-gray"
                        onClick={() => patch(u.id, { status: u.status === 'BANNED' ? 'ACTIVE' : 'BANNED' })}
                      >
                        {u.status === 'BANNED' ? t.unban : t.ban}
                      </button>
                      <button className="badge badge-purple" onClick={() => openNotes(u)}>{t.viewNotes}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card self-start crm-notes">
          {selected && (
            <>
              <div className="crm-notes-head"><h3 className="font-bold mb-1">{selected.name || selected.email}</h3><button type="button" className="crm-notes-close" aria-label={locale === 'fa' ? 'بستن یادداشت‌ها' : 'Close notes'} onClick={() => setSelected(null)}>×</button></div>
              <p className="muted mb-4">
                <span className="num">{selected.orders}</span> {t.ordersShort}{vpnOn && <> · <span className="num">{selected.subs}</span> {t.subsShort}</>} · <span className="num">{selected.tickets}</span> {t.ticketsShort}
              </p>
              <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
                {notes.length === 0 && <p className="muted">{t.noNotes}</p>}
                {notes.map((n) => (
                  <div key={n.id} className="rounded-lg border border-var p-2 text-sm">
                    {n.body}
                    <div className="muted mt-1">{fmt(n.createdAt)}</div>
                  </div>
                ))}
              </div>
              <form onSubmit={addNote}>
                <textarea className="textarea mb-2" rows={3} placeholder={t.addNote} value={noteText} onChange={(e) => setNoteText(e.target.value)} />
                <button type="submit" className="btn btn-primary w-full">{t.saveNote}</button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
