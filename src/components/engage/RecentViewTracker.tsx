'use client'

import { useEffect } from 'react'

/** Sends one view after the member has actually stayed on a visible detail page. */
export default function RecentViewTracker({ item }: { item: string }) {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (document.visibilityState !== 'visible') return
      void fetch('/api/library/recent', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ item }) }).catch(() => undefined)
    }, 2500)
    return () => window.clearTimeout(timer)
  }, [item])
  return null
}
