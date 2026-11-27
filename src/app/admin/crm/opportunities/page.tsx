'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import { useSearchParams } from '@/platform/routing/navigation'
import { CRM_TITLE } from '@/modules/livechat/domain/crm-desk'
import { fa } from '../../store/shared'
import OpportunityDetail from './OpportunityDetail'
import OpportunityForm from './OpportunityForm'
import { formatAmount, STAGES, type Preview, type Stage, type Summary } from './types'
import styles from './opportunities.module.css'

const PATH = '/admin/crm/opportunities'
const stageEntries = Object.entries(STAGES) as [Stage, string][]

function href(query: string, changes: Record<string, string>) {
  const params = new URLSearchParams(query)
  for (const [key, value] of Object.entries(changes)) {
    if (value) params.set(key, value)
    else params.delete(key)
  }
  const result = params.toString()
  return result ? `${PATH}?${result}` : PATH
}

function SalesDesk() {
  const query = useSearchParams().toString()
  const params = new URLSearchParams(query)
  const userId = Number(params.get('userId')) || undefined
  const source = params.get('source')
  const sourceId = Number(params.get('sourceId'))
  const hasSource = (source === 'FORM' || source === 'TICKET') && Number.isSafeInteger(sourceId) && sourceId > 0
  const [result, setResult] = useState<{ key: string; data?: Summary; error?: string } | null>(null)
  const [preview, setPreview] = useState<{ key: string; data?: Preview; error?: string } | null>(null)
  const [reload, setReload] = useState(0)
  const detailId = Number(params.get('id'))
  const detail = Number.isSafeInteger(detailId) && detailId > 0 && detailId <= 2_147_483_647 ? detailId : null
  const [creating, setCreating] = useState(params.get('create') === '1' || hasSource)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [dismissedSource, setDismissedSource] = useState('')
  const stage = params.get('stage') || ''
  const stale = params.get('stale') === '1'
  const owner = params.get('owner') || 'mine'
  const page = params.get('page') || ''
  const sourceKey = hasSource ? `${source}:${sourceId}` : ''
  const key = `${userId || ''}:${stage}:${owner}:${page}:${stale}:${reload}`
  const current = result?.key === key ? result : null
  const data = current?.data
  const filterOptions = data ?? result?.data
  const listQuery = new URLSearchParams()
  if (userId) listQuery.set('userId', String(userId))
  if (stage) listQuery.set('stage', stage)
  if (stale) listQuery.set('stale', '1')
  listQuery.set('owner', owner)
  if (page) listQuery.set('page', page)
  const listRequest = listQuery.toString()

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const response = await fetch(`/api/admin/crm/opportunities?${listRequest}`, { cache: 'no-store', signal: controller.signal })
        if (!response.ok) {
          const body = await response.json().catch(() => null)
          throw new Error(body?.error || 'دریافت فرصت‌ها ممکن نشد.')
        }
        const body: Summary = await response.json()
        if (!controller.signal.aborted) setResult({ key, data: body })
      } catch (cause) {
        if (!controller.signal.aborted) setResult({ key, error: cause instanceof Error ? cause.message : 'دریافت فرصت‌ها ممکن نشد.' })
      }
    }
    void load()
    return () => controller.abort()
  }, [key, listRequest])

  useEffect(() => {
    if (!sourceKey) return
    const controller = new AbortController()
    async function loadSource() {
      try {
        const response = await fetch(`/api/admin/crm/opportunities?source=${source}&sourceId=${sourceId}`, { cache: 'no-store', signal: controller.signal })
        if (!response.ok) { const body = await response.json().catch(() => null); throw new Error(body?.error || 'دریافت منبع ممکن نشد.') }
        const body: Preview = await response.json()
        if (!controller.signal.aborted) setPreview({ key: sourceKey, data: body })
      } catch (cause) {
        if (!controller.signal.aborted) setPreview({ key: sourceKey, error: cause instanceof Error ? cause.message : 'دریافت منبع ممکن نشد.' })
      }
    }
    void loadSource()
    return () => controller.abort()
  }, [source, sourceId, sourceKey])

  const sourceResult = preview?.key === sourceKey ? preview : null
  const showSourceForm = Boolean(sourceKey && sourceKey !== dismissedSource)
  async function create(body: Record<string, unknown>) {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      const response = await fetch('/api/admin/crm/opportunities', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!response.ok) { const failure = await response.json().catch(() => null); throw new Error(failure?.error || 'ثبت فرصت ممکن نشد.') }
      const saved: { id: number } = await response.json()
      setCreating(false); setDismissedSource(sourceKey); setReload(value => value + 1); setNotice('فرصت فروش ثبت شد.')
      window.history.replaceState(null, '', href(window.location.search, { id: String(saved.id), create: '', source: '', sourceId: '' }))
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'ثبت فرصت ممکن نشد.') } finally { setBusy(false) }
  }

  function changeFilter(changes: Record<string, string>) {
    setNotice('')
    window.history.pushState(null, '', href(window.location.search, { ...changes, page: '', id: '' }))
  }

  function openDetail(id: number | null) {
    window.history.replaceState(null, '', href(window.location.search, { id: id ? String(id) : '', create: '', source: '', sourceId: '' }))
  }
  return <div className={styles.desk} dir="rtl">
    <header className={styles.heading}>
      <div><Link className="sa-link" href="/admin/crm">{CRM_TITLE}</Link><h1>فرصت‌های فروش</h1><p>فرصت‌ها، مراحل و پیگیری‌های هر مشتری را مدیریت کنید.</p></div>
      <div className={styles.actions}><Link className="btn btn-ghost" href="/admin/crm/follow-ups">پیگیری‌های من</Link><button className="btn btn-primary" type="button" onClick={() => { setCreating(true); openDetail(null); setError('') }}>فرصت تازه</button></div>
    </header>
    {notice && <p role="status" className={styles.feedback}>{notice}</p>}
    {error && <p role="alert" className={styles.feedback}>{error}</p>}
    {showSourceForm && !sourceResult && <p role="status" className={styles.feedback}>در حال بررسی منبع…</p>}
    {showSourceForm && sourceResult?.error && <p role="alert" className={styles.feedback}>{sourceResult.error} <Link className="sa-link" href={PATH}>بازگشت به فرصت‌ها</Link></p>}
    {(creating || showSourceForm) && data && (!showSourceForm || sourceResult?.data) && <section className={styles.panel} aria-labelledby="new-opportunity-heading">
      <h2 id="new-opportunity-heading">فرصت تازه</h2>
      <OpportunityForm key={`${sourceKey}:${userId || ''}`} initialUserId={userId} preview={showSourceForm ? sourceResult?.data : undefined} staff={data.staff} canManage={data.canManage} ownId={data.ownId} busy={busy}
        cancel={() => { setCreating(false); setDismissedSource(sourceKey); setError('') }} save={create} />
    </section>}
    {detail !== null && <OpportunityDetail key={detail} id={detail} close={() => openDetail(null)} changed={() => setReload(value => value + 1)} />}
    <section className={styles.panel} aria-labelledby="sales-report-heading" aria-busy={!current}>
      <h2 id="sales-report-heading">گزارش فرصت‌ها</h2>
      {!current && <p role="status">در حال دریافت فرصت‌ها…</p>}
      {current?.error && <p role="alert">{current.error} <button type="button" className="btn btn-ghost btn-sm" onClick={() => setReload(value => value + 1)}>تلاش دوباره</button></p>}
      {data && <dl className={styles.summary}>
        {stageEntries.map(([value, label]) => <div key={value}><dt>{label}</dt><dd>{fa(data.stats.counts[value] || 0)}</dd></div>)}
        <div><dt>راکد بیش از ۱۴ روز</dt><dd>{fa(data.stats.stale)}</dd></div>
        <div><dt>نرخ موفقیت</dt><dd>{fa(data.stats.successRate)}٪</dd></div>
        <div><dt>ارزش فرصت‌های موفق</dt><dd>{data.stats.wonTotals.length ? data.stats.wonTotals.map(item => formatAmount(item.amountMinor, item.currency)).join('، ') : '—'}</dd></div>
      </dl>}
    </section>
    {data?.commerce && <section className={styles.panel} aria-labelledby="sales-commerce-heading">
      <h2 id="sales-commerce-heading">تبدیل فرصت به سفارش پرداخت‌شده</h2>
      <dl className={styles.summary}>
        <div><dt>فرصت‌های بررسی‌شده</dt><dd>{fa(data.commerce.opportunities)}</dd></div>
        <div><dt>فرصت‌های دارای سفارش پرداخت‌شده</dt><dd>{fa(data.commerce.paidOpportunities)}</dd></div>
        <div><dt>نرخ تبدیل</dt><dd>{fa(data.commerce.conversionRate)}٪</dd></div>
        {data.commerce.totals.map(total => <div key={total.currency}><dt>برآورد و فروش فرصت‌های پرداخت‌شده</dt><dd>{formatAmount(total.estimatedMinor, total.currency)} / {formatAmount(total.paidMinor, total.currency)}</dd></div>)}
      </dl>
    </section>}
    {filterOptions && (
      <div className={styles.toolbar}>
        <label>مرحله<select className="input" aria-label="فیلتر مرحله" value={stage} onChange={event => changeFilter({ stage: event.target.value })}><option value="">همهٔ مراحل</option>{stageEntries.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {filterOptions.canManage && <label>مسئول<select className="input" aria-label="فیلتر مسئول" value={owner} onChange={event => changeFilter({ owner: event.target.value === 'mine' ? '' : event.target.value })}><option value="mine">فرصت‌های من</option><option value="all">همهٔ مسئولان</option><option value="unassigned">بدون مسئول</option>{filterOptions.staff.map(person => <option value={person.id} key={person.id}>{person.name}</option>)}</select></label>}
        <button className="btn btn-ghost" type="button" aria-pressed={stale} onClick={() => changeFilter({ stale: stale ? '' : '1' })}>فرصت‌های راکد</button>
        {userId && <Link className="sa-link" href={href(query, { userId: '', create: '' })}>نمایش همهٔ مشتریان</Link>}
      </div>
    )}
    {data && <>
      <section aria-labelledby="sales-board-heading"><h2 id="sales-board-heading">تابلوی فرصت‌ها</h2>
        <div className={styles.stages}>{stageEntries.filter(([value]) => !stage || value === stage).map(([value, label]) => {
          const items = data.rows.filter(row => row.stage === value)
          return <section className={styles.stage} key={value} aria-labelledby={`stage-${value}`}>
            <h3 id={`stage-${value}`}>{label}<span>{fa(data.stats.counts[value] || 0)}</span></h3>
            {items.length ? <ul>{items.map(row => <li key={row.id}>
              <button type="button" onClick={() => { setCreating(false); openDetail(row.id) }}>{row.title}</button>
              <Link className="sa-link" href={`/admin/crm/${row.userId}`}>{row.userName || `مشتری ${fa(row.userId)}`}</Link>
              <span>{formatAmount(row.amountMinor, row.currency)}</span>
              <small>{row.assigneeName || 'بدون مسئول'}</small>
            </li>)}</ul> : <p className={styles.muted}>در این صفحه فرصتی نیست.</p>}
          </section>
        })}</div>
      </section>
      {data.pageCount > 1 && <nav className={styles.pager} aria-label="صفحه‌بندی فرصت‌ها"><span>صفحهٔ {fa(data.page)} از {fa(data.pageCount)}</span><div className={styles.actions}>
        {data.page > 1 && <Link className="btn btn-ghost" href={href(query, { page: String(data.page - 1) })}>صفحهٔ پیشین</Link>}
        {data.page < data.pageCount && <Link className="btn btn-ghost" href={href(query, { page: String(data.page + 1) })}>صفحهٔ بعدی</Link>}
      </div></nav>}
    </>}
  </div>
}

export default function OpportunitiesPage() {
  return <Suspense fallback={<p role="status">در حال دریافت فرصت‌ها…</p>}><SalesDesk /></Suspense>
}
