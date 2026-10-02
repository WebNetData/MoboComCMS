'use client'

import type { AdminPageSize } from '@/modules/content/domain/admin-pagination'

type Props = {
  fa: boolean
  page: number
  pages: number
  size: AdminPageSize
  total: number
  shown: number
  busy?: boolean
  onPage: (page: number) => void
  onSize: (size: AdminPageSize) => void
}

export default function AdminPagination({ fa, page, pages, size, total, shown, busy, onPage, onSize }: Props) {
  const locale = fa ? 'fa-IR' : 'en-US'
  const first = shown ? (size === 'all' ? 1 : (page - 1) * size + 1) : 0
  const last = shown ? first + shown - 1 : 0
  return <nav className="cms-pagination" aria-label={fa ? 'صفحه‌بندی فهرست' : 'List pagination'}>
    <label className="cms-pagination-size">
      <span>{fa ? 'تعداد در هر صفحه' : 'Items per page'}</span>
      <select className="select" aria-label={fa ? 'تعداد در هر صفحه' : 'Items per page'} value={size} disabled={busy} onChange={(event) => onSize(event.target.value === 'all' ? 'all' : Number(event.target.value) as AdminPageSize)}>
        {[20, 50, 100, 500].map((value) => <option key={value} value={value}>{value.toLocaleString(locale)}</option>)}
        <option value="all">{fa ? 'همه پست‌ها' : 'All entries'}</option>
      </select>
    </label>
    <span className="cms-pagination-range" aria-live="polite">{fa ? `${first.toLocaleString(locale)} تا ${last.toLocaleString(locale)} از ${total.toLocaleString(locale)}` : `${first.toLocaleString(locale)}–${last.toLocaleString(locale)} of ${total.toLocaleString(locale)}`}</span>
    {size !== 'all' && <div className="cms-pagination-nav">
      <button type="button" className="btn btn-ghost btn-sm" disabled={busy || page <= 1} onClick={() => onPage(page - 1)}>{fa ? 'قبلی' : 'Previous'}</button>
      <span>{fa ? `صفحه ${page.toLocaleString(locale)} از ${pages.toLocaleString(locale)}` : `Page ${page.toLocaleString(locale)} of ${pages.toLocaleString(locale)}`}</span>
      <button type="button" className="btn btn-ghost btn-sm" disabled={busy || page >= pages} onClick={() => onPage(page + 1)}>{fa ? 'بعدی' : 'Next'}</button>
    </div>}
  </nav>
}
