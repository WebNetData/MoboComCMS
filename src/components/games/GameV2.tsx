import Link from 'next/link'
import type { GameCard as Game } from '@/modules/media/server/queries'
import { GAME_MODES, LOCALIZATIONS, UPDATE_KINDS, formatHours, releaseState, type UpdateKind } from '@/modules/games/domain/games'
import { scoreBand } from '@/modules/media/domain/media'
import { Icon, platformIcon } from '@/components/media/PortalIcons'
import LinkBox from '@/components/media/LinkBox'
import { GxTitle } from '@/components/games/GamePortal'

// GameUp-style building blocks for the game page, release calendar, top
// lists, franchises and the member's library.

const fa = (value: number) => value.toLocaleString('fa-IR')
const longDay = (value: Date | string | null) => (value ? new Date(value).toLocaleDateString('fa-IR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '')
const BAND_LABEL = { great: 'تحسین جهانی', good: 'مثبت', mixed: 'متوسط', bad: 'ضعیف', none: '' } as const

/** Critic score ring (Metacritic bands), editor verdict and the member score. */
export function ScoreCard({ score, verdict, member, showMember }: { score: number | null; verdict: string; member: { value: number | null; count: number }; showMember: boolean }) {
  const band = scoreBand(score)
  const pct = score ?? 0
  return <section className="gv-card gv-scorecard" aria-label="امتیازها">
    <div className="gv-score-row">
      <div className={`gv-ring band-${band}`} style={{ ['--pct' as string]: `${pct}` }} role="img" aria-label={score !== null ? `نمرهٔ منتقدان ${fa(score)} از ۱۰۰` : 'هنوز نمره‌ای ثبت نشده'}>
        <b>{score !== null ? fa(score) : '—'}</b>
      </div>
      <div className="gv-score-copy">
        <small>نمرهٔ موبوکام</small>
        <b>{score !== null ? BAND_LABEL[band] : 'در انتظار نقد'}</b>
        {verdict && <p>{verdict}</p>}
      </div>
    </div>
    {showMember && <div className="gv-member">
      <span className="gv-member-value num">{member.value !== null ? member.value.toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—'}<small>/۱۰</small></span>
      <span><b>نمرهٔ کاربران</b><small>{member.count ? `از ${fa(member.count)} رأی` : member.value !== null ? 'برآورد سردبیر' : 'هنوز رأیی نیست'}</small></span>
      <a href="#reviews" className="gv-link">امتیاز بدهید</a>
    </div>}
  </section>
}

/** Released / "N days to release" / TBA pill. */
export function ReleasePill({ date }: { date: Date | string | null }) {
  const state = releaseState(date)
  if (state.state === 'tba') return <span className="gv-pill is-tba">تاریخ انتشار: اعلام نشده</span>
  if (state.state === 'upcoming') return <span className="gv-pill is-soon"><Icon name="clock" size={13} />{state.days === 1 ? 'فردا منتشر می‌شود' : `${fa(state.days!)} روز تا انتشار`}</span>
  return <span className="gv-pill"><Icon name="calendar" size={13} />منتشر شده · {longDay(date)}</span>
}

export function Badges({ editorsChoice, localization, modes }: { editorsChoice: boolean; localization: string[]; modes?: string[] }) {
  if (!editorsChoice && !localization.length && !modes?.length) return null
  return <div className="gv-badges">
    {editorsChoice && <span className="gv-badge is-editor"><Icon name="trophy" size={13} />انتخاب سردبیر</span>}
    {localization.map((code) => <span key={code} className="gv-badge is-fa">{LOCALIZATIONS[code as keyof typeof LOCALIZATIONS] || code}</span>)}
    {modes?.map((code) => <span key={code} className="gv-badge">{GAME_MODES[code as keyof typeof GAME_MODES] || code}</span>)}
  </div>
}

/** Sticky in-page navigation. */
export function SectionNav({ items }: { items: [string, string][] }) {
  return <nav className="gv-secnav" aria-label="بخش‌های صفحه"><div className="container">{items.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}</div></nav>
}

type Fact = [string, React.ReactNode]

/** Game identity card: facts, per-platform releases, playtime, stores. */
export function InfoCard({ facts, releases, play, stores }: { facts: Fact[]; releases: { platform: string; date: string }[]; play: { main: number; extra: number; complete: number }; stores: { store: string; url: string }[] }) {
  const hasPlay = play.main || play.extra || play.complete
  return <>
    <section className="gv-card"><h2 className="gv-card-title">مشخصات بازی</h2>
      <dl className="gv-facts">{facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
    </section>
    {releases.length > 0 && <section className="gv-card"><h2 className="gv-card-title">انتشار روی پلتفرم‌ها</h2>
      <ul className="gv-releases">{releases.map((release) => <li key={release.platform}><span><Icon name={platformIcon(release.platform)} size={14} />{release.platform}</span><time dateTime={release.date}>{longDay(release.date)}</time></li>)}</ul>
    </section>}
    {hasPlay ? <section className="gv-card"><h2 className="gv-card-title">چقدر طول می‌کشد؟</h2>
      <ul className="gv-play">
        {([['داستان اصلی', play.main], ['اصلی + جانبی', play.extra], ['تکمیل ۱۰۰٪', play.complete]] as [string, number][]).filter(([, h]) => h).map(([label, h]) => <li key={label}><b className="num">{formatHours(h)}</b><small>{label}</small></li>)}
      </ul>
    </section> : null}
    {stores.length > 0 && <section className="gv-card"><h2 className="gv-card-title">خرید از فروشگاه‌های رسمی</h2>
      <div className="gv-stores">{stores.map((store) => <a key={store.store} href={store.url} target="_blank" rel="noopener noreferrer nofollow">{store.store}<Icon name="arrow" size={13} /></a>)}</div>
    </section>}
  </>
}

export type UpdateView = { id: number; kind: UpdateKind; title: string; version: string; size: string; notes: string; releasedAt: string; links: { id: number; label: string; kind: string; quality: string; size: string; audio: string; subtitle: boolean; access: string }[] }

/** Updates, patches, DLCs and editions as a timeline; each can carry its own protected links. */
export async function UpdatesTimeline({ updates, member, loggedIn, locked }: { updates: UpdateView[]; member: boolean; loggedIn: boolean; locked: boolean }) {
  if (!updates.length) return null
  return <section id="updates" className="gv-section">
    <GxTitle title="آپدیت‌ها و محتوای الحاقی" icon="refresh" />
    <ol className="gv-timeline">{updates.map((update) => <li key={update.id} className={`is-${update.kind.toLowerCase()}`}>
      <div className="gv-tl-head">
        <span className="gv-kind">{UPDATE_KINDS[update.kind]}</span>
        <b>{update.title}</b>
        {update.version && <bdi dir="ltr" className="gv-version">v{update.version.replace(/^v/i, '')}</bdi>}
        <time dateTime={update.releasedAt}>{longDay(update.releasedAt)}</time>
        {update.size && <small>{update.size}</small>}
      </div>
      {update.notes && <p className="gv-notes">{update.notes}</p>}
      {update.links.length > 0 && <LinkBox links={update.links} fa member={member} loggedIn={loggedIn} parentLocked={locked} compact />}
    </li>)}</ol>
  </section>
}

type Post = { slug: string; title: string; excerpt: string; cover: string; publishedAt: Date; category: { name: string } | null }

export function NewsList({ posts, title }: { posts: Post[]; title: string }) {
  if (!posts.length) return null
  return <section id="news" className="gv-section">
    <GxTitle title={title} icon="sparkle" more="/blog" />
    <div className="gv-news">{posts.map((post) => <Link key={post.slug} href={`/blog/${post.slug}`} className="gv-news-item">
      {post.cover ? <img src={post.cover} alt="" loading="lazy" /> : <span className="gv-news-ph" />}
      <span><small>{post.category?.name || 'خبر'} · {longDay(post.publishedAt)}</small><b>{post.title}</b></span>
    </Link>)}</div>
  </section>
}

// ------------------------------------------------------------------ calendar

const WEEKDAYS = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه']

export type CalendarData = { month: { key: string; label: string; prev: string; next: string; days: number; firstWeekday: number; start: Date }; entries: { day: string; platforms: string[]; game: Game }[] }

/** Month grid (Saturday first) with covers on release days, plus a day-by-day list for small screens. */
export function CalendarGrid({ data, href }: { data: CalendarData; href: (month: string) => string }) {
  const { month, entries } = data
  const byDay = new Map<string, typeof entries>()
  for (const entry of entries) byDay.set(entry.day, [...(byDay.get(entry.day) || []), entry])
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(new Date())
  const cells: (string | null)[] = [...Array(month.firstWeekday).fill(null), ...Array.from({ length: month.days }, (_, i) => new Date(month.start.getTime() + i * 86_400_000).toISOString().slice(0, 10))]
  while (cells.length % 7) cells.push(null)
  return <div className="gv-cal">
    <header className="gv-cal-head">
      <Link href={href(month.prev)} className="gv-cal-nav" rel="prev" aria-label="ماه قبل">›</Link>
      <h2>{month.label}</h2>
      <Link href={href(month.next)} className="gv-cal-nav" rel="next" aria-label="ماه بعد">‹</Link>
      <span className="gv-cal-count">{entries.length ? `${fa(entries.length)} انتشار` : 'انتشاری ثبت نشده'}</span>
    </header>
    <div className="gv-cal-grid" role="grid" aria-label={`تقویم انتشار ${month.label}`}>
      {WEEKDAYS.map((name) => <div key={name} className="gv-cal-wd" role="columnheader">{name}</div>)}
      {cells.map((day, index) => {
        if (!day) return <div key={`x${index}`} className="gv-cal-cell is-empty" aria-hidden="true" />
        const list = byDay.get(day) || []
        const jd = index - month.firstWeekday + 1
        return <div key={day} role="gridcell" className={`gv-cal-cell${list.length ? ' has-games' : ''}${day === today ? ' is-today' : ''}`}>
          <span className="gv-cal-day num">{fa(jd)}</span>
          {list.slice(0, 3).map((entry) => <Link key={`${entry.game.id}-${entry.platforms.join()}`} href={`/games/${entry.game.slug}`} className="gv-cal-game" title={`${entry.game.title} — ${entry.platforms.join('، ')}`}>
            {entry.game.cover ? <img src={entry.game.cover} alt="" loading="lazy" /> : <span className="gv-cal-ph"><Icon name="gamepad" size={14} /></span>}
            <span>{entry.game.title}</span>
          </Link>)}
          {list.length > 3 && <small className="gv-cal-more">+{fa(list.length - 3)}</small>}
        </div>
      })}
    </div>
    {entries.length > 0 && <ol className="gv-cal-list" aria-label="فهرست انتشارها">{entries.map((entry) => <li key={`${entry.day}-${entry.game.id}-${entry.platforms.join()}`}>
      <time dateTime={entry.day}>{new Date(`${entry.day}T12:00:00Z`).toLocaleDateString('fa-IR', { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'UTC' })}</time>
      <Link href={`/games/${entry.game.slug}`}>
        {entry.game.cover ? <img src={entry.game.cover} alt="" loading="lazy" /> : <span className="gv-cal-ph"><Icon name="gamepad" size={16} /></span>}
        <span><b>{entry.game.title}</b><small>{entry.platforms.join(' · ')}{entry.game.genres[0] ? ` — ${entry.game.genres[0]}` : ''}</small></span>
        {entry.game.editorsChoice && <span className="gv-badge is-editor">سردبیر</span>}
      </Link>
    </li>)}</ol>}
  </div>
}

/** Compact "coming soon" list for the home page. */
export function UpcomingList({ games }: { games: Game[] }) {
  if (!games.length) return null
  return <section className="container gv-section">
    <GxTitle title="به‌زودی" icon="clock" more="/games/calendar" />
    <div className="gv-upcoming">{games.slice(0, 8).map((game) => {
      const state = releaseState(game.releaseDate)
      return <Link key={game.id} href={`/games/${game.slug}`} className="gv-up-card">
        <span className="gv-up-art" style={game.backdrop ? { backgroundImage: `url("${encodeURI(game.backdrop)}")` } : undefined}>
          <span className="gv-up-days"><b className="num">{fa(state.days || 0)}</b><small>روز</small></span>
        </span>
        <b>{game.title}</b>
        <small>{longDay(game.releaseDate)} · {game.platforms.slice(0, 3).join('، ')}</small>
      </Link>
    })}</div>
  </section>
}

// ------------------------------------------------------------------ top lists, franchises, library

export function RankedList({ rows, by }: { rows: { game: Game; verdict: string; member: { value: number | null; count: number } }[]; by: 'critics' | 'members' }) {
  return <ol className="gv-ranked">{rows.map((row, index) => <li key={row.game.id}>
    <span className="gv-rank num">{fa(index + 1)}</span>
    <Link href={`/games/${row.game.slug}`} className="gv-ranked-art">{row.game.cover ? <img src={row.game.cover} alt="" loading="lazy" /> : <Icon name="gamepad" size={22} />}</Link>
    <div className="gv-ranked-copy">
      <Link href={`/games/${row.game.slug}`}><b>{row.game.title}</b></Link>
      <small>{[row.game.releaseDate ? new Date(row.game.releaseDate).getUTCFullYear().toLocaleString('fa-IR', { useGrouping: false }) : '', row.game.developer, row.game.platforms.slice(0, 4).join('، ')].filter(Boolean).join(' · ')}</small>
      {row.verdict && <p>{row.verdict}</p>}
    </div>
    {by === 'critics'
      ? <span className={`gm-score band-${scoreBand(row.game.score)}`} title="نمرهٔ منتقدان">{row.game.score !== null ? fa(row.game.score) : '—'}</span>
      : <span className="gv-member-chip" title={`${fa(row.member.count)} رأی`}>{row.member.value?.toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}<small>/۱۰</small></span>}
  </li>)}</ol>
}

export function FranchiseTiles({ items, title = 'مجموعه‌ها' }: { items: { slug: string; title: string; titleEn: string; image: string; count: number }[]; title?: string }) {
  if (!items.length) return null
  return <section className="container gv-section">
    <GxTitle title={title} icon="apps" more="/games/franchises" />
    <div className="gv-franchises">{items.map((item) => <Link key={item.slug} href={`/games/franchise/${item.slug}`} className="gv-franchise" style={item.image ? { backgroundImage: `url("${encodeURI(item.image)}")` } : undefined}>
      <span className="gv-franchise-shade" aria-hidden="true" />
      <b>{item.title}</b>
      <small>{item.titleEn && <bdi dir="ltr">{item.titleEn}</bdi>} · {fa(item.count)} بازی</small>
    </Link>)}</div>
  </section>
}

/** Most-wanted rail: covers with the number of members waiting. */
export function WantedRail({ rows }: { rows: { wants: number; game: Game }[] }) {
  if (!rows.length) return null
  return <section className="gx-rail-wrap">
    <div className="container"><GxTitle title="موردانتظارترین‌ها از نگاه کاربران" icon="star" more="/games/calendar" /></div>
    <div className="gx-rail"><div className="gx-rail-track">{rows.map(({ wants, game }) => <Link key={game.id} href={`/games/${game.slug}`} className="gx-cover">
      <span className="gx-cover-art">{game.cover ? <img src={game.cover} alt="" loading="lazy" /> : <span className="gx-cover-ph"><Icon name="gamepad" size={34} /></span>}<span className="gv-wants">★ {fa(wants)}</span></span>
      <b>{game.title}</b>
    </Link>)}</div></div>
  </section>
}
