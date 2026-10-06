import type { Metadata } from 'next'
import Link from '@/components/AppLink'
import { requireModule } from '@/extensions/server/modules'
import { getForumViewer } from '@/modules/forum/server/forum'
import { activityStream, streamDay, type StreamEntry, type StreamFilter } from '@/modules/forum/server/stream'
import ForumShell from '@/components/forum/ForumShell'
import { Avatar, TimeAgo } from '@/components/forum/shared'
import { toPublicPath } from '@/platform/routing/aliases'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'فعالیت‌های جامعه', description: 'تازه‌ترین موضوع‌ها، پاسخ‌ها و پست‌های اعضا', alternates: { canonical: toPublicPath('/forum/activity') } }

const VERB: Record<StreamEntry['kind'], string> = { topic: 'موضوع تازه‌ای ساخت', reply: 'پاسخ داد', post: 'پستی نوشت', review: 'نظر داد دربارهٔ' }
const ICON: Record<StreamEntry['kind'], string> = { topic: '✦', reply: '↩', post: '✎', review: '★' }

export default async function ForumActivityPage({ searchParams }: { searchParams: Promise<{ filter?: string; before?: string }> }) {
  await requireModule('forum')
  const [query, viewer] = await Promise.all([searchParams, getForumViewer()])
  const stream = await activityStream(viewer, query)
  const tabs: [StreamFilter, string][] = [['all', 'همه'], ...(stream.following ? [['following', 'کسانی که دنبال می‌کنم'] as [StreamFilter, string]] : []), ['topics', 'موضوع‌های تازه'], ['replies', 'پاسخ‌ها'], ...(stream.posts ? [['posts', 'پست‌های اعضا'] as [StreamFilter, string]] : []), ...(stream.reviews ? [['reviews', 'نظرها'] as [StreamFilter, string]] : [])]
  const hrefFor = (filter: StreamFilter, before?: string) => {
    const params = new URLSearchParams({ ...(filter === 'all' ? {} : { filter }), ...(before ? { before } : {}) }).toString()
    return `/forum/activity${params ? `?${params}` : ''}`
  }
  const now = new Date()
  const today = streamDay(now), yesterday = streamDay(new Date(now.getTime() - 86_400_000))
  const dayLabel = (day: string, at: Date) => day === today ? 'امروز' : day === yesterday ? 'دیروز' : (() => {
    const parts = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Tehran' }).formatToParts(at)
    const part = (type: string) => parts.find((item) => item.type === type)?.value || ''
    return `${part('weekday')} ${part('day')} ${part('month')}`
  })()
  const days: { day: string; label: string; entries: StreamEntry[] }[] = []
  for (const entry of stream.entries) {
    const day = streamDay(entry.at)
    const last = days[days.length - 1]
    if (last && last.day === day) last.entries.push(entry)
    else days.push({ day, label: dayLabel(day, entry.at), entries: [entry] })
  }

  return <ForumShell viewer={viewer} active="activity" wide>
    <header className="fs-head">
      <div><h1>فعالیت‌های جامعه</h1><p className="fx-muted">هر چه اعضا همین حالا می‌نویسند: موضوع‌های تازه، پاسخ‌ها{stream.posts ? ' و پست‌ها' : ''}.</p></div>
      <nav className="fx-strip fs-filters" aria-label="نوع فعالیت">{tabs.map(([key, label]) => <Link key={key} href={hrefFor(key)} className={stream.filter === key ? 'is-active' : ''} aria-current={stream.filter === key ? 'page' : undefined}>{label}</Link>)}</nav>
    </header>
    {days.length ? days.map((group) => <section key={group.day} className="fs-day" aria-labelledby={`fs-${group.day}`}>
      <h2 id={`fs-${group.day}`}><span>{group.label}</span></h2>
      <ol className="fs-list">{group.entries.map((entry) => <li key={entry.key} className={`fs-entry is-${entry.kind}`}>
        <Link href={entry.person.href} className="fs-avatar" aria-label={`پروفایل ${entry.person.name}`}><Avatar author={entry.person} size={44} /><i aria-hidden="true">{ICON[entry.kind]}</i></Link>
        <div className="fs-body">
          <p className="fs-line"><Link href={entry.person.href} className="fs-name">{entry.person.name}</Link> <span>{VERB[entry.kind]}</span>{entry.place && <> <span>در</span> <Link href={entry.place.href} className="fs-place" style={{ ['--cat' as string]: entry.place.color }}>{entry.place.title}</Link></>}<small><TimeAgo date={entry.at} /></small></p>
          <Link href={entry.href} className="fs-card">
            {entry.image && <img src={entry.image} alt="" loading="lazy" />}
            <span>{entry.title && <b>{entry.title}{entry.kind === 'review' && entry.rating ? <em className="fs-stars" aria-label={`${entry.rating.toLocaleString('fa-IR')} از ۵`}>{'★'.repeat(Math.max(0, Math.min(5, entry.rating)))}</em> : null}</b>}{entry.text && <span>{entry.text}</span>}</span>
          </Link>
        </div>
      </li>)}</ol>
    </section>) : stream.filter === 'following'
      ? <div className="fx-empty"><p>{stream.followingCount ? 'کسانی که دنبال می‌کنید هنوز چیزی ننوشته‌اند.' : 'هنوز کسی را دنبال نمی‌کنید. از صفحهٔ اعضا یا پروفایل هر عضو می‌توانید دنبالش کنید.'}</p><Link href="/forum/users" className="btn btn-primary btn-sm">دیدن اعضا</Link></div>
      : <div className="fx-empty"><p>هنوز فعالیتی برای نمایش نیست.</p><Link href="/forum/new" className="btn btn-primary btn-sm">اولین موضوع را بسازید</Link></div>}
    {stream.next && <nav className="fs-more" aria-label="ادامهٔ فعالیت‌ها"><Link href={hrefFor(stream.filter, stream.next)} className="btn btn-ghost" rel="next">فعالیت‌های قدیمی‌تر</Link></nav>}
  </ForumShell>
}
