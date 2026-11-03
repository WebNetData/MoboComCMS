'use client'

import Link from '@/components/AppLink'
import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from '@/platform/routing/navigation'
import { useI18n } from '@/i18n/LocaleProvider'
import Icon from '@/components/site/Icon'

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

  return <div className="dash-page np-page nc-page" dir={fa ? 'rtl' : 'ltr'}>
    <header className="nc-header">
      <span className="np-header-icon"><Icon name="bell" size={24} /></span>
      <div className="nc-header-copy"><h1>{fa ? 'اعلان‌ها' : 'Notifications'}</h1><p>{fa ? 'تازه‌ترین خبرها و فعالیت‌های حساب شما' : 'Recent news and activity for your account'}</p></div>
      <Link href="/dashboard/notifications/preferences" className="btn btn-ghost nc-settings"><Icon name="sliders" size={17} />{fa ? 'تنظیمات اعلان‌ها' : 'Preferences'}</Link>
    </header>

    <section className="nc-panel" aria-label={fa ? 'فهرست اعلان‌ها' : 'Notification list'}>
      <div className="nc-toolbar">
        <div className="nc-tabs" role="group" aria-label={fa ? 'نمایش اعلان‌ها' : 'Notification view'}>
          <button type="button" className={filter === 'all' ? 'is-active' : ''} aria-pressed={filter === 'all'} onClick={() => selectFilter('all')}>{fa ? 'همه' : 'All'}</button>
          <button type="button" className={filter === 'unread' ? 'is-active' : ''} aria-pressed={filter === 'unread'} onClick={() => selectFilter('unread')}>{fa ? 'خوانده‌نشده' : 'Unread'}{unread > 0 && <span className="nc-count">{unread.toLocaleString(fa ? 'fa-IR' : 'en-US')}</span>}</button>
        </div>
        {unread > 0 && <button className="btn btn-ghost btn-sm nc-mark-all" onClick={() => mark()}><Icon name="check" size={16} />{fa ? 'خواندن همه' : 'Mark all read'}</button>}
      </div>

      {error && <div className="np-alert nc-error" role="alert"><span>{fa ? 'دریافت یا ثبت اعلان انجام نشد.' : 'Could not load or update notifications.'}</span><button className="btn btn-ghost btn-sm" onClick={() => load()}>{fa ? 'تلاش دوباره' : 'Retry'}</button></div>}
      {loading && rows.length === 0 && <div className="np-loading" role="status" aria-label={fa ? 'در حال دریافت اعلان‌ها' : 'Loading notifications'}>{Array.from({ length: 4 }, (_, index) => <span key={index} />)}</div>}
      {!loading && rows.length === 0 && !error && !cursor && <div className="nc-empty"><span className="nc-empty-icon"><Icon name={filter === 'unread' ? 'check' : 'bell'} size={26} /></span><strong>{filter === 'unread' ? (fa ? 'همه‌چیز را خوانده‌اید' : 'You are all caught up') : (fa ? 'هنوز اعلانی ندارید' : 'No notifications yet')}</strong><p>{filter === 'unread' ? (fa ? 'اعلان خوانده‌نشده‌ای در حساب شما نیست.' : 'There are no unread notifications in your account.') : (fa ? 'وقتی فعالیت تازه‌ای رخ دهد، اینجا نمایش داده می‌شود.' : 'New account activity will appear here.')}</p></div>}

      <div className="nc-list">{rows.map(row => <article key={row.id} className={`card nc-item ${row.readAt ? '' : 'is-unread'}`}>
        <span className="nc-item-icon"><Icon name="bell" size={17} /></span>
        <div className="nc-item-copy"><div className="nc-item-title">{!row.readAt && <span className="nc-unread-dot" role="img" aria-label={fa ? 'خوانده‌نشده' : 'Unread'} />}<Link href={destination(row.href)} onClick={() => { if (!row.readAt) void mark(row.id) }}>{fa ? row.titleFa : row.titleEn}</Link></div>{(fa ? row.bodyFa : row.bodyEn) && <p>{fa ? row.bodyFa : row.bodyEn}</p>}<time dateTime={row.createdAt}>{new Date(row.createdAt).toLocaleString(fa ? 'fa-IR' : 'en-US')}</time></div>
        {!row.readAt && <button className="btn btn-ghost btn-sm nc-mark-one" onClick={() => mark(row.id)}>{fa ? 'خواندم' : 'Mark read'}</button>}
      </article>)}</div>
      {cursor && <button className="btn btn-ghost nc-more" disabled={loading} onClick={() => load(cursor)}>{fa ? 'نمایش بیشتر' : 'Load more'}</button>}
    </section>
  </div>
}
