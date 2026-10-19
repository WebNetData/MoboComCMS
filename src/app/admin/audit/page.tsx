'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import Link from '@/components/AppLink'
import { useSearchParams } from '@/platform/routing/navigation'

interface AuditRow {
  id: number
  actorUserId: number
  actorEmail: string
  action: string
  targetType: string
  targetId: string
  requestId: string
  ip: string
  metadata: Record<string, unknown>
  createdAt: string
}

/** The last part of an action code, in words; the code itself stays beside it for search. */
const VERB: Record<string, string> = {
  create: 'ایجاد', created: 'ایجاد', update: 'ویرایش', updated: 'ویرایش', delete: 'حذف', deleted: 'حذف', restore: 'بازگردانی', restored: 'بازگردانی',
  refund: 'بازپرداخت', approve: 'تأیید', approved: 'تأیید', reject: 'رد', rejected: 'رد', publish: 'انتشار', lookup: 'جست‌وجوی اطلاعات',
  completed: 'پایان', started: 'شروع', dry_run: 'اجرای آزمایشی', mapping_saved: 'ذخیرهٔ نگاشت', file_uploaded: 'بارگذاری فایل',
  login: 'ورود', logout: 'خروج', grant: 'اعطای دسترسی', revoke: 'لغو دسترسی', settings: 'تنظیمات', titles_update: 'ویرایش عنوان‌ها',
}
const verb = (action: string) => VERB[action.split('.').at(-1) || ''] || ''
const when = (value: string) => new Date(value).toLocaleString('fa-IR', { dateStyle: 'medium', timeStyle: 'short' })
const hasMetadata = (value: Record<string, unknown>) => !!value && Object.keys(value).length > 0

function AuditLog() {
  const search = useSearchParams()
  const loadId = useRef(0)
  const [rows, setRows] = useState<AuditRow[]>([])
  const [cursor, setCursor] = useState<number | null>(null)
  const [nextCursor, setNextCursor] = useState<number | null>(null)
  const [action, setAction] = useState('')
  const [targetType, setTargetType] = useState(() => search.get('targetType') || '')
  const [targetId, setTargetId] = useState(() => search.get('targetId') || '')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  async function load(next: number | null = null, filters = { action, targetType, targetId, from, to }) {
    const requestId = ++loadId.current
    setLoading(true)
    const sp = new URLSearchParams({ take: '50' })
    if (next) sp.set('cursor', String(next))
    if (filters.action.trim()) sp.set('action', filters.action.trim())
    if (filters.targetType.trim()) sp.set('targetType', filters.targetType.trim())
    if (filters.targetId.trim()) sp.set('targetId', filters.targetId.trim())
    if (filters.from) sp.set('from', filters.from)
    if (filters.to) sp.set('to', filters.to)
    try {
      const res = await fetch(`/api/admin/audit?${sp.toString()}`, { cache: 'no-store' }).catch(() => null)
      const body = res?.ok ? await res.json().catch(() => null) : null
      if (requestId !== loadId.current) return
      setFailed(!body)
      setRows(body?.items || [])
      setNextCursor(body?.nextCursor || null)
      setCursor(next)
    } finally {
      if (requestId === loadId.current) setLoading(false)
    }
  }

  useEffect(() => { void load(null); return () => { loadId.current++ } }, [])
  const filtered = !!(action || targetType || targetId || from || to)
  const clear = () => { setAction(''); setTargetType(''); setTargetId(''); setFrom(''); setTo(''); void load(null, { action: '', targetType: '', targetId: '', from: '', to: '' }) }

  return (
    <div className="sa audit-log" dir="rtl">
      <header className="sa-head"><div><h1>گزارش فعالیت‌ها</h1><p className="sa-sub">هر تغییر حساس با انجام‌دهنده، شناسهٔ درخواست و جزئیات پاک‌سازی‌شده این‌جا ثبت می‌شود.</p></div></header>

      <form className="sa-card audit-filters" onSubmit={(e) => { e.preventDefault(); void load(null) }}>
        <label className="sa-field"><span>عملیات</span><input className="input" dir="ltr" value={action} onChange={(e) => setAction(e.target.value)} placeholder="invoice.refund" /></label>
        <label className="sa-field"><span>نوع مورد</span><input className="input" dir="ltr" value={targetType} onChange={(e) => setTargetType(e.target.value)} placeholder="invoice" /></label>
        <label className="sa-field"><span>شناسهٔ مورد</span><input className="input" dir="ltr" value={targetId} onChange={(e) => setTargetId(e.target.value)} placeholder="42" /></label>
        <label className="sa-field"><span>از روز</span><input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="sa-field"><span>تا روز</span><input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <div className="audit-filter-actions"><button className="btn btn-primary" type="submit" disabled={loading}>اعمال فیلتر</button>{filtered && <button className="btn btn-ghost" type="button" onClick={clear}>پاک کردن</button>}</div>
      </form>

      <section className="sa-card audit-list" aria-label="رخدادها" aria-busy={loading}>
        {loading && !rows.length ? <p role="status">در حال دریافت گزارش…</p> : failed ? <p className="sa-notice is-error" role="alert">دریافت گزارش ممکن نشد؛ دوباره تلاش کنید.</p> : rows.length === 0 ? <p className="sa-empty">{filtered ? 'رخدادی با این فیلتر پیدا نشد.' : 'هنوز رخدادی ثبت نشده است.'}</p> : <ol className="audit-rows">
          {rows.map((row) => <li key={row.id} className="audit-row">
            <div className="audit-main">
              <span className="audit-what">{verb(row.action) && <b>{verb(row.action)}</b>}<bdi dir="ltr" className="audit-code">{row.action}</bdi></span>
              <span className="audit-target">{row.targetType ? <><bdi dir="ltr">{row.targetType}{row.targetId ? ` #${row.targetId}` : ''}</bdi>{['posts', 'pages', 'products'].includes(row.targetType) && /^[1-9]\d*$/.test(row.targetId) && <Link className="sa-link" href={`/admin/history?type=${encodeURIComponent(row.targetType)}&id=${row.targetId}`}>نسخه‌ها</Link>}</> : '—'}</span>
            </div>
            <div className="audit-meta">
              <span><bdi dir="ltr">{row.actorEmail || `#${row.actorUserId}`}</bdi></span>
              <time dateTime={row.createdAt}>{when(row.createdAt)}</time>
              {row.ip && <span>آی‌پی <bdi dir="ltr">{row.ip}</bdi></span>}
            </div>
            {(hasMetadata(row.metadata) || row.requestId) && <details className="audit-details"><summary>جزئیات</summary>
              {row.requestId && <p className="sa-sub">شناسهٔ درخواست: <bdi dir="ltr">{row.requestId}</bdi></p>}
              {hasMetadata(row.metadata) && <pre dir="ltr">{JSON.stringify(row.metadata, null, 2)}</pre>}
            </details>}
          </li>)}
        </ol>}
      </section>

      {(cursor || nextCursor) && <nav className="sa-pager" aria-label="صفحه‌ها">
        <button className="btn btn-ghost btn-sm" disabled={!cursor || loading} onClick={() => void load(null)}>جدیدترین</button>
        <button className="btn btn-ghost btn-sm" disabled={!nextCursor || loading} onClick={() => void load(nextCursor)}>قدیمی‌تر</button>
      </nav>}
    </div>
  )
}

export default function AdminAuditPage() {
  return <Suspense fallback={<p role="status">در حال دریافت گزارش…</p>}><AuditLog /></Suspense>
}
