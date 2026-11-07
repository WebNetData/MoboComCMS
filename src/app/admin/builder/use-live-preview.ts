'use client'

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { BuilderDoc } from '@/modules/site/domain/builder'

type Snapshot = { doc: BuilderDoc; saved: string; pageId: string }
/** Serialize writes: aborting fetch does not cancel a server write already in progress. */
export function useBuilderLivePreview({ doc, saved, loading, pageId, draftPushed, refresh }: {
  doc: BuilderDoc | null; saved: string; loading: boolean; pageId: string
  draftPushed: RefObject<boolean>; refresh: () => void
}) {
  const [state, setState] = useState<'ready' | 'syncing' | 'error'>('ready')
  const [error, setError] = useState(''), [retry, setRetry] = useState(0)
  const queued = useRef<Snapshot | null>(null), running = useRef(false), alive = useRef(true)
  const latest = useRef({ doc, pageId }); latest.current = { doc, pageId }
  useEffect(() => { alive.current = true; return () => { alive.current = false; queued.current = null } }, [])
  const drain = useCallback(async () => {
    if (running.current) return
    running.current = true
    try {
      while (queued.current && alive.current) {
        const next = queued.current; queued.current = null
        const clean = JSON.stringify(next.doc) === next.saved
        if (clean && !draftPushed.current) { setState('ready'); continue }
        try {
          const response = await fetch(clean ? `/api/admin/builder/draft?pageId=${encodeURIComponent(next.pageId)}` : '/api/admin/builder/draft', clean
            ? { method: 'DELETE' }
            : { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pageId: next.pageId, doc: next.doc }) })
          if (!response.ok) { const body = await response.json().catch(() => null); throw new Error(body?.error || 'پیش‌نمایش همگام نشد') }
          if (!alive.current || next.pageId !== latest.current.pageId) continue
          draftPushed.current = !clean
          if (JSON.stringify(next.doc) === JSON.stringify(latest.current.doc)) { refresh(); setError(''); setState('ready') }
        } catch (failure) {
          if (alive.current && next.pageId === latest.current.pageId) { setState('error'); setError(failure instanceof Error ? failure.message : 'ارتباط پیش‌نمایش برقرار نشد') }
        }
      }
    } finally { running.current = false }
  }, [draftPushed, refresh])
  useEffect(() => {
    if (loading || !doc) return
    setState('syncing')
    const timer = setTimeout(() => { queued.current = { doc, saved, pageId }; void drain() }, 400)
    return () => clearTimeout(timer)
  }, [doc, saved, loading, pageId, retry, drain])
  return { state, error, retry: () => setRetry(value => value + 1) }
}
