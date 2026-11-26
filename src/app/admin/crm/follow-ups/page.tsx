'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import Link from '@/components/AppLink'
import { useRouter, useSearchParams } from '@/platform/routing/navigation'
import { CRM_TITLE } from '@/modules/livechat/domain/crm-desk'
import {
  FOLLOW_UP_BUCKET_LABELS, FOLLOW_UP_QUEUE_PATH, followUpQueueQuery,
  type FollowUpBucket, type FollowUpQueue, type FollowUpQueueItem,
} from '@/modules/livechat/domain/crm-follow-up-queue'
import { fa, faDate } from '../../store/shared'
import styles from './queue.module.css'

const categories = Object.entries(FOLLOW_UP_BUCKET_LABELS) as [FollowUpBucket, string][]
type Result = { key: string; data?: FollowUpQueue; error?: string }

function queryHref(raw: string, changes: Record<string, string>) {
  const params = new URLSearchParams(raw)
  for (const [name, value] of Object.entries(changes)) {
    if (value) params.set(name, value)
    else params.delete(name)
  }
  return params.size ? `${FOLLOW_UP_QUEUE_PATH}?${params.toString()}` : FOLLOW_UP_QUEUE_PATH
}

function DueFilters({ data, query, bucket }: { data: FollowUpQueue; query: string; bucket: string }) {
  const total = data.counts.overdue + data.counts.today + data.counts.upcoming
  return <nav className={styles.filters} aria-label="موعد پیگیری‌ها">
    <Link href={queryHref(query, { bucket: '', page: '' })} scroll={false} aria-current={bucket === 'all' ? 'page' : undefined}>همهٔ باز <b>{fa(total)}</b></Link>
    {categories.map(([value, label]) => <Link key={value} href={queryHref(query, { bucket: value, page: '' })} scroll={false} aria-current={bucket === value ? 'page' : undefined}>
      {label} <b>{fa(data.counts[value])}</b>
    </Link>)}
  </nav>
}

function QueueRows({ items, today, busy, complete }: {
  items: FollowUpQueueItem[]; today: string; busy: number | null; complete: (item: FollowUpQueueItem) => void
}) {
  return <ul className={styles.items}>
    {items.map(item => <li key={item.id}>
      <div className={styles.record}>
        <strong dir="auto">{item.title}</strong>
        <Link className="sa-link" href={`/admin/crm/${item.customerId}#follow-ups-heading`} dir="auto">{item.customerName}</Link>
      </div>
      <div className={styles.details}>
        <span>{item.assigneeName || 'بدون مسئول'}</span>
        <time dateTime={item.dueDay} className={item.dueDay < today ? styles.overdue : undefined}>
          {faDate(item.dueDay)}{item.dueDay < today ? ' · عقب‌افتاده' : ''}
        </time>
      </div>
      <button type="button" className="btn btn-ghost btn-sm" disabled={busy !== null}
        aria-label={`انجام شد: ${item.title}`} onClick={() => complete(item)}>{busy === item.id ? 'در حال ثبت…' : 'انجام شد'}</button>
    </li>)}
  </ul>
}

function FollowUpWorkQueue() {
  const router = useRouter()
  const query = useSearchParams().toString()
  const filters = followUpQueueQuery(new URLSearchParams(query))
  const [result, setResult] = useState<Result | null>(null)
  const [reload, setReload] = useState(0)
  const [busy, setBusy] = useState<number | null>(null)
  const [notice, setNotice] = useState<{ message: string; error?: boolean } | null>(null)
  const changing = useRef(false)
  const listHeading = useRef<HTMLHeadingElement>(null)
  const requestKey = `${query}:${reload}`
  const current = result?.key === requestKey ? result : null

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const response = await fetch(`/api/admin/crm/follow-ups/queue?${query}`, { cache: 'no-store', signal: controller.signal })
        if (response.status === 404) throw Error('صف پیگیری مشتری در دسترس نیست.')
        if (response.status === 403) throw Error('به این نمای پیگیری دسترسی ندارید.')
        if (!response.ok) throw Error('دریافت فهرست ممکن نشد. فیلترها را بررسی کنید.')
        const data: FollowUpQueue = await response.json()
        if (!controller.signal.aborted) setResult({ key: requestKey, data })
      } catch (error) {
        if (!controller.signal.aborted) setResult({ key: requestKey, error: error instanceof Error ? error.message : 'فهرست پیگیری‌ها در دسترس نیست.' })
      }
    }
    void load()
    return () => controller.abort()
  }, [query, requestKey])

  async function complete(item: FollowUpQueueItem) {
    if (changing.current) return
    changing.current = true
    setBusy(item.id)
    setNotice(null)
    try {
      const response = await fetch(`/api/admin/crm/follow-ups?userId=${item.customerId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, version: item.version, status: 'DONE' }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        if (response.status === 409 || response.status === 403 || response.status === 404) setReload(value => value + 1)
        throw Error(typeof body?.error === 'string' ? body.error : 'ثبت نتیجه ممکن نشد.')
      }
      setNotice({ message: 'پیگیری انجام‌شده ثبت شد.' })
      listHeading.current?.focus({ preventScroll: true })
      setReload(value => value + 1)
    } catch (error) {
      setNotice({ error: true, message: error instanceof Error ? error.message : 'ثبت نتیجه ممکن نشد.' })
    } finally {
      changing.current = false
      setBusy(null)
    }
  }

  const data = current?.data
  const controls = data ?? (!current ? result?.data : undefined)
  return <div className={styles.desk} dir="rtl">
    <header className={styles.heading}>
      <div><Link className="sa-link" href="/admin/crm">{CRM_TITLE}</Link><h1>پیگیری‌های من</h1><p>موعد کارها را ببینید و نتیجهٔ پیگیری مشتری را ثبت کنید.</p></div>
      <Link className="btn btn-ghost" href="/admin">میز کار</Link>
    </header>
    {controls && <div className={styles.toolbar}>
      {data && <DueFilters data={data} query={query} bucket={filters?.bucket ?? 'all'} />}
      {controls.canManage && <label className={styles.scope}>مسئول پیگیری
        <select className="input" value={filters?.scope ?? 'mine'} onChange={event => {
          setNotice(null)
          router.push(queryHref(query, { scope: event.target.value === 'mine' ? '' : event.target.value, page: '' }), { scroll: false })
        }}>
          <option value="mine">پیگیری‌های من</option>
          <option value="all">همهٔ مسئولان</option>
          <option value="unassigned">بدون مسئول</option>
          {controls.staff.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
        </select>
      </label>}
    </div>}
    <section aria-labelledby="follow-up-queue-heading" aria-busy={!current}>
      <h2 ref={listHeading} id="follow-up-queue-heading" tabIndex={-1}>پیگیری‌های باز</h2>
      {notice && <p className={styles.feedback} role={notice.error ? 'alert' : 'status'}>{notice.message}</p>}
      {!current && <p role="status" className={styles.feedback}>در حال دریافت پیگیری‌ها…</p>}
      {current?.error && <div className={styles.feedback}><p role="alert">{current.error}</p>
        <button type="button" className="btn btn-ghost" onClick={() => setReload(value => value + 1)}>تلاش دوباره</button>
        {query && <Link className="btn btn-ghost" href={FOLLOW_UP_QUEUE_PATH}>پاک کردن فیلتر</Link>}
      </div>}
      {data && (data.items.length ? <QueueRows items={data.items} today={data.today} busy={busy} complete={item => void complete(item)} />
        : <p className={styles.feedback}>پیگیری بازی در این نما نیست.</p>)}
      {data && data.pageCount > 1 && <nav className={styles.pagination} aria-label="صفحه‌بندی پیگیری‌ها">
        <span>صفحهٔ {fa(data.page)} از {fa(data.pageCount)}</span>
        <div>
          {data.page > 1 && <Link className="btn btn-ghost" href={queryHref(query, { page: data.page > 2 ? String(data.page - 1) : '' })}>صفحهٔ پیشین</Link>}
          {data.page < data.pageCount && <Link className="btn btn-ghost" href={queryHref(query, { page: String(data.page + 1) })}>صفحهٔ بعدی</Link>}
        </div>
      </nav>}
    </section>
  </div>
}

export default function FollowUpsPage() {
  return <Suspense fallback={<p role="status">در حال دریافت پیگیری‌ها…</p>}><FollowUpWorkQueue /></Suspense>
}
