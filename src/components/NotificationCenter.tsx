'use client'

import Link from '@/components/AppLink'
import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from '@/platform/routing/navigation'
import { useI18n } from '@/i18n/LocaleProvider'

type Notice = { id: number; kind: string; titleEn: string; titleFa: string; bodyEn: string; bodyFa: string; href: string; readAt: string | null; createdAt: string }

export default function NotificationCenter() {
  const { locale } = useI18n()
  const pathname = usePathname()
  const fa = locale === 'fa'
  const destination = (href: string) => pathname.startsWith('/miniapp') ? href.replace(/^\/dashboard\/tickets\//, '/miniapp/support/').replace(/^\/dashboard\/subscriptions\//, '/miniapp/subscriptions/') : href
  const [rows, setRows] = useState<Notice[]>([])
  const [unread, setUnread] = useState(0)
  const [cursor, setCursor] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const requestSeq = useRef(0)

  const load = useCallback(async (before?: number) => {
    const seq = ++requestSeq.current
    setLoading(true); setError(false)
    if (!before) { setRows([]); setCursor(null) }
    try {
      const query = new URLSearchParams()
      if (before) query.set('before', String(before))
      if (filter === 'unread') query.set('unread', '1')
      const response = await fetch(`/api/inbox${query.size ? `?${query}` : ''}`, { cache: 'no-store' })
      if (!response.ok) throw new Error('inbox unavailable')
      const data = await response.json()
      if (seq !== requestSeq.current) return
      setRows(previous => before ? [...previous, ...(data.notifications || [])] : data.notifications || [])
      setCursor(data.nextCursor || null)
      setUnread(data.unread || 0)
    } catch { if (seq === requestSeq.current) setError(true) }
    finally { if (seq === requestSeq.current) setLoading(false) }
  }, [filter])
  useEffect(() => { void load() }, [load])

  function selectFilter(value: 'all' | 'unread') {
    if (value === filter) return
    requestSeq.current++
    setFilter(value)
  }

  async function mark(id?: number) {
    const response = await fetch('/api/inbox', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(id ? { id } : { all: true }) }).catch(() => null)
    if (!response?.ok) { setError(true); return }
    const data = await response.json()
    setRows(previous => filter === 'unread'
      ? previous.filter(row => id && row.id !== id)
      : previous.map(row => !id || row.id === id ? { ...row, readAt: row.readAt || new Date().toISOString() } : row))
    setUnread(data.unread)
    if (filter === 'unread' && data.unread === 0) setCursor(null)
    window.dispatchEvent(new Event('mobocom:inbox-updated'))
  }

  return <div className="max-w-3xl mx-auto">
    <div className="flex items-center justify-between flex-wrap gap-3 mb-6"><div><h1 className="h2">{fa ? 'اعلان‌ها' : 'Notifications'}</h1><p className="muted">{fa ? `${unread} اعلان خوانده‌نشده` : `${unread} unread`}</p></div><div className="flex gap-2"><Link href="/dashboard/notifications/preferences" className="btn btn-ghost">{fa ? 'تنظیمات اعلان‌ها' : 'Preferences'}</Link>{unread > 0 && <button className="btn btn-ghost" onClick={() => mark()}>{fa ? 'خواندن همه' : 'Mark all read'}</button>}</div></div>
    <div className="flex gap-2 mb-4" role="group" aria-label={fa ? 'نمایش اعلان‌ها' : 'Notification view'}>
      <button type="button" className={`btn ${filter === 'all' ? 'btn-primary' : 'btn-ghost'}`} aria-pressed={filter === 'all'} onClick={() => selectFilter('all')}>{fa ? 'همه' : 'All'}</button>
      <button type="button" className={`btn ${filter === 'unread' ? 'btn-primary' : 'btn-ghost'}`} aria-pressed={filter === 'unread'} onClick={() => selectFilter('unread')}>{fa ? 'خوانده‌نشده' : 'Unread'}</button>
    </div>
    {error && <div className="card mb-4" role="alert"><p className="error-text mb-2">{fa ? 'دریافت یا ثبت اعلان انجام نشد.' : 'Could not load or update notifications.'}</p><button className="btn btn-ghost" onClick={() => load()}>{fa ? 'تلاش دوباره' : 'Retry'}</button></div>}
    {loading && rows.length === 0 && <p className="muted" role="status">{fa ? 'در حال دریافت…' : 'Loading…'}</p>}
    {!loading && rows.length === 0 && !error && !cursor && <div className="card text-center py-10 muted">{filter === 'unread' ? (fa ? 'اعلان خوانده‌نشده‌ای ندارید.' : 'No unread notifications.') : (fa ? 'هنوز اعلانی ندارید.' : 'No notifications yet.')}</div>}
    <div className="space-y-3">{rows.map(row => <article key={row.id} className="card" style={{ borderColor: row.readAt ? undefined : 'var(--primary)' }}>
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><Link href={destination(row.href)} className="font-bold" onClick={() => { if (!row.readAt) void mark(row.id) }}>{fa ? row.titleFa : row.titleEn}</Link><p className="muted text-sm mt-1">{fa ? row.bodyFa : row.bodyEn}</p><time className="muted text-xs block mt-2" dateTime={row.createdAt}>{new Date(row.createdAt).toLocaleString(fa ? 'fa-IR' : 'en-US')}</time></div>{!row.readAt && <button className="btn btn-ghost btn-sm shrink-0" onClick={() => mark(row.id)}>{fa ? 'خواندم' : 'Mark read'}</button>}</div>
    </article>)}</div>
    {cursor && <button className="btn btn-ghost w-full mt-4" disabled={loading} onClick={() => load(cursor)}>{fa ? 'نمایش بیشتر' : 'Load more'}</button>}
  </div>
}
