import Link from '@/components/AppLink'
import type { AuthorView } from '@/modules/forum/server/forum'
import { sized } from '@/shared/media/image'

// Small building blocks shared by forum pages (server-safe, no hooks).

/** "۳ ساعت پیش" style relative time with an absolute tooltip. */
export function TimeAgo({ date, fa = true, short = false }: { date: Date | string; fa?: boolean; short?: boolean }) {
  const value = new Date(date)
  const seconds = Math.max(0, Math.round((Date.now() - value.getTime()) / 1000))
  const steps: [number, string, string][] = [[60, 'ثانیه', 'second'], [60, 'دقیقه', 'minute'], [24, 'ساعت', 'hour'], [30, 'روز', 'day'], [12, 'ماه', 'month'], [Infinity, 'سال', 'year']]
  let amount = seconds
  let label = steps[0]
  for (const step of steps) { label = step; if (amount < step[0]) break; amount = Math.floor(amount / step[0]) }
  const n = amount.toLocaleString(fa ? 'fa-IR' : 'en-US')
  const text = seconds < 45 ? (fa ? 'همین حالا' : 'just now') : fa ? `${n} ${label[1]}${short ? '' : ' پیش'}` : `${n} ${label[2]}${amount === 1 ? '' : 's'}${short ? '' : ' ago'}`
  return <time dateTime={value.toISOString()} title={value.toLocaleString(fa ? 'fa-IR' : 'en-US', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Asia/Tehran' })}>{text}</time>
}

type AvatarAuthor = Pick<AuthorView, 'name' | 'avatarColor'> & Partial<Pick<AuthorView, 'avatar' | 'username'>>

export function Avatar({ author, size = 40, className = '' }: { author: AvatarAuthor; size?: number; className?: string }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.42) }
  if (author.avatar) return <img className={`fx-avatar ${className}`} src={sized(author.avatar, size * 2)} alt="" width={size} height={size} style={style} loading="lazy" />
  return <span className={`fx-avatar ${className}`} style={{ ...style, background: author.avatarColor || 'var(--md-accent)' }} aria-hidden="true">{(author.name || author.username || '?').trim().slice(0, 1)}</span>
}

/** Name linking to the profile, with group flair and staff shield. */
export function UserName({ author, showHandle = false }: { author: AuthorView; showHandle?: boolean }) {
  return (
    <span className="fx-user">
      <Link href={`/forum/u/${author.username}`} className="fx-user-name">{author.name}</Link>
      {author.staff && <span className="fx-staff" title="تیم موبوکام" aria-label="تیم موبوکام">🛡</span>}
      {author.flair && <span className="fx-flair" style={{ background: author.flair.color }} title={author.flair.name} role="img" aria-label={author.flair.name}>{author.flair.icon}</span>}
      {showHandle && <bdi className="fx-handle" dir="ltr">@{author.username}</bdi>}
    </span>
  )
}

export function CategoryBadge({ category, link = true }: { category: { slug: string; title: string; color: string; icon?: string }; link?: boolean }) {
  const inner = <><i style={{ background: category.color }} aria-hidden="true" />{category.title}</>
  return link ? <Link href={`/forum/c/${category.slug}`} className="fx-cat">{inner}</Link> : <span className="fx-cat">{inner}</span>
}

export function TagChip({ name }: { name: string }) {
  return <Link href={`/forum/tag/${encodeURIComponent(name)}`} className="fx-tag">#{name}</Link>
}

export const num = (value: number, fa = true) => value.toLocaleString(fa ? 'fa-IR' : 'en-US')

/** 1.2هزار style compact numbers for lists. */
export function compact(value: number): string {
  if (value < 1000) return num(value)
  if (value < 1_000_000) return `${num(Math.round(value / 100) / 10)}هزار`
  return `${num(Math.round(value / 100_000) / 10)}م`
}

export function Pager({ page, pages, href, fa = true }: { page: number; pages: number; href: (page: number) => string; fa?: boolean }) {
  if (pages <= 1) return null
  const around = [...new Set([1, page - 2, page - 1, page, page + 1, page + 2, pages])].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b)
  return (
    <nav className="fx-pager" aria-label={fa ? 'صفحه‌ها' : 'Pages'}>
      {page > 1 && <Link href={href(page - 1)} rel="prev">{fa ? 'قبلی' : 'Prev'}</Link>}
      {around.map((n, i) => <span key={n}>{i > 0 && around[i - 1] !== n - 1 && <em>…</em>}{n === page ? <b aria-current="page">{num(n, fa)}</b> : <Link href={href(n)}>{num(n, fa)}</Link>}</span>)}
      {page < pages && <Link href={href(page + 1)} rel="next">{fa ? 'بعدی' : 'Next'}</Link>}
    </nav>
  )
}

const TRUST_SHORT = ['تازه‌وارد', 'پایه', 'عضو', 'همیشگی', 'رهبر']
export function TrustBadge({ level }: { level: number }) {
  return <span className={`fx-trust is-${level}`} title={`سطح اعتماد ${num(level)}`}>{TRUST_SHORT[level] || ''}</span>
}
