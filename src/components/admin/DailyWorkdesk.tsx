'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from '@/components/AppLink'
import { useI18n } from '@/i18n/LocaleProvider'
import styles from './daily-workdesk.module.css'

type Item = { id: string; title: string; href: string; updatedAt: string; assigneeId: number | null; detail?: string }
type Queue = { key: 'store' | 'forms' | 'support'; available: boolean; reason?: 'disabled' | 'forbidden' | 'unavailable'; count?: number; items?: Item[] }
type Payload = { queues: Queue[] }

const labels = {
  store: { fa: 'سفارش‌های تازه', en: 'New store orders' },
  forms: { fa: 'درخواست‌های باز', en: 'Open form requests' },
  support: { fa: 'تیکت‌های باز', en: 'Open support tickets' },
}

export default function DailyWorkdesk() {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)
  const request = useRef<AbortController | null>(null)
  const load = useCallback(async () => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setLoading(true); setError(false)
    try {
      const response = await fetch('/api/admin/workdesk', { cache: 'no-store', signal: controller.signal })
      if (!response.ok) throw new Error('workdesk unavailable')
      const next = await response.json() as Payload
      if (!controller.signal.aborted) setData(next)
    } catch { if (!controller.signal.aborted) setError(true) }
    finally { if (!controller.signal.aborted) setLoading(false) }
  }, [])
  useEffect(() => { void load(); return () => request.current?.abort() }, [load])
  const when = (value: string) => new Date(value).toLocaleString(fa ? 'fa-IR' : 'en-US', { dateStyle: 'short', timeStyle: 'short' })
  const queues = data?.queues.filter((queue) => queue.available || queue.reason === 'unavailable') || []
  if (!loading && !error && queues.length === 0) return null

  return <section className="card mb-6" aria-labelledby="daily-workdesk-title">
    <div className={`flex items-center justify-between gap-3 mb-4 ${styles.header}`}>
      <div><h2 id="daily-workdesk-title" className="font-bold">{fa ? 'کارهای امروز' : 'Today’s work'}</h2><p className="muted text-xs">{fa ? 'صف‌های موجود بر اساس دسترسی شما' : 'Existing queues available to your role'}</p></div>
      <button type="button" className="btn btn-ghost" onClick={() => void load()} disabled={loading}>{fa ? 'به‌روزرسانی' : 'Refresh'}</button>
    </div>
    {error && <div className={`flex items-center justify-between gap-3 ${styles.header}`} role="status"><p className="error-text">{fa ? 'دریافت صف‌ها ناموفق بود.' : 'Could not load work queues.'}</p><button className="btn btn-ghost" onClick={() => void load()}>{fa ? 'تلاش دوباره' : 'Retry'}</button></div>}
    {loading && <p className="muted" aria-busy="true">{fa ? 'در حال بارگذاری…' : 'Loading…'}</p>}
    {!loading && !error && data && queues.length > 0 && <div className={`grid-3 ${styles.queues}`}>
      {queues.map((queue) => <section className={`rounded-lg border border-var p-4 ${styles.queue}`} key={queue.key} aria-label={labels[queue.key][fa ? 'fa' : 'en']}>
        <div className={`flex items-center justify-between gap-2 mb-3 ${styles.header}`}><h3 className="font-semibold">{labels[queue.key][fa ? 'fa' : 'en']}</h3>{queue.available ? <b className="num">{(queue.count ?? 0).toLocaleString(fa ? 'fa-IR' : 'en-US')}</b> : <span className={`text-xs ${styles.meta}`}>{fa ? 'موقتاً در دسترس نیست' : 'Temporarily unavailable'}</span>}</div>
        {queue.available && queue.items?.length ? <ul className={styles.items} role="list">{queue.items.map((item) => <li key={`${queue.key}:${item.id}`}><Link href={item.href} className={styles.item}><span className="block text-sm font-semibold" dir="auto">{item.title}</span>{item.detail && <small className={`block ${styles.meta}`} dir="auto">{item.detail}</small>}<small className={`${styles.meta} ${styles.details}`}><time dateTime={item.updatedAt}><bdi>{when(item.updatedAt)}</bdi></time>{item.assigneeId && <span>{fa ? 'مسئول' : 'Assigned'} <bdi dir="ltr">#{item.assigneeId.toLocaleString(fa ? 'fa-IR' : 'en-US')}</bdi></span>}</small></Link></li>)}</ul> : queue.available ? <p className={`text-sm ${styles.meta}`}>{fa ? 'موردی در صف نیست.' : 'Nothing in this queue.'}</p> : <p className={`text-sm ${styles.meta}`}>{fa ? 'اطلاعات این صف فعلاً در دسترس نیست.' : 'This queue could not be read right now.'}</p>}
      </section>)}
    </div>}
  </section>
}
