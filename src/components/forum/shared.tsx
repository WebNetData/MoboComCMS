import type { AuthorView } from '@/modules/forum/server/forum'

/** "۳ ساعت پیش" style relative time with an absolute tooltip. */
export function TimeAgo({ date, fa }: { date: Date | string; fa: boolean }) {
  const value = new Date(date)
  const seconds = Math.max(0, Math.round((Date.now() - value.getTime()) / 1000))
  const steps: [number, string, string][] = [[60, 'ثانیه', 'second'], [60, 'دقیقه', 'minute'], [24, 'ساعت', 'hour'], [30, 'روز', 'day'], [12, 'ماه', 'month'], [Infinity, 'سال', 'year']]
  let amount = seconds
  let label = steps[0]
  for (const step of steps) { label = step; if (amount < step[0]) break; amount = Math.floor(amount / step[0]) }
  const text = seconds < 45 ? (fa ? 'همین حالا' : 'just now') : fa ? `${amount.toLocaleString('fa-IR')} ${label[1]} پیش` : `${amount} ${label[2]}${amount === 1 ? '' : 's'} ago`
  return <time dateTime={value.toISOString()} title={value.toLocaleString(fa ? 'fa-IR' : 'en-US')}>{text}</time>
}

export function Avatar({ author, size = 40 }: { author: Pick<AuthorView, 'name' | 'avatarColor'>; size?: number }) {
  return <span className="fr-avatar" style={{ width: size, height: size, background: author.avatarColor || 'var(--primary)', fontSize: size * 0.42 }} aria-hidden="true">{(author.name || '?').trim().slice(0, 1)}</span>
}

export function Pager({ page, pages, href, fa }: { page: number; pages: number; href: (page: number) => string; fa: boolean }) {
  if (pages <= 1) return null
  const around = [...new Set([1, page - 2, page - 1, page, page + 1, page + 2, pages])].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b)
  return <nav className="md-pager" aria-label={fa ? 'صفحه‌ها' : 'Pages'}>{around.map((n, i) => <span key={n} className="fr-page">{i > 0 && around[i - 1] !== n - 1 && <em>…</em>}{n === page ? <b aria-current="page">{n.toLocaleString(fa ? 'fa-IR' : 'en-US')}</b> : <a href={href(n)}>{n.toLocaleString(fa ? 'fa-IR' : 'en-US')}</a>}</span>)}</nav>
}
