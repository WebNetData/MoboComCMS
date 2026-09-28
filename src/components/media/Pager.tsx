import Link from '@/components/AppLink'

export default function Pager({ page, pages, href, fa }: { page: number; pages: number; href: (page: number) => string; fa: boolean }) {
  if (pages <= 1) return null
  const list = [...new Set([1, page - 2, page - 1, page, page + 1, page + 2, pages])].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b)
  const num = (p: number) => p.toLocaleString(fa ? 'fa-IR' : 'en-US')
  return (
    <nav className="md-pager" aria-label={fa ? 'صفحه‌بندی' : 'Pagination'}>
      {page > 1 && <Link href={href(page - 1)} rel="prev">{fa ? 'قبلی' : 'Prev'}</Link>}
      {list.map((p, i) => (
        <span key={p} className="md-pager-item">
          {i > 0 && p - list[i - 1] > 1 && <span className="md-pager-gap">…</span>}
          {p === page ? <b aria-current="page">{num(p)}</b> : <Link href={href(p)}>{num(p)}</Link>}
        </span>
      ))}
      {page < pages && <Link href={href(page + 1)} rel="next">{fa ? 'بعدی' : 'Next'}</Link>}
    </nav>
  )
}
