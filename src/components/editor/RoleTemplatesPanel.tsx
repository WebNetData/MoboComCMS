'use client'

import { useEffect, useState } from 'react'

type State = { roles: { id: number; name: string }[]; templates: { id: number; title: string }[]; assignments: Record<string, number> }
const NOUN = { pages: 'صفحهٔ', posts: 'نوشتهٔ' } as const

/**
 * The section manager's table of role defaults: the full template each role's new pages or articles start from.
 * Shown only to whoever may set them (the section's manager); others never see it.
 */
export default function RoleTemplatesPanel({ entity }: { entity: 'pages' | 'posts' }) {
  const [state, setState] = useState<State | null>(null)
  const [busy, setBusy] = useState<number | null>(null)
  const [message, setMessage] = useState('')
  const endpoint = `/api/admin/editor/role-templates?entity=${entity}`

  useEffect(() => {
    let alive = true
    setState(null); setMessage('')
    // Answered only to the section's manager: anyone else gets a refusal and the panel stays hidden.
    const read = async () => {
      try {
        const response = await fetch(endpoint, { cache: 'no-store' })
        if (!response.ok) return
        const body = await response.json() as State
        if (alive) setState(body)
      } catch { /* hidden on failure, like for a non-manager */ }
    }
    void read()
    return () => { alive = false }
  }, [endpoint])

  if (!state) return null
  const choose = async (roleId: number, value: string) => {
    if (busy !== null) return
    setBusy(roleId); setMessage('')
    const patternId = value ? Number(value) : null
    try {
      const response = await fetch(endpoint, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ roleId, patternId }) })
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null
        setMessage(body?.error || `ذخیره نشد (خطا ${response.status})`); return
      }
      setState((current) => {
        if (!current) return current
        const assignments = { ...current.assignments }
        if (patternId === null) delete assignments[roleId]; else assignments[roleId] = patternId
        return { ...current, assignments }
      })
      setMessage('ذخیره شد.')
    } catch { setMessage('ارتباط با سرور برقرار نشد.') } finally { setBusy(null) }
  }

  return (
    <section className="mc-role-templates" aria-labelledby={`role-templates-${entity}`}>
      <h2 id={`role-templates-${entity}`}>قالب پیش‌فرض هر نقش</h2>
      <p className="muted text-sm">هر {NOUN[entity]} تازه‌ای که کسی با این نقش باز کند، به‌جای صفحهٔ خالی با قالب انتخاب‌شده شروع می‌شود. تا نویسنده ذخیره نکند چیزی ثبت نمی‌شود و می‌تواند صفحهٔ خالی را انتخاب کند. مدیر کل نقشی ندارد و همیشه با صفحهٔ خالی شروع می‌کند.</p>
      {!state.templates.length ? <p className="muted text-sm">هنوز «قالب کامل»ی برای این بخش ساخته نشده است. در ویرایشگر، از «الگوها و چیدمان‌ها» چیدمان یک {NOUN[entity]} را به‌عنوان «قالب کامل» ذخیره کنید.</p>
        : !state.roles.length ? <p className="muted text-sm">هیچ نقشی دسترسی نوشتن در این بخش ندارد.</p>
        : (
          <table className="table">
            <thead><tr><th>نقش</th><th>قالب شروع</th></tr></thead>
            <tbody>
              {state.roles.map((role) => (
                <tr key={role.id}>
                  <td>{role.name}</td>
                  <td>
                    <select className="select" aria-label={`قالب پیش‌فرض نقش ${role.name}`} disabled={busy !== null} value={state.assignments[role.id] ?? ''} onChange={(event) => void choose(role.id, event.target.value)}>
                      <option value="">بدون قالب (صفحهٔ خالی)</option>
                      {state.templates.map((template) => <option key={template.id} value={template.id}>{template.title}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      {message ? <p className="muted text-sm" role="status">{message}</p> : null}
    </section>
  )
}
