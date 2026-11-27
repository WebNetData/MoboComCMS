'use client'

import { Suspense, useEffect, useState, type FormEvent } from 'react'
import Link from '@/components/AppLink'
import { useModuleEnabled } from '@/extensions/client/ExtensionProvider'
import { FOLLOW_UP_QUEUE_PATH } from '@/modules/livechat/domain/crm-follow-up-queue'
import { useRouter, useSearchParams } from '@/platform/routing/navigation'
import { CRM_SEGMENTS, CRM_SORTS, CRM_STATUSES, CRM_TITLE, crmDeskFilters, type CrmDeskPage } from '@/modules/livechat/domain/crm-desk'
import { fa, faDate } from '../store/shared'
import styles from './desk.module.css'

type Result = { key: string; data?: CrmDeskPage; error?: string }

function Desk() {
  const followUpsOn = useModuleEnabled('livechat')
  const router = useRouter()
  const query = useSearchParams().toString()
  const filters = crmDeskFilters(new URLSearchParams(query))
  const [result, setResult] = useState<Result | null>(null)
  const [retry, setRetry] = useState(0)
  const key = `${query}:${retry}`
  const current = result?.key === key ? result : null
  const data = current?.data
  const applied = Boolean(filters.q || filters.tag || filters.segment || filters.status || filters.sort !== 'recent')

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const response = await fetch(`/api/admin/crm?${query}`, { signal: controller.signal, cache: 'no-store' })
        if (response.status === 403) throw new Error('به مدیریت ارتباط با مشتریان دسترسی ندارید.')
        if (!response.ok) throw new Error('دریافت فهرست مشتریان ممکن نشد.')
        const data: CrmDeskPage = await response.json()
        if (!controller.signal.aborted) setResult({ key, data })
      } catch (error) {
        if (!controller.signal.aborted) setResult({ key, error: error instanceof Error ? error.message : 'دریافت فهرست مشتریان ممکن نشد.' })
      }
    }
    void load()
    return () => controller.abort()
  }, [key, query])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const params = new URLSearchParams()
    for (const [field, value] of new FormData(event.currentTarget)) {
      if (typeof value === 'string' && value.trim() && (field !== 'sort' || value !== 'recent')) params.set(field, value.trim())
    }
    const next = params.toString()
    if (next === query) setRetry(value => value + 1)
    else router.push(next ? `/admin/crm?${next}` : '/admin/crm', { scroll: false })
  }

  function pageHref(page: number) {
    const params = new URLSearchParams(query)
    if (page > 1) params.set('page', String(page))
    else params.delete('page')
    const next = params.toString()
    return next ? `/admin/crm?${next}` : '/admin/crm'
  }

  return <div className={styles.desk} dir="rtl">
    <header className={styles.heading}>
      <div><h1>{CRM_TITLE}</h1><p>مشتریان را پیدا کنید و سابقهٔ خرید و پیگیری هر نفر را در پرونده‌اش ببینید.</p></div>
      <div className={styles.actions}>
        {followUpsOn && data && <Link className="btn btn-ghost" href="/admin/crm/opportunities">فرصت‌های فروش</Link>}
        {followUpsOn && data && <Link className="btn btn-ghost" href={FOLLOW_UP_QUEUE_PATH}>پیگیری‌های من</Link>}
        {data?.mayManageEngagement && <Link className="btn btn-ghost" href="/admin/crm/engagement">ارتباط خودکار و بازاریابی</Link>}
      </div>
    </header>
    <form className={styles.filters} onSubmit={submit} key={JSON.stringify({ ...filters, page: 1 })}>
      <label className={styles.search}>جست‌وجوی مشتری<input className="input" name="q" type="search" maxLength={120} defaultValue={filters.q} placeholder="نام، موبایل، ایمیل یا شناسه" /></label>
      <label>گروه خرید<select className="input" name="segment" defaultValue={filters.segment}><option value="">همه</option>{Object.values(CRM_SEGMENTS).map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
      <label>وضعیت حساب<select className="input" name="status" defaultValue={filters.status}><option value="">همه</option>{Object.entries(CRM_STATUSES).map(([value, title]) => <option key={value} value={value}>{title}</option>)}</select></label>
      <label>برچسب<input className="input" name="tag" list="crm-known-tags" maxLength={24} defaultValue={filters.tag} placeholder="همهٔ برچسب‌ها" /></label>
      <datalist id="crm-known-tags">{data?.tags.map(item => <option key={item.tag} value={item.tag} />)}</datalist>
      <label>چینش<select className="input" name="sort" defaultValue={filters.sort}>{Object.entries(CRM_SORTS).map(([value, title]) => <option key={value} value={value}>{title}</option>)}</select></label>
      <div className={styles.actions}><button className="btn btn-primary" type="submit">اعمال فیلتر</button>{applied && <Link className="btn btn-ghost" href="/admin/crm">پاک کردن</Link>}</div>
    </form>
    <section className={styles.results} aria-labelledby="crm-result-heading" aria-busy={!current}>
      <h2 id="crm-result-heading">فهرست مشتریان</h2>
      {!current && <p role="status" className={styles.feedback}>در حال دریافت مشتریان…</p>}
      {current?.error && <p role="alert" className={styles.feedback}>{current.error} <button type="button" className="btn btn-ghost" onClick={() => setRetry(value => value + 1)}>تلاش دوباره</button></p>}
      {data && <>
        <dl className={styles.summary} aria-label="خلاصهٔ نتایج">
          <div><dt>مشتریان در این نتایج</dt><dd>{fa(data.summary.total)}</dd></div>
          <div><dt>دارای خرید</dt><dd>{fa(data.summary.buyers)}</dd></div>
          <div><dt>در خطر ریزش یا از دست رفته</dt><dd>{fa(data.summary.needsFollowUp)}</dd></div>
        </dl>
        {data.rows.length === 0 ? <p className={styles.feedback}>{applied ? 'مشتری‌ای با این فیلترها پیدا نشد.' : 'هنوز مشتری‌ای ثبت نشده است.'}</p> : <>
          <table className={styles.table} role="table" aria-labelledby="crm-result-heading">
            <thead><tr><th scope="col">مشتری</th><th scope="col">گروه خرید</th><th scope="col">سفارش موفق</th><th scope="col">مجموع خرید</th><th scope="col">آخرین خرید</th><th scope="col">برچسب‌ها</th></tr></thead>
            <tbody>{data.rows.map(row => <tr key={row.id}>
              <th scope="row" className={styles.customer}><Link href={`/admin/crm/${row.id}`} className="sa-link">{row.name || row.email || `مشتری ${fa(row.id)}`}</Link>{(row.phone || (row.name && row.email)) && <bdi dir="ltr">{row.phone || row.email}</bdi>}{row.status === 'BANNED' && <small>حساب مسدود</small>}</th>
              <td><span className={styles.mobileLabel}>گروه خرید</span><span className={styles.segment} data-tone={row.segment.tone}>{row.segment.label}</span></td>
              <td><span className={styles.mobileLabel}>سفارش موفق</span>{fa(row.orders)}</td>
              <td><span className={styles.mobileLabel}>مجموع خرید</span>{fa(row.spend)} تومان</td>
              <td><span className={styles.mobileLabel}>آخرین خرید</span>{row.lastOrderAt ? <time dateTime={row.lastOrderAt}>{faDate(row.lastOrderAt)}</time> : '—'}</td>
              <td><span className={styles.mobileLabel}>برچسب‌ها</span>{row.tags.length ? <span className={styles.tags}>{row.tags.join('، ')}</span> : '—'}</td>
            </tr>)}</tbody>
          </table>
          <nav aria-label="صفحه‌بندی مشتریان" className={styles.pagination}>
            <p>صفحهٔ {fa(data.page)} از {fa(data.pageCount)} · {fa((data.page - 1) * data.pageSize + 1)} تا {fa((data.page - 1) * data.pageSize + data.rows.length)} از {fa(data.summary.total)}</p>
            <div className={styles.actions}>
              {data.page > 1 && <Link className="btn btn-ghost" href={pageHref(data.page - 1)} scroll={false}>صفحهٔ پیشین</Link>}
              {data.page < data.pageCount && <Link className="btn btn-ghost" href={pageHref(data.page + 1)} scroll={false}>صفحهٔ بعدی</Link>}
            </div>
          </nav>
        </>}
      </>}
    </section>
  </div>
}

export default function CrmList() {
  return <Suspense fallback={<p role="status">در حال دریافت مشتریان…</p>}><Desk /></Suspense>
}
