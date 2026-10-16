import Link from '@/components/AppLink'
import { Icon } from '@/components/media/PortalIcons'
import { journalBrowseUrl, journalPageNumbers } from '@/modules/journal/domain/pagination'

export default function JournalPagination({ page, pages, total, first, last, category, query, isFa }: { page: number; pages: number; total: number; first: number; last: number; category: string; query: string; isFa: boolean }) {
  const n = (value: number) => value.toLocaleString(isFa ? 'fa-IR' : 'en-US')
  const href = (value: number) => journalBrowseUrl({ category, query, page: value, archive: true }) + '#journal-results'
  return <nav className="lh-pagination" aria-label={isFa ? 'صفحه‌بندی نوشته‌ها' : 'Article pagination'}>
    <div className="lh-pagination-info"><span>{isFa ? 'آرشیو مجله' : 'Journal archive'}</span><p>{isFa ? `${n(first)} تا ${n(last)} از ${n(total)} مطلب` : `${n(first)}–${n(last)} of ${n(total)} stories`}</p></div>
    <div className="lh-pagination-controls">
      {page > 1 ? <Link href={href(page - 1)} rel="prev" className="lh-page-step is-prev"><Icon name="arrow" size={17} /><span>{isFa ? 'قبلی' : 'Previous'}</span></Link> : <span className="lh-page-step is-prev is-disabled" aria-disabled="true"><Icon name="arrow" size={17} /><span>{isFa ? 'قبلی' : 'Previous'}</span></span>}
      <ol>{journalPageNumbers(page, pages).map(value => <li key={value}>{typeof value !== 'number' ? <span className="lh-page-gap" aria-hidden="true">…</span> : value === page ? <span className="lh-page-number is-current" aria-current="page" aria-label={isFa ? `صفحهٔ ${n(value)}، صفحهٔ فعلی` : `Page ${n(value)}, current page`}>{n(value)}</span> : <Link className="lh-page-number" href={href(value)} aria-label={isFa ? `صفحهٔ ${n(value)}` : `Page ${n(value)}`}>{n(value)}</Link>}</li>)}</ol>
      {page < pages ? <Link href={href(page + 1)} rel="next" className="lh-page-step is-next"><span>{isFa ? 'بعدی' : 'Next'}</span><Icon name="arrow" size={17} /></Link> : <span className="lh-page-step is-next is-disabled" aria-disabled="true"><span>{isFa ? 'بعدی' : 'Next'}</span><Icon name="arrow" size={17} /></span>}
    </div>
    <span className="lh-pagination-position">{isFa ? `صفحهٔ ${n(page)} از ${n(pages)}` : `Page ${n(page)} of ${n(pages)}`}</span>
  </nav>
}
