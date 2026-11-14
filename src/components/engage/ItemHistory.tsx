'use client'

import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react'
import Link from '@/components/AppLink'
import { TIMELINE_LABEL, type TimelineEvent } from '@/modules/content/domain/timeline'
import styles from './ItemHistory.module.css'

/** Lazy discovery through the existing public timeline, not an additional tracking or relationship service. */
export default function ItemHistory({ item }: { item: string }) {
  const [events, setEvents] = useState<TimelineEvent[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const request = useRef<AbortController | null>(null)
  const panel = useRef<HTMLDetailsElement | null>(null)
  const load = useCallback(async () => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setBusy(true); setFailed(false)
    try {
      const response = await fetch(`/api/items/timeline?item=${encodeURIComponent(item)}`, { cache: 'no-store', signal: controller.signal })
      if (!response.ok) throw new Error('Timeline unavailable')
      const data = await response.json() as { events: TimelineEvent[] }
      if (!controller.signal.aborted) setEvents(data.events)
    } catch {
      if (!controller.signal.aborted) setFailed(true)
    } finally {
      if (!controller.signal.aborted) setBusy(false)
    }
  }, [item])
  useEffect(() => {
    // Native details can open before hydration attaches the toggle listener.
    if (panel.current?.open) void load()
    return () => request.current?.abort()
  }, [load])
  function toggle(event: SyntheticEvent<HTMLDetailsElement>) {
    if (event.currentTarget.open && events === null && !busy && !failed) void load()
  }
  return <details ref={panel} className={styles.panel} onToggle={toggle}>
    <summary>مطالب و رویدادهای مرتبط</summary>
    <div className={styles.body}>
      {busy && <p role="status" aria-busy="true">در حال دریافت…</p>}
      {failed && <p role="alert">دریافت مطالب مرتبط ناموفق بود. <button type="button" onClick={() => void load()}>تلاش دوباره</button></p>}
      {!busy && !failed && events && <ol>{events.map(event => <li key={`${event.kind}:${event.href}:${event.title}`}>
        <span>{TIMELINE_LABEL[event.kind]}</span><Link href={event.href}>{event.title}</Link>
        {event.detail && <small dir="auto">{event.detail}</small>}
        <time dateTime={event.at}>{new Date(event.at).toLocaleDateString('fa-IR')}</time>
      </li>)}</ol>}
      {!busy && !failed && events?.length === 0 && <p>هنوز رویداد یا مطلب مرتبطی ثبت نشده است.</p>}
    </div>
  </details>
}
