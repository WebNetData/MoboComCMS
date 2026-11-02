'use client'
import { useEffect, useState } from 'react'
import { useRouter } from '@/platform/routing/navigation'
import { MEMBER_LISTS_CHANGED, MEMBER_LISTS_STORAGE } from './member-list-events'

/** Invalidation only: each reader re-fetches its authenticated canonical owner. */
export function useMemberLibraryRevision() {
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = () => { clearTimeout(timer); timer = setTimeout(() => setRevision(value => value + 1), 120) }
    const storage = (event: StorageEvent) => { if (event.key === MEMBER_LISTS_STORAGE) refresh() }
    const visible = () => { if (document.visibilityState === 'visible') refresh() }
    window.addEventListener(MEMBER_LISTS_CHANGED, refresh)
    window.addEventListener('storage', storage)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', visible)
    return () => { clearTimeout(timer); window.removeEventListener(MEMBER_LISTS_CHANGED, refresh); window.removeEventListener('storage', storage); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', visible) }
  }, [])
  return revision
}

export default function MemberLibrarySync() {
  const revision = useMemberLibraryRevision(), router = useRouter()
  useEffect(() => { if (revision) router.refresh() }, [revision, router])
  return null
}
