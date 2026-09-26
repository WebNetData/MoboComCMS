'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Props = { slug: string; joinMode: string; status: string; owner: boolean; signedIn: boolean; manager: boolean; target?: string; mode?: 'self' | 'request' | 'member' | 'add' }

/** Join/leave/request for members; accept/deny, add, remove and owner toggles for group managers. */
export default function GroupActions({ slug, joinMode, status, owner, signedIn, target, mode = 'self' }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [username, setUsername] = useState('')

  async function run(action: string, user?: string) {
    setBusy(true); setError('')
    const response = await fetch(`/api/forum/groups/${slug}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, username: user }) }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) { setError(data?.error || 'انجام نشد'); return }
    setUsername('')
    router.refresh()
  }

  const errorText = error && <small className="error-text" role="alert">{error}</small>
  if (mode === 'request') return <span className="fx-inline-actions"><button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void run('accept', target)}>پذیرفتن</button><button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void run('deny', target)}>رد</button>{errorText}</span>
  if (mode === 'member') return (
    <span className="fx-inline-actions">
      <button type="button" className="fx-link" disabled={busy} onClick={() => void run(owner ? 'unowner' : 'owner', target)}>{owner ? 'برداشتن مدیریت' : 'مدیر گروه شود'}</button>
      <button type="button" className="fx-link is-danger" disabled={busy} onClick={() => { if (window.confirm(`@${target} از گروه حذف شود؟`)) void run('remove', target) }}>حذف</button>{errorText}
    </span>
  )
  if (mode === 'add') return (
    <form className="fx-add-member" onSubmit={(e) => { e.preventDefault(); void run('add', username) }}>
      <label className="fx-field"><span>افزودن عضو با نام کاربری</span><input className="input" dir="ltr" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" required /></label>
      <button className="btn btn-primary btn-sm" disabled={busy}>افزودن</button>{errorText}
    </form>
  )
  if (!signedIn) return <a className="btn btn-primary btn-sm" href={`/login?next=${encodeURIComponent(`/forum/g/${slug}`)}`}>برای عضویت وارد شوید</a>
  if (status === 'ACTIVE') return <span className="fx-inline-actions"><span className="fx-chip">عضو هستید{owner ? ' · مدیر' : ''}</span><button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => { if (window.confirm('از این گروه خارج می‌شوید؟')) void run('leave') }}>خروج از گروه</button>{errorText}</span>
  if (status === 'PENDING') return <span className="fx-inline-actions"><span className="fx-chip">درخواست ارسال شد</span><button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void run('cancel')}>لغو درخواست</button>{errorText}</span>
  if (joinMode === 'OPEN') return <span className="fx-inline-actions"><button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void run('join')}>پیوستن به گروه</button>{errorText}</span>
  if (joinMode === 'REQUEST') return <span className="fx-inline-actions"><button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void run('request')}>درخواست عضویت</button>{errorText}</span>
  return <span className="fx-chip">عضویت با دعوت مدیران</span>
}
