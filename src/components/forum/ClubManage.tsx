'use client'

import { useState } from 'react'
import { useRouter } from '@/platform/routing/navigation'

/** What a club's founder decides: close it or open it again, and hand it to another member. */
export default function ClubManage({ slug, closed }: { slug: string; closed: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [handing, setHanding] = useState(false)
  const [username, setUsername] = useState('')

  async function send(body: Record<string, unknown>) {
    setBusy(true); setError('')
    const response = await fetch(`/api/forum/clubs/${slug}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) { setError(data?.error || 'انجام نشد؛ دوباره تلاش کنید'); return false }
    router.refresh(); return true
  }

  return <span className="fk-manage">
    <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => { if (closed || window.confirm('کلوب بسته شود؟ عضو تازه نمی‌پذیرد و موضوع تازه ساخته نمی‌شود؛ نوشته‌ها می‌مانند و هر وقت خواستید دوباره بازش می‌کنید.')) void send({ action: closed ? 'reopen' : 'close' }) }}>{closed ? 'بازکردن کلوب' : 'بستن کلوب'}</button>
    {!handing ? <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setHanding(true)}>واگذاری کلوب</button> : (
      <form className="fk-hand" onSubmit={async (event) => { event.preventDefault(); if (window.confirm(`کلوب به «${username}» واگذار شود؟ پس از آن شما عضو عادی آن هستید.`) && await send({ action: 'transfer', username })) { setHanding(false); setUsername('') } }}>
        <input className="input" dir="ltr" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="نام کاربری یکی از اعضا" aria-label="نام کاربری عضوی که کلوب به او واگذار می‌شود" required />
        <button className="btn btn-primary btn-sm" disabled={busy || !username.trim()}>واگذار کن</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setHanding(false)}>انصراف</button>
      </form>
    )}
    {error && <small className="fx-warn" role="alert">{error}</small>}
  </span>
}
