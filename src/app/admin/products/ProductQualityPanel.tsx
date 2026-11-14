'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from '@/components/AppLink'
import type { CatalogQualityIssue, CatalogQualityRow, CatalogQualityPage } from '@/modules/catalog/server/quality'

type Filter = 'all' | CatalogQualityIssue
const ISSUE_LABEL: Record<CatalogQualityIssue, string> = {
  photo: 'عکس محصول ثبت نشده', specifications: 'مشخصات ناقص است', price: 'قیمت معتبر ندارد',
  variants: 'گونه‌های الزامی ثبت نشده‌اند', health: 'گزارش سلامت کالای کارکرده یا بازسازی‌شده ثبت نشده', warranty: 'وضعیت ضمانت ثبت نشده',
}
const PAGE_SIZE = 50

async function readPage(after = 0, through?: number): Promise<CatalogQualityPage> {
  const params = new URLSearchParams({ after: String(after) })
  if (through !== undefined) params.set('through', String(through))
  const response = await fetch(`/api/admin/catalog/quality?${params}`, { cache: 'no-store' })
  if (!response.ok) throw new Error('quality read failed')
  return response.json()
}

export default function ProductQualityPanel() {
  const [rows, setRows] = useState<CatalogQualityRow[]>([])
  const [total, setTotal] = useState(0)
  const [throughId, setThroughId] = useState<number | undefined>()
  const [nextAfter, setNextAfter] = useState<number | null>(0)
  const [filter, setFilter] = useState<Filter>('all')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError(false); setRows([]); setNextAfter(0)
    readPage().then(page => {
      if (controller.signal.aborted) return
      setRows(page.rows); setTotal(page.total); setThroughId(page.throughId); setNextAfter(page.nextAfter)
    }).catch(() => { if (!controller.signal.aborted) setError(true) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [attempt])

  const visible = useMemo(() => rows.filter(row => filter === 'all' ? row.issues.length > 0 : row.issues.includes(filter)), [rows, filter])
  const withIssues = useMemo(() => rows.filter(row => row.issues.length > 0).length, [rows])
  async function loadMore() {
    if (nextAfter === null || loadingMore) return
    setLoadingMore(true); setError(false)
    try {
      const page = await readPage(nextAfter, throughId)
      setRows(current => [...current, ...page.rows]); setTotal(page.total); setThroughId(page.throughId); setNextAfter(page.nextAfter)
    } catch { setError(true) } finally { setLoadingMore(false) }
  }

  return <section className="sa-card" aria-labelledby="product-quality-title">
    <header className="sa-card-head"><h2 id="product-quality-title">کیفیت اطلاعات فهرست</h2>{rows.length > 0 && <span className="sa-tag">{withIssues.toLocaleString('fa-IR')} مورد ناقص در موارد بارگذاری‌شده</span>}</header>
    <p className="muted">موارد ناقص را بازبینی و دستی اصلاح کنید؛ هیچ تغییری به‌صورت خودکار انجام نمی‌شود. فیلتر روی موارد بارگذاری‌شده اعمال می‌شود.</p>
    <p><Link className="sa-link" href="/admin/store/products">اصلاح گروهی قیمت، دسته و برند در مدیریت محصولات</Link></p>
    <div className="sa-grid" role="group" aria-label="فیلترهای تکمیل اطلاعات">
      {(['all', 'photo', 'specifications', 'price', 'variants', 'health', 'warranty'] as const).map(key => <button key={key} type="button" className={`btn ${filter === key ? 'btn-primary' : 'btn-secondary'}`} aria-pressed={filter === key} onClick={() => setFilter(key)}>{key === 'all' ? 'همهٔ موارد' : ISSUE_LABEL[key]}</button>)}
    </div>
    {loading && <p role="status" className="muted">در حال بررسی محصولات…</p>}
    {!loading && !error && total === 0 && <p role="status" className="muted">هنوز محصولی برای بررسی ثبت نشده است.</p>}
    {error && <div role="alert"><p>دریافت گزارش کیفیت انجام نشد.</p><button type="button" className="btn btn-secondary" onClick={() => nextAfter !== null && rows.length ? void loadMore() : setAttempt(value => value + 1)}>تلاش دوباره</button></div>}
    {!loading && rows.length > 0 && <p role="status" className="muted">{rows.length.toLocaleString('fa-IR')} محصول از {total.toLocaleString('fa-IR')} محصول بارگذاری شده است.</p>}
    {!loading && rows.length > 0 && !visible.length && <p role="status" className="muted">در موارد بارگذاری‌شده موردی برای این فیلتر پیدا نشد.</p>}
    {visible.length > 0 && <ul className="sa-list">{visible.map(row => <li key={row.id}><div className="sa-card-head"><div className="sa-grow"><b>{row.name}</b><small dir="ltr">{row.slug}</small></div><Link className="btn btn-secondary" href={row.editHref}>ویرایش</Link></div><ul>{row.issues.map(issue => <li key={issue}>{ISSUE_LABEL[issue]}</li>)}</ul></li>)}</ul>}
    {nextAfter !== null && !loading && <button type="button" className="btn btn-secondary" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? 'در حال بارگذاری…' : `بارگذاری ${PAGE_SIZE} محصول دیگر`}</button>}
    {!loading && nextAfter === null && rows.length > 0 && <small className="muted">همهٔ {total.toLocaleString('fa-IR')} محصول تا شناسهٔ {throughId?.toLocaleString('fa-IR')} بررسی شدند.</small>}
  </section>
}
