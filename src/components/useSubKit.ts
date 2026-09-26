'use client'

// One hook for "everything about this subscription's connection": the live
// kit from `/api/sub/<token>/details` (links + health + configs), a manual
// reload, and the raw body of a chosen format.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ConnectKit } from '@/modules/subscriptions/server/subs'

export interface SubKitState {
  kit: ConnectKit | null
  loading: boolean
  error: string
  reload: (opts?: { sync?: boolean }) => void
}

export function useSubKit(token: string, opts: { auto?: boolean; sync?: boolean } = {}): SubKitState {
  const auto = opts.auto !== false
  const [kit, setKit] = useState<ConnectKit | null>(null)
  const [loading, setLoading] = useState(Boolean(auto))
  const [error, setError] = useState('')
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const load = useCallback(
    async (o: { sync?: boolean } = {}) => {
      if (!token) return
      setLoading(true)
      setError('')
      const sync = o.sync ?? opts.sync ?? true
      try {
        const res = await fetch(`/api/sub/${token}/details${sync ? '' : '?sync=0'}`, { cache: 'no-store' })
        const data = await res.json().catch(() => null)
        if (!alive.current) return
        if (!res.ok || !data?.ok) {
          setError(data?.error || 'subscription details are unavailable')
          setKit(null)
        } else {
          setKit(data as ConnectKit)
        }
      } catch {
        if (alive.current) setError('network error')
      } finally {
        if (alive.current) setLoading(false)
      }
    },
    [token, opts.sync]
  )

  useEffect(() => {
    if (auto) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, token])

  return { kit, loading, error, reload: load }
}

/** The raw body of one subscription format (`?format=clash|singbox|xray`). */
export function useSubBody(token: string, format: string) {
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!token || format === 'links') return
    setBusy(true)
    setError('')
    const res = await fetch(`/api/sub/${token}?format=${format}`, { headers: { accept: '*/*' }, cache: 'no-store' })
    const text = await res.text().catch(() => '')
    setBusy(false)
    if (!res.ok) {
      setBody('')
      setError(text.trim() || 'format is not available')
      return
    }
    setBody(text)
  }, [token, format])

  useEffect(() => {
    setBody('')
    setError('')
    load()
  }, [load])

  return { body, busy, error, reload: load }
}
