'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ClearHistoryButton({ fa }: { fa: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function clear() {
    if (!window.confirm(fa ? 'همهٔ تاریخچهٔ پخش شما پاک شود؟' : 'Clear your entire listening history?')) return
    setBusy(true); setError('')
    const response = await fetch('/api/music/history', { method: 'DELETE' }).catch(() => null)
    setBusy(false)
    if (!response?.ok) { setError(fa ? 'پاک‌کردن تاریخچه انجام نشد.' : 'Could not clear history.'); return }
    router.refresh()
  }

  return <span><button type="button" className="btn btn-ghost btn-sm" onClick={() => void clear()} disabled={busy}>{busy ? (fa ? 'در حال پاک‌کردن…' : 'Clearing…') : (fa ? 'پاک‌کردن تاریخچه' : 'Clear history')}</button>{error && <small role="status" className="muted">{error}</small>}</span>
}
