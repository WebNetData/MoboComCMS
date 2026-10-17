import Link from '@/components/AppLink'
import type { ReactNode } from 'react'
import type { GameCard as Game } from '@/modules/media/server/queries'
import { Icon, platformIcon, type IconName } from '@/components/media/PortalIcons'
import TabSwitch from '@/components/site/TabSwitch'
import LiveSearchInput from '@/components/search/LiveSearchInput'
import Slider from '@/components/site/Slider'

// Games portal: GameUp's catalogue (square covers, rails, platform and genre
// tiles, filter bar) blended with Liona's editorial blocks (review band with
// tabs, plus a featured Games post, card grid and quick-read list).

const fa = (value: number) => value.toLocaleString('fa-IR')
const day = (value: Date | null) => (value ? new Date(value).toLocaleDateString('fa-IR', { day: 'numeric', month: 'long', year: 'numeric' }) : '')
const bg = (src: string) => (src ? { backgroundImage: `url("${encodeURI(src)}")` } : undefined)

export function GxTitle({ icon = 'gamepad', title, more }: { icon?: IconName; title: string; more?: string }) {
  return <header className="gx-title"><h2><Icon name={icon} size={18} />{title}</h2>{more && <Link href={more}>مشاهدهٔ همه</Link>}</header>
}

/** Square cover with the platform badge, a corner flag for featured/VIP and the score; title below. */
export function CoverCard({ game }: { game: Game }) {
  const platform = game.platforms[0]
  return <Link href={`/games/${game.slug}`} className="gx-cover">
    <span className="gx-cover-art">
      {game.cover ? <img src={game.cover} alt="" loading="lazy" /> : <span className="gx-cover-ph"><Icon name="gamepad" size={34} /></span>}
      {(game.featured || game.access === 'MEMBERS') && <span className={`gx-flag${game.featured ? '' : ' is-vip'}`} aria-label={game.featured ? 'پیشنهاد ویژه' : 'ویژهٔ VIP'} />}
      {platform && <span className="gx-platform" title={game.platforms.join('، ')}><Icon name={platformIcon(platform)} size={12} /></span>}
      {game.score !== null && <span className="gx-score is-corner">{fa(game.score)}</span>}
    </span>
    <b>{game.title}</b>
    {game.recommendationReason && <small className="gx-cover-reason">{game.recommendationReason}</small>}
  </Link>
}

/** One horizontal rail of covers (scrolls sideways; edge cards fade like GameUp). */
export function GameRail({ title, games, more, icon }: { title: string; games: Game[]; more?: string; icon?: IconName }) {
  if (!games.length) return null
  return <section className="gx-rail-wrap">
    <div className="container"><GxTitle title={title} more={more} icon={icon} /><Slider className="gx-rail-track">{games.map((game) => <CoverCard key={game.id} game={game} />)}</Slider></div>
  </section>
}

const PLATFORM_NOTE: Record<string, string> = { PC: 'Windows', Windows: 'Windows', PS5: 'PlayStation', PS4: 'PlayStation', 'Xbox Series': 'Xbox', 'Xbox One': 'Xbox', Android: 'Android', iOS: 'Apple', Switch: 'Nintendo' }

/** Brand tint per platform family (cards and their icon halo). */
const PLATFORM_TONE: Record<string, string> = { PC: '#3b82f6', Windows: '#3b82f6', PS5: '#2563eb', PS4: '#1d4ed8', 'Xbox Series': '#16a34a', 'Xbox One': '#15803d', Switch: '#e60012', Android: '#22c55e', iOS: '#a1a1aa', Linux: '#f59e0b', macOS: '#a1a1aa' }

/** “By platform”: one even row of brand-tinted cards with the number of games. */
export function PlatformCards({ platforms, counts = {} }: { platforms: string[]; counts?: Record<string, number> }) {
  if (!platforms.length) return null
  const list = platforms.slice(0, 6)
  return <section className="container gx-platforms-row">
    <GxTitle title="بر اساس پلتفرم" icon="grid" more="/games/browse" />
    <nav className="gx-platforms" aria-label="پلتفرم‌ها" style={{ '--gx-n': list.length } as React.CSSProperties}>{list.map((platform) => <Link key={platform} href={`/games/browse?platform=${encodeURIComponent(platform)}`} className="gx-platform-card" style={{ '--tone': PLATFORM_TONE[platform] || 'var(--gx-red)' } as React.CSSProperties}>
      <span className="gx-platform-icon"><Icon name={platformIcon(platform)} size={26} /></span>
      <span className="gx-platform-text"><b dir="auto">{platform}</b><small dir="ltr">{PLATFORM_NOTE[platform] || platform}</small></span>
      {counts[platform] ? <span className="gx-platform-count">{fa(counts[platform])} بازی</span> : null}
      <span className="gx-platform-go" aria-hidden="true"><Icon name="chevron" size={14} /></span>
    </Link>)}</nav>
  </section>
}

export type GenreTile = { key: string; name: string; href: string; image: string; count: number }

/** Genre tiles with artwork (from the games taxonomy). */
export function GenreTiles({ tiles }: { tiles: GenreTile[] }) {
  if (!tiles.length) return null
  return <section className="container gx-genres-wrap">
    <GxTitle title="ژانرها" icon="grid" more="/games/browse" />
    <Slider as="nav" className="gx-genres" label="ژانرها">{tiles.map((tile) => <Link key={tile.key} href={tile.href} className="gx-genre" style={bg(tile.image)}>
      <span className="gx-genre-shade" aria-hidden="true" />
      <b>{tile.name}</b><small>{fa(tile.count)} بازی</small>
    </Link>)}</Slider>
  </section>
}

/** Liona-style review band: backdrop of the lead review, heading block, tabbed review cards. */
export function ReviewBand({ lead, groups }: { lead: Game | undefined; groups: { key: string; label: string; games: Game[] }[] }) {
  const filled = groups.filter((group) => group.games.length)
  if (!lead || !filled.length) return null
  const card = (game: Game) => <Link key={game.id} href={`/games/${game.slug}#review`} className="gx-review-card">
    <span className="gx-review-art" style={bg(game.backdrop || game.cover)}>{game.score !== null && <span className="gx-score">{fa(game.score)}</span>}</span>
    <b>{game.title}</b>
    <span className="gx-review-meta"><span><Icon name="calendar" size={13} />{day(game.publishedAt)}</span><span><Icon name="eye" size={13} />{fa(game.views)}</span></span>
  </Link>
  return <section className="gx-review-band" style={bg(lead.backdrop || lead.cover)}>
    <div className="gx-review-veil" aria-hidden="true" />
    <div className="container gx-review-inner">
      <div className="gx-review-lead">
        <span className="gx-kicker">نقد و بررسی</span>
        <h2><Link href={`/games/${lead.slug}#review`}>{lead.title}</Link></h2>
        {lead.score !== null && <span className="gx-score is-big">{fa(lead.score)}<small>/۱۰۰</small></span>}
        {lead.summary && <p>{lead.summary}</p>}
      </div>
      <TabSwitch className="gx-review-tabs" tabs={filled.map((group) => ({ key: group.key, label: group.label, panel: <div className="gx-review-cards">{group.games.slice(0, 4).map(card)}</div> }))} />
    </div>
    <div className="container"><Link href="/games/browse?sort=score" className="gx-review-more">مشاهدهٔ همهٔ نقد و بررسی‌ها<Icon name="arrow" size={16} /></Link></div>
  </section>
}

/** Server-rendered Games posts reuse the catalogue projection and canonical game URLs. */
function PostStory({ post, featured = false }: { post: Game; featured?: boolean }) {
  return <Link href={`/games/${post.slug}`} className={featured ? 'gx-post-lead' : 'gx-post-card'}>
    <div className="gx-post-art">
      {post.cover ? <img src={post.cover} alt="" width={960} height={600} loading="lazy" /> : <span className="gx-post-placeholder"><Icon name="gamepad" size={48} /></span>}
      <span className="gx-post-category">{post.genres[0] || post.platforms[0] || 'بازی'}</span>
    </div>
    <div className="gx-post-copy">
      <span className="gx-post-meta"><span><Icon name="calendar" size={13} /><time dateTime={new Date(post.publishedAt).toISOString()}>{day(post.publishedAt)}</time></span><span><Icon name="eye" size={13} /><span className="sr-only">بازدید: </span>{fa(post.views)}</span></span>
      <h3 dir="auto">{post.title}</h3>
      {featured && post.summary ? <p dir="auto">{post.summary}</p> : null}
      {featured ? <span className="gx-post-cta">مشاهدهٔ بازی<Icon name="arrow" size={17} /></span> : null}
    </div>
  </Link>
}

export function PostsBlock({ posts, popularPosts }: { posts: Game[]; popularPosts?: Game[] }) {
  if (!posts.length) return null
  const popular = popularPosts?.length ? popularPosts : [...posts].sort((a, b) => b.views - a.views)
  const panel = (items: Game[]) => <div className="gx-post-editorial">
    <PostStory post={items[0]} featured />
    {items.length > 1 ? <div className="gx-post-grid">{items.slice(1, 5).map(post => <PostStory key={post.slug} post={post} />)}</div> : null}
  </div>
  return <section className="container gx-posts" aria-label="آخرین مطالب بازی">
    <div className="gx-posts-heading">
      <GxTitle title="آخرین مطالب بازی" icon="sparkle" more="/games/browse" />
      <p>جدیدترین پست‌های منتشرشده در بخش بازی</p>
    </div>
    <div className="gx-posts-layout">
      <div className="gx-posts-main">
        <TabSwitch className="gx-posts-tabs" label="مرتب‌سازی مطالب بازی" tabs={[
          { key: 'new', label: 'تازه‌ترین‌ها', panel: panel(posts) },
          { key: 'popular', label: 'پربازدیدترین‌ها', panel: panel(popular) },
        ]} />
      </div>
      <aside className="gx-posts-side" aria-label="مرور سریع مطالب">
        <div className="gx-posts-side-head"><Icon name="archive" size={18} /><h3>در یک نگاه</h3><span>جدیدترین بازی‌ها</span></div>
        <ul>{posts.slice(0, 5).map(post => <li key={post.slug}><Link href={`/games/${post.slug}`} className="gx-post-brief">
          <span className="gx-post-brief-art">{post.cover ? <img src={post.cover} alt="" width={128} height={96} loading="lazy" /> : <Icon name="gamepad" size={22} />}</span>
          <span className="gx-post-brief-copy"><small>{post.genres[0] || post.platforms[0] || 'بازی'}</small><b dir="auto">{post.title}</b><time dateTime={new Date(post.publishedAt).toISOString()}>{day(post.publishedAt)}</time></span>
        </Link></li>)}</ul>
        <Link href="/games/browse" className="gx-posts-archive">آرشیو بازی‌ها<Icon name="arrow" size={16} /></Link>
      </aside>
    </div>
  </section>
}

/** GameUp browse header: big search with a red button and filter selects (GET form, works without JS). */
export function BrowseFilters({ action, values, facets, children }: {
  action: string
  values: Record<string, string | undefined>
  facets: { genres: { value: string; label: string }[]; platforms: string[]; developers: string[]; publishers: string[] }
  children?: ReactNode
}) {
  const select = (name: string, label: string, options: { value: string; label: string }[]) => <label className="gx-select"><span>{label}:</span>
    <select name={name} defaultValue={values[name] || ''}><option value="">همه</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
  </label>
  const plain = (list: string[]) => list.map((value) => ({ value, label: value }))
  return <form action={action} className="gx-browse-form" role="search">
    <div className="gx-search"><LiveSearchInput action="/games" defaultValue={values.q} placeholder="نام بازی را جست‌وجو کنید" /><button type="submit">جست‌وجو</button></div>
    <div className="gx-selects">
      {select('platform', 'پلتفرم', plain(facets.platforms))}
      {select('term', 'ژانر', facets.genres)}
      {select('publisher', 'ناشر', plain(facets.publishers))}
      {select('developer', 'تولیدکننده', plain(facets.developers))}
    </div>
    {values.sort && <input type="hidden" name="sort" value={values.sort} />}
    {children}
  </form>
}

export function CoverGrid({ games }: { games: Game[] }) {
  return <div className="gx-grid">{games.map((game) => <CoverCard key={game.id} game={game} />)}</div>
}
