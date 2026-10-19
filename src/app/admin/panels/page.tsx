'use client'

import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '@/i18n/LocaleProvider'
import { getCookie } from '@/platform/browser/preferences'
import { PANEL_TYPES, panelTypeMeta } from '@/modules/providers/domain/panel-types'

interface PanelRow {
  id: number
  name: string
  type: string
  url: string
  token: string
  hasPassword: boolean
  inbounds: string
  internalSquads: string
  config: string
  active: boolean
}

interface GroupRow {
  id: string
  name: string
  inboundsCount?: number
}

const EMPTY = { name: '', type: 'REMNAWAVE', url: '', token: '', password: '', inbounds: '', internalSquads: '', config: '{}', active: true }

export default function AdminPanelsPage() {
  const { t } = useI18n()
  const theme = getCookie('theme') || 'dark'
  const [panels, setPanels] = useState<PanelRow[]>([])
  const [form, setForm] = useState<any>(EMPTY)
  const [editId, setEditId] = useState<number | null>(null)
  const [msg, setMsg] = useState('')
  const [msgOk, setMsgOk] = useState(false)
  const [testing, setTesting] = useState<number | null>(null)
  const [testedOkId, setTestedOkId] = useState<number | null>(null)
  const [groups, setGroups] = useState<GroupRow[]>([])
  const [groupsBusy, setGroupsBusy] = useState(false)
  const [groupMsg, setGroupMsg] = useState('')

  const isRemna = form.type !== 'PASARGUARD'

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/panels')
    if (res.ok) setPanels(await res.json())
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setMsg('')
    const res = await fetch('/api/admin/panels', {
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
    setForm(EMPTY)
    setEditId(null)
    setGroups([])
    setGroupMsg('')
    load()
  }

  /**
   * Reads the panel groups (Remnawave squads / PasarGuard groups) straight from
   * the panel — works for the saved panel and for values not saved yet.
   */
  async function loadGroups(overrides: Record<string, unknown> = {}) {
    setGroupsBusy(true)
    setGroupMsg('')
    const res = await fetch('/api/admin/panels/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, id: editId, ...overrides }),
    }).catch(() => null)
    const data = await res?.json().catch(() => null)
    setGroupsBusy(false)
    if (!res?.ok) {
      setGroups([])
      setGroupMsg(data?.error || t.errGeneric)
      return
    }
    const rows: GroupRow[] = Array.isArray(data?.groups) ? data.groups : []
    setGroups(rows)
    if (!rows.length) setGroupMsg(t.noGroupsOnPanel)
  }

  function toggleGroup(id: string) {
    const current = String(form.internalSquads || '')
      .split(',')
      .map((s: string) => s.trim())
      .filter(Boolean)
    const next = current.includes(id) ? current.filter((s: string) => s !== id) : [...current, id]
    setForm({ ...form, internalSquads: next.join(', ') })
  }

  async function toggleActive(p: PanelRow) {
    setMsg('')
    setTestedOkId(null)
    const res = await fetch('/api/admin/panels', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: p.id, active: !p.active }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setMsgOk(false)
      setMsg(data?.error || t.errGeneric)
      return
    }
    setMsgOk(true)
    setMsg(`${p.name}: ${!p.active ? t.panelActive : t.panelInactive}`)
    load()
  }

  async function testConnection(id: number) {
    setTesting(id)
    setMsg('')
    setTestedOkId(null)
    const res = await fetch('/api/admin/panels', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    const data = await res.json().catch(() => null)
    setTesting(null)
    setMsgOk(Boolean(data?.ok))
    setTestedOkId(data?.ok ? id : null)
    setMsg(data?.ok ? t.connOk : `${t.connFail} ${data?.message || data?.error || ''}`)
  }

  async function remove(id: number) {
    if (!confirm(t.confirmDelete)) return
    const res = await fetch(`/api/admin/panels?id=${id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setMsgOk(false)
      setMsg(data?.error || t.errGeneric)
    }
    load()
  }

  return (
    <div>
      <h1 className="h2 mb-2">{t.panelsAdmin}</h1>
      <p className="muted mb-6">{t.panelsHint}</p>

      <form onSubmit={save} className="card mb-6 grid-3 items-end">
        <div>
          <label className="label-field"><span className="label">{t.panelName}</span>
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
        </div>
        <div>
          <label className="label-field"><span className="label">{t.panelType}</span>
          <select className="select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {PANEL_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select></label>
        </div>
        <div>
          <label className="label-field"><span className="label">{t.panelUrl}</span>
          <input className="input" dir="ltr" placeholder="https://panel.example.com" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} required /></label>
        </div>
        <div>
          <label className="label-field"><span className="label">{form.type === 'REMNAWAVE' ? t.remnaToken : t.pasarUser}</span>
          <input
            className="input"
            dir="ltr"
            value={form.token}
            onChange={(e) => setForm({ ...form, token: e.target.value })}
            placeholder={editId ? t.leaveEmptyNoChange : ''}
            required={!editId}
          /></label>
        </div>
        {form.type === 'PASARGUARD' && (
          <div>
            <label className="label-field"><span className="label">{t.adminPass}</span>
            <input className="input" dir="ltr" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
          </div>
        )}
        {form.type === 'PASARGUARD' && (
          <div>
            <label className="label-field"><span className="label">{t.inbounds}</span>
            <input
              className="input"
              dir="ltr"
              placeholder="vless:VLESS-REALITY,vmess:VMess-WS"
              value={form.inbounds}
              onChange={(e) => setForm({ ...form, inbounds: e.target.value })}
            /></label>
            <p className="muted text-xs mt-2">{t.inboundsPasarHint}</p>
          </div>
        )}
        <div style={{ gridColumn: '1 / -1' }}>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="label">{isRemna ? t.internalSquads : t.inboundGroups}</span>
            <button
              type="button"
              className="btn btn-ghost imp-py-1-5"
              disabled={groupsBusy || !form.url}
              onClick={() => loadGroups()}
            >
              {groupsBusy ? t.testing : `🔎 ${isRemna ? t.loadSquads : t.loadGroups}`}
            </button>
          </div>
          <input
            className="input"
            dir="ltr"
            placeholder={isRemna ? 'uuid یا نام اسکواد، با کاما' : 'نام گروه یا شناسه آن، با کاما'}
            value={form.internalSquads}
            onChange={(e) => setForm({ ...form, internalSquads: e.target.value })}
          />
          <p className="muted text-xs mt-2">{isRemna ? t.internalSquadsHint : t.inboundGroupsHint}</p>
          {groups.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {groups.map((g) => {
                const on = String(form.internalSquads || '')
                  .split(',')
                  .map((x: string) => x.trim())
                  .includes(g.id)
                return (
                  <button
                    type="button"
                    key={g.id}
                    className={`badge ${on ? 'badge-green' : 'badge-gray'}`}
                    onClick={() => toggleGroup(g.id)}
                  >
                    {on ? '✓ ' : ''}
                    {g.name || g.id}
                    {g.inboundsCount != null ? ` (${g.inboundsCount})` : ''}
                  </button>
                )
              })}
            </div>
          )}
          {groupMsg && <p className="error-text text-xs mt-2">{groupMsg}</p>}
        </div>
        <div>
          <span className="label">{t.active}</span>
          <label className="flex items-center gap-2 panel-toggle">
            <input
              type="checkbox"
              checked={form.active !== false}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            <span className="text-sm">{t.activeOnSave}</span>
          </label>
        </div>
        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary flex-1">{editId ? t.save : t.addPanel}</button>
          {editId && <button type="button" className="btn btn-ghost" onClick={() => { setEditId(null); setForm(EMPTY) }}>{t.cancel}</button>}
        </div>
      </form>
      {msg && (
        <div className="flex items-center gap-3 flex-wrap mb-4">
          <p className={msgOk ? 'success-text' : 'error-text'}>{msg}</p>
          {testedOkId !== null && panels.some((p) => p.id === testedOkId && !p.active) && (
            <button type="button" className="btn btn-primary imp-py-1-5" onClick={() => toggleActive(panels.find((p) => p.id === testedOkId)!)}>
              ▶ {t.activatePanel}
            </button>
          )}
        </div>
      )}

      <div className="grid-2">
        {panels.map((p) => (
          <div key={p.id} className={`card ${!p.active ? 'opacity-50' : ''}`}>
            <div className="flex items-center justify-between mb-3 gap-2">
              <div>
                <h3 className="font-bold flex items-center gap-2">
                  {panelTypeMeta(p.type).icon} {p.name}
                  <span className="badge badge-gray">{p.type}</span>
                </h3>
                <a href={p.url} target="_blank" rel="noreferrer" className="muted text-xs" dir="ltr">{p.url}</a>
              </div>
              <span className={`badge ${p.active ? 'badge-green' : 'badge-red'}`}>{p.active ? t.panelActive : t.panelInactive}</span>
            </div>
            <div className="muted text-xs mb-3" dir="ltr">token: {p.token || '-'} {p.hasPassword ? '(+password)' : ''}</div>
            <div className="muted text-xs mb-3">
              {p.type === 'REMNAWAVE' ? t.internalSquads : t.inboundGroups}:{' '}
              {p.internalSquads || (p.type === 'REMNAWAVE' ? t.noSquadsSelected : t.noGroupsSelected)}
            </div>
            <div className="flex gap-2 flex-wrap">
              <button className="btn btn-ghost imp-py-1-5" disabled={testing === p.id} onClick={() => testConnection(p.id)}>
                {testing === p.id ? t.testing : `🔌 ${t.testConn}`}
              </button>
              <button
                className="btn btn-ghost imp-py-1-5"
                onClick={() => {
                  setEditId(p.id)
                  setForm({
                    name: p.name,
                    type: p.type,
                    url: p.url,
                    token: '',
                    password: '',
                    inbounds: p.inbounds || '',
                    internalSquads: p.internalSquads || '',
                    config: p.config || '{}',
                    active: p.active,
                  })
                  setGroups([])
                  setGroupMsg('')
                  loadGroups({ id: p.id, type: p.type, url: p.url, token: '', password: '' })
                }}
              >
                ✏️ {t.edit}
              </button>
              <button className="btn btn-ghost imp-py-1-5" onClick={() => toggleActive(p)}>
                {p.active ? `⏸ ${t.deactivate}` : `▶ ${t.activatePanel}`}
              </button>
              <button className="btn btn-danger imp-py-1-5" onClick={() => remove(p.id)}>{t.delete}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
