'use client'

import { useEffect, useState } from 'react'
import { usePathname } from '@/platform/routing/navigation'

export default function NotificationCount() {
  const pathname = usePathname()
  const [count, setCount] = useState(0)
  useEffect(() => {
    let active = true
    const refresh = () => fetch('/api/inbox?countOnly=1', { cache: 'no-store' }).then(response => response.ok ? response.json() : null).then(data => { if (active) setCount(Number(data?.unread || 0)) }).catch(() => {})
    void refresh()
    const timer = window.setInterval(refresh, 60_000)
    return () => { active = false; window.clearInterval(timer) }
  }, [pathname])
  return count > 0 ? <span className="badge badge-amber" aria-label={`${count} unread notifications`}>{count > 99 ? '99+' : count}</span> : null
}
