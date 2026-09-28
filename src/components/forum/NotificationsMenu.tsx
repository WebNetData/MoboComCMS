'use client'

import Link from '@/components/AppLink'
import { useCallback, useEffect, useRef, useState } from 'react'

type Notice = { id: number; kind: string; titleFa: string; bodyFa: string; href: string; readAt: string | null; createdAt: string }

const ICON: Record<string, string> = { FORUM_REPLY: '↩', FORUM_MENTION: '@', FORUM_POSTED: '💬', FORUM_REACTION: '❤', FORUM_SOLVED: '✅', FORUM_BADGE: '🏅', FORUM_TRUST: '⭐', FORUM_GROUP: '👥', FORUM_HIDDEN: '⚑' }

/** Bell with unread count and the latest notifications (the shared site inbox). */
export default function NotificationsMenu() {
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const [items, setItems] = useState<Notice[] | null>(null)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/inbox?countOnly=1', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((data) => data && setUnread(data.unread)).catch(() => undefined)
  }, [])

  const load = useCallback(async () => {
    const response = await fetch('/api/inbox', { cache: 'no-store' }).catch(() => null)
    const data = await response?.json().catch(() => null)
    if (data) { setItems(data.notifications); setUnread(data.unread) }
  }, [])

  useEffect(() => {
    if (!open) return
    void load()
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !box.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close) }
  }, [open, load])

  async function readAll() {
    await fetch('/api/inbox', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ all: true }) }).catch(() => null)
    void load()
  }
  const markRead = (id: number) => { void fetch('/api/inbox', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }).catch(() => null) }

  return (
    <div className="fx-bell" ref={box}>
      <button type="button" className="fx-icon-btn" aria-haspopup="true" aria-expanded={open} aria-label={`اعلان‌ها${unread ? ` (${unread.toLocaleString('fa-IR')} خوانده‌نشده)` : ''}`} onClick={() => setOpen((value) => !value)}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0" strokeLinecap="round" strokeLinejoin="round" /></svg>
        {unread > 0 && <b>{unread > 99 ? '۹۹+' : unread.toLocaleString('fa-IR')}</b>}
      </button>
      {open && (
        <div className="fx-menu fx-notices" role="dialog" aria-label="اعلان‌ها">
          <header><strong>اعلان‌ها</strong>{unread > 0 && <button type="button" className="fx-link" onClick={() => void readAll()}>خواندن همه</button>}</header>
          {items === null && <p className="fx-muted fx-pad">در حال بارگذاری…</p>}
          {items?.length === 0 && <p className="fx-muted fx-pad">اعلانی ندارید.</p>}
          <ul>{items?.slice(0, 12).map((item) => (
            <li key={item.id} className={item.readAt ? '' : 'is-unread'}>
              <Link href={item.href} onClick={() => { markRead(item.id); setOpen(false) }}>
                <span className="fx-notice-icon" aria-hidden="true">{ICON[item.kind] || '•'}</span>
                <span><b>{item.titleFa}</b>{item.bodyFa && <small>{item.bodyFa}</small>}</span>
              </Link>
            </li>
          ))}</ul>
          <footer><Link href="/dashboard/notifications" onClick={() => setOpen(false)}>همهٔ اعلان‌ها ←</Link></footer>
        </div>
      )}
    </div>
  )
}
