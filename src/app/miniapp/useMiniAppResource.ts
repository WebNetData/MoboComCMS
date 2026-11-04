'use client'

import { useCallback, useEffect, useState } from 'react'

/** One abortable read per screen. Failed refreshes cannot leave stale private data visible. */
export function useMiniAppResource<T>(url: string | null, revision = 0) {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: boolean }>({ data: null, loading: true, error: false })
  useEffect(() => {
    if (!url) { setState({ data: null, loading: false, error: false }); return }
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 15000)
    let active = true
    setState({ data: null, loading: true, error: false })
    void fetch(url, { cache: 'no-store', signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('read failed')
      const data: T = await response.json()
      if (active) setState({ data, loading: false, error: false })
    }).catch(() => { if (active) setState({ data: null, loading: false, error: true }) }).finally(() => window.clearTimeout(timeout))
    return () => { active = false; window.clearTimeout(timeout); controller.abort() }
  }, [url, attempt, revision])
  const retry = useCallback(() => setAttempt(value => value + 1), [])
  return { ...state, retry }
}
