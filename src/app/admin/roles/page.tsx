'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import PermissionPicker from './PermissionPicker'
import Link from '@/components/AppLink'
import { parsePermissions } from '@/modules/identity/rbac'
import { STAFF_CATEGORIES, STAFF_ROLE_TEMPLATES, permissionLabel, staffTemplate, type StaffRoleTemplate } from '@/modules/identity/domain/staff-roles'
import { useModuleEnabled } from '@/extensions/client/ExtensionProvider'
import './roles.css'

interface RoleRow {
  id: number
  name: string
  nameFa: string
  nameEn: string
  permissions: string
  isSystem: boolean
  _count?: { users: number }
  users?: { id: number; name: string | null; email: string | null }[]
}
type Notice = { tone: 'ok' | 'error'; text: string } | null

const fa = (value: number) => value.toLocaleString('fa-IR')
const listed = (csv: string) => csv.split(',').map(item => item.trim()).filter(item => item && item !== 'dashboard.view')

/** A role's permissions as names; a long list ends in "and N more". */
function Chips({ permissions, max = 6 }: { permissions: string[]; max?: number }) {
  if (!permissions.length) return <span className="rl-muted">فقط ورود به پنل</span>
  const shown = permissions.slice(0, max)
  return <ul className="rl-chips">{shown.map(permission => <li key={permission}>{permissionLabel(permission)}</li>)}{permissions.length > max && <li className="rl-more">و {fa(permissions.length - max)} دسترسی دیگر</li>}</ul>
}

/**
 * Staff roles (owner 2026-11-13): the team by job. Ready roles (identity/domain/staff-roles) are made in one click and
 * stay editable; a custom role needs only a title. Each role shows what it opens in words and who holds it. Member
 * groups (benefits and site access for customers) are a different thing and live under «گروه‌های اعضا و مشتریان».
 */
export default function AdminRolesPage() {
  const [roles, setRoles] = useState<RoleRow[]>([])
  const [allPerms, setAllPerms] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const [editing, setEditing] = useState<RoleRow | null>(null)
  const [editPerms, setEditPerms] = useState<string[]>([])
  const [custom, setCustom] = useState({ nameFa: '', base: '' })
  const busy = useRef(false)
  const modules = {
    vpn: useModuleEnabled('vpn'), reseller: useModuleEnabled('reseller'), instore: useModuleEnabled('instore'),
    store: useModuleEnabled('store'), livechat: useModuleEnabled('livechat'),
  } as Record<string, boolean>
  // Permissions and ready roles that only serve a switched-off module are not offered; a role keeps what it holds.
  const offered = (permission: string) => (modules.vpn || !['subs.manage', 'panels.manage'].includes(permission)) && (modules.reseller || permission !== 'resellers.manage')
  const usable = (template: StaffRoleTemplate) => !template.module || modules[template.module] !== false

  const load = useCallback(async () => {
    const response = await fetch('/api/admin/roles', { cache: 'no-store' })
    const body = await response.json().catch(() => null)
    if (response.ok) { setRoles(body.roles); setAllPerms(body.allPermissions) } else setNotice({ tone: 'error', text: body?.error || 'نقش‌ها خوانده نشدند' })
    setLoaded(true)
  }, [])
  useEffect(() => { void load() }, [load])

  async function call(method: 'POST' | 'PATCH' | 'DELETE', body?: unknown, query = '') {
    if (busy.current) return null
    busy.current = true
    try {
      const response = await fetch(`/api/admin/roles${query}`, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
      const data = await response.json().catch(() => null)
      if (!response.ok) { setNotice({ tone: 'error', text: data?.error || 'انجام نشد' }); return null }
      return data
    } finally { busy.current = false }
  }

  async function addTemplate(template: StaffRoleTemplate) {
    const role = await call('POST', { template: template.id })
    if (role) { setNotice({ tone: 'ok', text: `نقش «${template.title}» ساخته شد. حالا در صفحهٔ کاربران آن را به کارمند بدهید.` }); void load() }
  }
  async function addCustom(event: React.FormEvent) {
    event.preventDefault()
    const base = staffTemplate(custom.base)
    const role = await call('POST', { nameFa: custom.nameFa, ...(base && !base.fullAccess ? { permissions: ['dashboard.view', ...base.permissions] } : {}) })
    if (role) { setCustom({ nameFa: '', base: '' }); setNotice({ tone: 'ok', text: 'نقش ساخته شد؛ دسترسی‌هایش را انتخاب کنید.' }); await load(); startEdit(role) }
  }
  function startEdit(role: RoleRow) { setEditing(role); setEditPerms(parsePermissions(role.permissions || '')); setNotice(null) }
  async function save() {
    if (!editing) return
    const body = editing.isSystem ? { id: editing.id, nameFa: editing.nameFa, nameEn: editing.nameEn } : { id: editing.id, name: editing.name, permissions: editPerms, nameFa: editing.nameFa, nameEn: editing.nameEn }
    if (await call('PATCH', body)) { setEditing(null); setNotice({ tone: 'ok', text: 'نقش ذخیره شد.' }); void load() }
  }
  async function remove(role: RoleRow) {
    if (!window.confirm(`نقش «${role.nameFa || role.name}» حذف شود؟`)) return
    if (await call('DELETE', undefined, `?id=${role.id}`)) { setNotice({ tone: 'ok', text: 'نقش حذف شد.' }); void load() }
  }

  const made = new Set(roles.map(role => role.name))
  return <div className="sa rl" dir="rtl">
    <header className="sa-head">
      <div><h1>نقش‌ها و دسترسی کارکنان</h1><p className="sa-hint">هر کارمند یک نقش دارد و همان، بخش‌هایی از پنل را که می‌بیند تعیین می‌کند. نقش را در صفحهٔ کاربران به کارمند بدهید. مزایا و دسترسی مشتریان در سایت با «گروه‌های اعضا و مشتریان» است، نه نقش.</p></div>
      <div className="sa-head-actions">
        <Link className="btn btn-ghost" href="/admin/users">دادن نقش به کاربران</Link>
        <Link className="btn btn-ghost" href="/admin/section-managers">مدیران و نویسندگان بخش‌ها</Link>
        <Link className="btn btn-ghost" href="/admin/user-groups">گروه‌های اعضا و مشتریان</Link>
      </div>
    </header>
    {notice && <p className={`sa-notice ${notice.tone === 'error' ? 'is-error' : 'is-ok'}`} role={notice.tone === 'error' ? 'alert' : 'status'}>{notice.text}</p>}

    <section className="sa-card" aria-labelledby="rl-team">
      <header className="sa-card-head"><h2 id="rl-team">نقش‌های تیم شما</h2><small>{loaded ? `${fa(roles.length)} نقش` : 'در حال خواندن…'}</small></header>
      <ul className="rl-roles">{roles.map(role => {
        const template = staffTemplate(role.name)
        const permissions = parsePermissions(role.permissions || '')
        const full = role.permissions.split(',').includes('*') || permissions.length === allPerms.length
        const count = role._count?.users ?? 0
        return <li key={role.id} className={editing?.id === role.id ? 'rl-role is-editing' : 'rl-role'}>
          <div className="rl-role-head">
            <div>
              <h3>{role.nameFa || role.nameEn || role.name}{role.isSystem && <span className="rl-tag">سیستمی</span>}</h3>
              <p className="rl-muted">{template?.job || (full ? 'همهٔ بخش‌ها و دسترسی‌ها' : 'نقش سفارشی')} · <bdi dir="ltr">{role.name}</bdi></p>
            </div>
            <span className="rl-count">{count ? `${fa(count)} نفر` : 'بدون عضو'}</span>
          </div>
          {editing?.id === role.id ? <div className="rl-edit">
            <div className="rl-edit-fields">
              <label className="sa-field"><span>عنوان</span><input className="input" value={editing.nameFa || ''} maxLength={80} onChange={event => setEditing({ ...editing, nameFa: event.target.value })} /></label>
              <label className="sa-field"><span>عنوان انگلیسی</span><input className="input" dir="ltr" value={editing.nameEn || ''} maxLength={80} onChange={event => setEditing({ ...editing, nameEn: event.target.value })} /></label>
              <label className="sa-field"><span>نامک (لاتین)</span><input className="input" dir="ltr" value={editing.name} maxLength={40} disabled={role.isSystem || ['admin', 'reseller'].includes(role.name)} onChange={event => setEditing({ ...editing, name: event.target.value })} /></label>
            </div>
            {role.isSystem ? <p className="rl-muted">نقش سیستمی همهٔ دسترسی‌ها را دارد و فقط عنوانش تغییر می‌کند.</p>
              : <PermissionPicker available={allPerms.filter(permission => offered(permission) || editPerms.includes(permission))} selected={editPerms} labels={Object.fromEntries(allPerms.map(permission => [permission, permissionLabel(permission)]))} onChange={setEditPerms} />}
            <div className="rl-actions"><button type="button" className="btn btn-primary" onClick={save}>ذخیره</button><button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>انصراف</button></div>
          </div> : <>
            {full ? <ul className="rl-chips"><li>همهٔ بخش‌ها و دسترسی‌های سایت</li></ul> : <Chips permissions={listed(role.permissions).filter(permission => permission !== '*')} />}
            {count > 0 && <p className="rl-members">اعضا: {(role.users || []).map((user, at) => <span key={user.id}>{at > 0 && '، '}<Link href={`/admin/users/${user.id}`}>{user.name || user.email || `کاربر ${fa(user.id)}`}</Link></span>)}{count > (role.users?.length || 0) && ` و ${fa(count - (role.users?.length || 0))} نفر دیگر`}</p>}
            <div className="rl-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => startEdit(role)}>ویرایش</button>
              {!role.isSystem && <button type="button" className="btn btn-ghost btn-sm" disabled={count > 0} title={count > 0 ? 'ابتدا نقش اعضای آن را تغییر دهید' : undefined} onClick={() => remove(role)}>حذف</button>}
            </div>
          </>}
        </li>
      })}</ul>
    </section>

    <section className="sa-card" aria-labelledby="rl-ready">
      <header className="sa-card-head"><h2 id="rl-ready">نقش‌های آماده</h2><small>با یک کلیک ساخته می‌شود و بعداً قابل ویرایش است</small></header>
      {STAFF_CATEGORIES.map(category => {
        const templates = STAFF_ROLE_TEMPLATES.filter(template => template.category === category.id && usable(template))
        if (!templates.length) return null
        return <div key={category.id} className="rl-category">
          <h3>{category.title} <small>{category.hint}</small></h3>
          <ul className="rl-templates">{templates.map(template => <li key={template.id}>
            <b>{template.title}</b>
            <p>{template.job}</p>
            {template.fullAccess ? <ul className="rl-chips"><li>همهٔ بخش‌ها و دسترسی‌های سایت</li></ul> : <Chips permissions={[...template.permissions]} max={4} />}
            {made.has(template.id) ? <span className="rl-made">ساخته شده</span> : <button type="button" className="btn btn-ghost btn-sm" onClick={() => addTemplate(template)}>افزودن این نقش</button>}
          </li>)}</ul>
        </div>
      })}
    </section>

    <section className="sa-card" aria-labelledby="rl-custom">
      <header className="sa-card-head"><h2 id="rl-custom">نقش سفارشی</h2><small>برای کاری که در نقش‌های آماده نیست</small></header>
      <form className="rl-custom" onSubmit={addCustom}>
        <label className="sa-field"><span>عنوان نقش</span><input className="input" value={custom.nameFa} maxLength={80} required placeholder="مثلاً کارشناس انبار" onChange={event => setCustom({ ...custom, nameFa: event.target.value })} /></label>
        <label className="sa-field"><span>شروع از دسترسی‌های</span><select className="input" value={custom.base} onChange={event => setCustom({ ...custom, base: event.target.value })}>
          <option value="">هیچ (خودم انتخاب می‌کنم)</option>
          {STAFF_ROLE_TEMPLATES.filter(template => !template.fullAccess && usable(template)).map(template => <option key={template.id} value={template.id}>{template.title}</option>)}
        </select></label>
        <button type="submit" className="btn btn-primary">ساختن و انتخاب دسترسی‌ها</button>
      </form>
    </section>
  </div>
}
