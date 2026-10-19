'use client'

import { useCallback, useEffect, useState, useRef } from 'react'
import { ROLE_PRESET_LABELS } from '@/modules/identity/rbac'
import { useI18n } from '@/i18n/LocaleProvider'
import { useModuleEnabled } from '@/extensions/client/ExtensionProvider'

interface RoleRow {
  id: number
  name: string
  nameFa: string
  nameEn: string
  permissions: string
  isSystem: boolean
  _count?: { users: number }
}

const PERM_LABELS: Record<string, string> = {
  'dashboard.view': 'داشبورد',
  'users.manage': 'کاربران و CRM',
  'subs.manage': 'اشتراک‌ها',
  'orders.manage': 'سفارش‌ها',
  'plans.manage': 'پلن‌ها',
  'panels.manage': 'پنل‌های VPN',
  'tickets.handle': 'تیکت‌ها',
  'tickets.departments.manage': 'دپارتمان‌های تیکت',
  'settings.manage': 'تنظیمات',
  'cms.pages': 'صفحه‌ها',
  'forms.handle': 'پاسخ‌ها و درخواست‌های فرم',
  'automation.manage': 'اتوماسیون',
  'cms.posts': 'مجله (نوشته‌ها و دیدگاه‌ها)',
  'cms.products': 'محصولات',
  'roles.manage': 'نقش‌ها',
  'media.manage': 'کتابخانهٔ رسانه',
  'imports.manage': 'ورود گروهی',
  'audit.view': 'گزارش فعالیت‌ها',
  'cinema.manage': 'فیلم و سریال',
  'extensions.code': 'کد افزونه و قالب',
  'finance.manage': 'مدیریت مالی',
  'forum.moderate': 'نظارت تالار',
  'games.manage': 'بازی‌ها',
  'gateways.manage': 'درگاه‌های پرداخت',
  'invoices.manage': 'فاکتورها',
  'music.manage': 'موزیک',
  'resellers.manage': 'نمایندگان فروش',
  'reviews.moderate': 'نظارت نظرها',
  'software.manage': 'نرم‌افزار',
}

export default function AdminRolesPage() {
  const { t } = useI18n()
  const [roles, setRoles] = useState<RoleRow[]>([])
  const [allPerms, setAllPerms] = useState<string[]>([])
  const [presets, setPresets] = useState<Record<string, string[]>>({})
  const vpnOn = useModuleEnabled('vpn')
  const resellerOn = useModuleEnabled('reseller')
  // Permissions and presets that only serve a switched-off module are not offered; a role keeps what it already has.
  const offered = (permission: string) => (vpnOn || !['subs.manage', 'panels.manage'].includes(permission)) && (resellerOn || permission !== 'resellers.manage')
  const [form, setForm] = useState({ name: '', nameFa: '', preset: '' })
  const [editing, setEditing] = useState<RoleRow | null>(null)
  const [editPerms, setEditPerms] = useState<string[]>([])
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/roles')
    if (res.ok) {
      const d = await res.json()
      setRoles(d.roles)
      setAllPerms(d.allPermissions)
      setPresets(d.presets)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const createRunning = useRef(false)
  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (createRunning.current) return
    createRunning.current = true
    try {
      setMsg('')
      const res = await fetch('/api/admin/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const d = await res.json().catch(() => null)
      if (!res.ok) { setMsg(d?.error || t.errGeneric); return }
      setForm({ name: '', nameFa: '', preset: '' })
      load()
    
    } finally { createRunning.current = false }
  }

  function startEdit(r: RoleRow) {
    setEditing(r)
    setEditPerms(r.permissions ? r.permissions.split(',').filter(Boolean) : [])
  }

  function togglePerm(p: string) {
    setEditPerms((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]))
  }

  const savePermsRunning = useRef(false)
  async function savePerms() {
    if (savePermsRunning.current) return
    savePermsRunning.current = true
    try {
      if (!editing) return
      setMsg('')
      const res = await fetch('/api/admin/roles', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        // A system role keeps its permissions and slug; its titles can still be changed.
        body: JSON.stringify(editing.isSystem ? { id: editing.id, nameFa: editing.nameFa, nameEn: editing.nameEn } : { id: editing.id, name: editing.name, permissions: editPerms, nameFa: editing.nameFa, nameEn: editing.nameEn }),
      })
      const d = await res.json().catch(() => null)
      if (!res.ok) { setMsg(d?.error || t.errGeneric); return }
      setEditing(null)
      load()
    
    } finally { savePermsRunning.current = false }
  }

  async function remove(id: number) {
    if (!confirm(t.confirmDelete)) return
    const res = await fetch(`/api/admin/roles?id=${id}`, { method: 'DELETE' })
    const d = await res.json().catch(() => null)
    if (!res.ok) setMsg(d?.error || t.errGeneric)
    load()
  }

  return (
    <div>
      <h1 className="h2 mb-2">{t.rolesPermissions}</h1>
      <p className="muted mb-6">{t.panelsHint ? '' : ''}نقش‌ها را بسازید و برای هر بخش سایت دسترسی تعیین کنید: پشتیبان، حسابدار، ادمین و…</p>

      {msg && <p className="error-text mb-4">{msg}</p>}

      <form onSubmit={create} className="card mb-6 grid-4 items-end">
        <div>
          <label className="label" htmlFor="new-role-slug">{t.slug} (حروف لاتین)</label>
          <input id="new-role-slug" className="input" dir="ltr" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div>
          <label className="label" htmlFor="new-role-title">{t.title}</label>
          <input id="new-role-title" className="input" value={form.nameFa} onChange={(e) => setForm({ ...form, nameFa: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="new-role-preset">الگوی آماده</label>
          <select id="new-role-preset" className="select" value={form.preset} onChange={(e) => setForm({ ...form, preset: e.target.value })}>
            <option value="">—</option>
            {Object.keys(presets).filter((p) => resellerOn || p !== 'reseller').map((p) => (
              <option key={p} value={p}>{ROLE_PRESET_LABELS[p] || p}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn btn-primary">{t.add}</button>
      </form>

      <div className="grid-2">
        {roles.map((r) => (
          <div key={r.id} className={`card ${editing?.id === r.id ? 'border-[var(--primary)] border-var' : ''}`}>
            <div className="flex items-center justify-between mb-3 gap-2">
              <div>
                <h3 className="font-bold flex items-center gap-2">
                  {r.nameFa || r.nameEn || r.name} {r.isSystem && <span className="badge badge-gray">{t.system}</span>}
                </h3>
                <div className="muted text-xs" dir="ltr">{r.name}</div>
              </div>
              <span className="badge badge-purple num">{r._count?.users ?? 0} {t.users}</span>
            </div>

            {editing?.id === r.id ? (
              <>
                <div className="role-edit">
                  <label><span className="label">{t.slug} (حروف لاتین)</span><input className="input" dir="ltr" value={editing.name} disabled={r.isSystem || ['admin', 'reseller'].includes(r.name)} maxLength={40} onChange={(e) => setEditing({ ...editing, name: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} /></label>
                  <label><span className="label">{t.title}</span><input className="input" value={editing.nameFa || ''} maxLength={80} onChange={(e) => setEditing({ ...editing, nameFa: e.target.value })} /></label>
                  <label><span className="label">عنوان انگلیسی</span><input className="input" dir="ltr" value={editing.nameEn || ''} maxLength={80} onChange={(e) => setEditing({ ...editing, nameEn: e.target.value })} /></label>
                </div>
                {r.isSystem && <p className="muted text-xs mb-3">این نقش سیستمی است: دسترسی‌ها و نامکش ثابت است و فقط عنوانش تغییر می‌کند.</p>}
                <div className="grid-2 mb-4" hidden={r.isSystem}>
                  {allPerms.filter((p) => offered(p) || editPerms.includes(p)).map((p) => (
                    <label key={p} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={editPerms.includes(p)} onChange={() => togglePerm(p)} />
                      {PERM_LABELS[p] || p}
                    </label>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button className="btn btn-primary flex-1" onClick={savePerms}>{t.save}</button>
                  <button className="btn btn-ghost" onClick={() => setEditing(null)}>{t.cancel}</button>
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-wrap gap-1 mb-3">
                  {(r.permissions || '').split(',').filter(Boolean).map((p) => (
                    <span key={p} className="badge badge-gray">{PERM_LABELS[p] || p}</span>
                  ))}
                  {!r.permissions && <span className="muted text-xs">—</span>}
                </div>
                <div className="flex gap-2">
                  <button className="btn btn-ghost !py-1.5 flex-1" onClick={() => startEdit(r)}>✏️ {t.edit}</button>
                  <button className="btn btn-danger !py-1.5" disabled={r.isSystem} onClick={() => remove(r.id)}>{t.delete}</button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
