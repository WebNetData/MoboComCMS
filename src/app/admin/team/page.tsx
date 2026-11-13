'use client'

import { useState } from 'react'
import Link from '@/components/AppLink'
import { Notice, fa, send, useJson } from '../store/shared'
import { staffTemplate } from '@/modules/identity/domain/staff-roles'
import { isFullAccess } from '@/modules/identity/rbac'
import '../roles/roles.css'

type Role = { id: number; name: string; nameFa: string; permissions: string; isSystem: boolean }
type Staff = { id: number; name: string | null; email: string | null; phone: string; status: string; roleId: number | null }
type Account = { id: number; name: string | null; email: string | null; phone: string; role: string; roleId: number | null; status: string }
type Data = { staff: Staff[]; roles: Role[]; me: number }
type Say = { tone: 'ok' | 'error'; text: string } | null

const API = '/api/admin/team'
const who = (person: { name: string | null; email: string | null; phone: string; id: number }) => person.name || person.email || person.phone || `کاربر ${fa(person.id)}`
const roleTitle = (role: Role) => role.nameFa || staffTemplate(role.name)?.title || role.name

/**
 * The team (owner 2026-11-13): everyone who works in the Admin, by role. An existing account is found by email or
 * mobile and joins with a role; a role changes in place; leaving the staff keeps the account as a member. Making a
 * role is on «نقش‌ها و دسترسی کارکنان»; the server applies the same rule as the users page to every change.
 */
export default function TeamPage() {
  const { data, error, loading, reload } = useJson<Data>(API)
  const [say, setSay] = useState<Say>(null)
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<Account | null | undefined>(undefined)
  const [addRole, setAddRole] = useState('')
  const [busy, setBusy] = useState(false)
  const roles = data?.roles || []
  // A full-access role is marked; the server gives it only when a full administrator asks.
  const label = (role: Role) => isFullAccess(role.permissions) ? `${roleTitle(role)} (دسترسی کامل)` : roleTitle(role)

  async function find(event: React.FormEvent) {
    event.preventDefault()
    setSay(null); setFound(undefined)
    const response = await fetch(`${API}?find=${encodeURIComponent(query.trim())}`, { cache: 'no-store' })
    const body = await response.json().catch(() => null)
    if (!response.ok) { setSay({ tone: 'error', text: body?.error || 'جست‌وجو انجام نشد' }); return }
    setFound(body.account)
  }
  async function act(method: 'POST' | 'PATCH' | 'DELETE', body: Record<string, unknown> | null, done: string, url = API) {
    if (busy) return false
    setBusy(true)
    const result = await send(url, method, body || undefined)
    setBusy(false)
    if (!result.ok) { setSay({ tone: 'error', text: result.error }); return false }
    setSay({ tone: 'ok', text: done }); void reload(); return true
  }

  const groups = [...roles.map(role => ({ key: String(role.id), title: roleTitle(role), role, people: (data?.staff || []).filter(person => person.roleId === role.id) })),
    { key: 'none', title: 'بدون نقش (دسترسی کامل)', role: null as Role | null, people: (data?.staff || []).filter(person => person.roleId == null) }]
    .filter(group => group.people.length)

  return <div className="sa rl" dir="rtl">
    <header className="sa-head">
      <div><h1>کارکنان</h1><p className="sa-hint">همهٔ کسانی که در پنل کار می‌کنند، با نقششان. هر کس فقط بخش‌هایی را می‌بیند که نقشش اجازه می‌دهد.</p></div>
      <div className="sa-head-actions"><Link className="btn btn-ghost" href="/admin/roles">نقش‌ها و دسترسی کارکنان</Link><Link className="btn btn-ghost" href="/admin/section-managers">مدیران و نویسندگان بخش‌ها</Link></div>
    </header>
    {say && <Notice tone={say.tone}>{say.text}</Notice>}

    <section className="sa-card" aria-labelledby="tm-add">
      <header className="sa-card-head"><h2 id="tm-add">افزودن کارمند</h2><small>حساب کاربری باید از قبل وجود داشته باشد</small></header>
      <form className="rl-custom" onSubmit={find}>
        <label className="sa-field"><span>ایمیل یا شمارهٔ موبایل</span><input className="input" dir="ltr" value={query} required onChange={event => { setQuery(event.target.value); setFound(undefined) }} placeholder="09xx… یا name@example.com" /></label>
        <button type="submit" className="btn btn-ghost">پیدا کردن حساب</button>
      </form>
      {found === null && <p className="rl-muted" role="status">حسابی با این مشخصات پیدا نشد. کاربر ابتدا باید در سایت ثبت‌نام کند یا از «همهٔ کاربران و مشتریان» ساخته شود.</p>}
      {found && <div className="tm-found" role="status">
        <p><b>{who(found)}</b> <span className="rl-muted">{[found.email, found.phone].filter(Boolean).join(' · ')}</span></p>
        {found.role === 'ADMIN' ? <p className="rl-muted">این کاربر همین حالا جزو کارکنان است؛ نقشش را در فهرست پایین تغییر دهید.</p>
          : found.status !== 'ACTIVE' ? <p className="rl-muted">حساب این کاربر فعال نیست.</p>
          : <div className="rl-custom">
            <label className="sa-field"><span>نقش</span><select className="input" value={addRole} onChange={event => setAddRole(event.target.value)}>
              <option value="">نقش را انتخاب کنید</option>
              {roles.map(role => <option key={role.id} value={role.id}>{label(role)}</option>)}
            </select></label>
            <button type="button" className="btn btn-primary" disabled={!addRole || busy} onClick={async () => { if (await act('POST', { userId: found.id, roleId: Number(addRole) }, `${who(found)} به کارکنان اضافه شد.`)) { setFound(undefined); setQuery(''); setAddRole('') } }}>افزودن به کارکنان</button>
          </div>}
        {!roles.length && <p className="rl-muted">هنوز نقشی ساخته نشده؛ از <Link href="/admin/roles">نقش‌ها و دسترسی کارکنان</Link> یک نقش آماده اضافه کنید.</p>}
      </div>}
    </section>

    <section className="sa-card" aria-labelledby="tm-list">
      <header className="sa-card-head"><h2 id="tm-list">کارکنان بر اساس نقش</h2><small>{data ? `${fa(data.staff.length)} نفر` : loading ? 'در حال خواندن…' : ''}</small></header>
      {error && <Notice tone="error">{error}</Notice>}
      {groups.map(group => <div key={group.key} className="rl-category">
        <h3>{group.title} <small>{fa(group.people.length)} نفر{group.role ? '' : ' — برای امنیت، به هر کدام یک نقش بدهید'}</small></h3>
        <ul className="tm-people">{group.people.map(person => <li key={person.id}>
          <div><Link href={`/admin/users/${person.id}`}>{who(person)}</Link><small className="rl-muted">{[person.email, person.phone].filter(Boolean).join(' · ')}{person.status !== 'ACTIVE' ? ' · غیرفعال' : ''}</small></div>
          {person.id === data?.me ? <span className="rl-made">حساب خودتان</span> : <div className="tm-actions">
            <select className="input tm-role" aria-label={`نقش ${who(person)}`} value={person.roleId ?? ''} disabled={busy} onChange={event => { const roleId = Number(event.target.value); if (roleId) void act('PATCH', { userId: person.id, roleId }, `نقش ${who(person)} تغییر کرد.`) }}>
              {person.roleId == null && <option value="">بدون نقش (دسترسی کامل)</option>}
              {roles.map(role => <option key={role.id} value={role.id}>{label(role)}</option>)}
            </select>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => { if (window.confirm(`${who(person)} از کارکنان خارج شود؟ حسابش به‌عنوان عضو سایت می‌ماند.`)) void act('DELETE', null, `${who(person)} از کارکنان خارج شد.`, `${API}?userId=${person.id}`) }}>خروج از کارکنان</button>
          </div>}
        </li>)}</ul>
      </div>)}
    </section>
  </div>
}
