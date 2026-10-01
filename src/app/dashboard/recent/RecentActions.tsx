'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function RecentActions({ fa }: { fa: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function clear() {
    if (!window.confirm(fa ? 'تاریخچهٔ مشاهده را پاک می‌کنید؟' : 'Clear recently viewed history?')) return
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/library/recent', { method: 'DELETE' })
      if (!response.ok) throw new Error(fa ? 'پاک‌کردن تاریخچه انجام نشد.' : 'Could not clear history.')
      router.replace('/dashboard/recent'); router.refresh()
    } catch (cause) { setError((cause as Error).message) } finally { setBusy(false) }
  }
  return <div className="cn-history-actions"><button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void clear()}>{busy ? (fa ? 'در حال پاک‌کردن…' : 'Clearing…') : (fa ? 'پاک‌کردن تاریخچه' : 'Clear history')}</button>{error && <span role="alert">{error}</span>}</div>
}
