'use client'

import { useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { usePathname, useRouter } from '@/platform/routing/navigation'

/** NextAuth owns session broadcasting; refresh server-rendered identity after its update arrives. */
export default function SessionIdentityRefresh() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const pathname = usePathname()
  const previous = useRef<string | null>(null)
  const identity = JSON.stringify([session?.user?.name, session?.user?.image])

  useEffect(() => {
    if (status === 'unauthenticated') previous.current = null
    if (status !== 'authenticated') return
    const changed = previous.current !== null && previous.current !== identity
    previous.current = identity
    // Account/Admin shells already subscribe to the session. Refreshing their server tree
    // can remount route editors; keep their local drafts and avoid an unnecessary request.
    if (changed && !/^\/(admin|dashboard)(\/|$)/.test(pathname)) router.refresh()
  }, [identity, status, router, pathname])

  return null
}
