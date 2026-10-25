import Link from '@/components/AppLink'
import { Fragment, type CSSProperties, type ReactNode } from 'react'
import TabSwitch from '@/components/site/TabSwitch'
import { sized, srcSet } from '@/shared/media/image'
import { Icon, type IconName } from '@/components/media/PortalIcons'

// Journal landing in the Liona layouts (home-2 / home-4 / home-5): cinematic
// hero with a side list, category circles, trending cards, the three-column
// "latest" block, category chips, news grid, weekly popular tabs, the archive
// band and per-category blocks. Presentational only — data comes prepared.

export type LionaCategory = { id: number; name: string; slug: string; color: string; count: number; href: string }
export type LionaStory = {
  id: number; slug: string; title: string; excerpt: string; cover: string; date: string; minutes: number; views: number
  author: string; authorAvatar?: string; category: LionaCategory | null
}

const fa = (value: number) => value.toLocaleString('fa-IR')
const href = (story: LionaStory) => `/blog/${story.slug}`
/** A picture as a background, asked at about the width it covers; a full-width one (0) keeps the original for sharpness. */
const bg = (src: string, width: number): CSSProperties => ({ backgroundImage: `url("${encodeURI(width ? sized(src, width) : src)}")` })

function Badge({ category }: { category: LionaCategory | null }) {
  if (!category) return null
  return <span className="lh-badge" style={{ '--lh-c': category.color } as CSSProperties}>{category.name}</span>
}

function Meta({ story, author = false }: { story: LionaStory; author?: boolean }) {
  return <span className="lh-meta">
    {author && story.author && <span className="lh-author">{story.authorAvatar ? <img className="lh-author-avatar" src={sized(story.authorAvatar, 40)} alt="" width={20} height={20} loading="lazy" decoding="async" /> : <i aria-hidden="true">{story.author.slice(0, 1)}</i>}{story.author}</span>}
    <span><Icon name="calendar" size={13} />{story.date}</span>
    <span><Icon name="clock" size={13} />{fa(story.minutes)} دقیقه</span>
  </span>
}

function Head({ title, sub, more, icon = 'sparkle' }: { title: string; sub?: string; more?: string; icon?: IconName }) {
  return <header className="lh-head">
    <div><h2><Icon name={icon} size={18} />{title}</h2>{sub && <small>{sub}</small>}</div>
    {more && <Link href={more} className="lh-more"><span aria-hidden="true">●</span>مطالب بیشتر…</Link>}
  </header>
}

/** Image card with the text under the picture (trending, news grid). */
function Card({ story, excerpt = true }: { story: LionaStory; excerpt?: boolean }) {
  return <Link href={href(story)} className="lh-card">
    <span className="lh-card-art"><img src={sized(story.cover, 400)} srcSet={srcSet(story.cover, 400)} alt="" loading="lazy" decoding="async" /><Badge category={story.category} /></span>
    <span className="lh-card-body">
      <b>{story.title}</b>
      {excerpt && story.excerpt && <em>{story.excerpt}</em>}
      <Meta story={story} author />
    </span>
  </Link>
}

/** Text over the picture (lead stories, archive band, social block). */
function Overlay({ story, tall = false }: { story: LionaStory; tall?: boolean }) {
  return <Link href={href(story)} className={`lh-overlay${tall ? ' is-tall' : ''}`} style={bg(story.cover, 960)}>
    <span className="lh-overlay-body">
      <Badge category={story.category} />
      <b>{story.title}</b>
      {story.excerpt && <em>{story.excerpt}</em>}
      <Meta story={story} author />
    </span>
  </Link>
}

/** Row with a round thumbnail (side lists, the coloured panel). */
function RoundRow({ story, excerpt = true }: { story: LionaStory; excerpt?: boolean }) {
  return <Link href={href(story)} className="lh-row">
    <img src={sized(story.cover, 80)} alt="" loading="lazy" decoding="async" />
    <span>
      <b>{story.title}</b>
      {excerpt && story.excerpt && <em>{story.excerpt}</em>}
      <span className="lh-row-meta"><Badge category={story.category} /><Meta story={story} /></span>
    </span>
  </Link>
}

/** Row whose background is the picture (the middle “strip” list of home-2). */
function StripRow({ story }: { story: LionaStory }) {
  return <Link href={href(story)} className="lh-strip" style={bg(story.cover, 480)}><Icon name="info" size={14} /><b>{story.title}</b></Link>
}

/** Dark text-only card (per-category block). */
function TextCard({ story }: { story: LionaStory }) {
  return <Link href={href(story)} className="lh-text" style={bg(story.cover, 640)}>
    <Badge category={story.category} />
    <b>{story.title}</b>
    {story.excerpt && <em>{story.excerpt}</em>}
    <Meta story={story} />
  </Link>
}

const CATEGORY_ICONS: IconName[] = ['sparkle', 'gamepad', 'trophy', 'star', 'globe', 'briefcase', 'music', 'film', 'palette', 'code']

export type LionaData = {
  hero: LionaStory | undefined
  heroList: LionaStory[]
  trending: LionaStory[]
  latestLead: LionaStory | undefined
  latestStrip: LionaStory[]
  latestRound: LionaStory[]
  news: LionaStory[]
  newsRows: LionaStory[]
  weekly: { key: string; label: string; stories: LionaStory[] }[]
  archive: LionaStory[]
  categories: LionaCategory[]
  blocks: { category: LionaCategory; stories: LionaStory[] }[]
  panel: { category: LionaCategory; stories: LionaStory[] } | null
  social: LionaStory[]
}

/** Home sections in their default order; `order` (from the journal settings) can reorder or hide them. */
export const LIONA_SECTIONS = ['hero', 'trending', 'latest', 'categories', 'news', 'weekly', 'archive', 'blocks', 'panel', 'social'] as const
export type LionaSection = typeof LIONA_SECTIONS[number]

export default function LionaHome({ data, search, order = LIONA_SECTIONS }: { data: LionaData; search: ReactNode; order?: readonly LionaSection[] }) {
  const { hero } = data
  const sections: Record<LionaSection, () => ReactNode> = {
    hero: () => hero && <section className="lh-hero" style={bg(hero.cover, 0)}>
      <div className="lh-hero-veil" aria-hidden="true" />
      {data.categories.length > 0 && <nav className="container lh-circles" aria-label="دسته‌بندی‌های مجله">{data.categories.map((category, index) => <Link key={category.id} href={category.href} className="lh-circle" style={{ '--lh-c': category.color } as CSSProperties}>
        <span><Icon name={CATEGORY_ICONS[index % CATEGORY_ICONS.length]} size={20} /></span><small>{category.name}</small>
      </Link>)}</nav>}
      <div className="container lh-hero-inner">
        <div className="lh-hero-copy">
          <Badge category={hero.category} />
          <h1><Link href={href(hero)}>{hero.title}</Link></h1>
          {hero.excerpt && <p>{hero.excerpt}</p>}
          <Meta story={hero} author />
          <Link href={href(hero)} className="lh-btn">اطلاعات بیشتر<Icon name="arrow" size={16} /></Link>
        </div>
        {data.heroList.length > 0 && <div className="lh-hero-list">{data.heroList.map((story) => <RoundRow key={story.id} story={story} />)}</div>}
      </div>
    </section>,
    trending: () => data.trending.length >= 4 && <section className="container lh-section">
      <Head title="اخبار ترند تکنولوژی" sub="مطالب محبوب" more="/blog?page=1" icon="sparkle" />
      <div className="lh-grid-4">{data.trending.map((story) => <Card key={story.id} story={story} />)}</div>
    </section>,
    latest: () => data.latestLead && <section className="lh-band">
      <div className="container lh-section">
        <Head title="جدیدترین مطالب ما" sub="مطالب اخیر مجله" more="/blog?page=1" icon="clock" />
        <div className="lh-latest">
          <Overlay story={data.latestLead} tall />
          {data.latestStrip.length > 0 && <div className="lh-strips">{data.latestStrip.map((story) => <StripRow key={story.id} story={story} />)}</div>}
          {data.latestRound.length > 0 && <div className="lh-rounds">{data.latestRound.map((story) => <RoundRow key={story.id} story={story} />)}</div>}
        </div>
      </div>
    </section>,
    categories: () => data.categories.length > 0 && <section className="container lh-section">
      <Head title="دسته‌بندی‌های مجله" sub="موضوع مورد علاقه‌تان را انتخاب کنید" icon="grid" />
      <nav className="lh-chips" aria-label="دسته‌بندی‌ها">{data.categories.map((category) => <Link key={category.id} href={category.href} style={{ '--lh-c': category.color } as CSSProperties}>
        <b>{category.name}</b><small>{fa(category.count)} مطلب</small>
      </Link>)}</nav>
    </section>,
    news: () => data.news.length >= 3 && <section className="container lh-section">
      <Head title="آخرین اخبار" sub="تازه‌ترین‌های مجلهٔ موبوکام" more="/blog?page=1" icon="info" />
      <div className="lh-grid-3">{data.news.map((story) => <Card key={story.id} story={story} excerpt={false} />)}</div>
      {data.newsRows.length > 0 && <div className="lh-boxed-rows">{data.newsRows.map((story) => <RoundRow key={story.id} story={story} />)}</div>}
    </section>,
    weekly: () => data.weekly.some((tab) => tab.stories.length) && <section className="container lh-section">
      <Head title="محبوب‌ترین مطالب هفته" icon="trophy" />
      <TabSwitch className="lh-tabs" tabs={data.weekly.filter((tab) => tab.stories.length).map((tab) => ({ key: tab.key, label: tab.label, panel: <div className="lh-grid-6">{tab.stories.map((story) => <Card key={story.id} story={story} excerpt={false} />)}</div> }))} />
    </section>,
    archive: () => data.archive.length >= 3 && <section className="lh-archive" style={bg(data.archive[0].cover, 0)}>
      <div className="lh-archive-veil" aria-hidden="true" />
      <span className="lh-notch is-top">مشاهدهٔ آرشیو بهترین‌ها</span>
      <div className="container lh-section">
        <Head title="تازه‌ترین‌های مجله" more="/blog?page=1" icon="star" />
        <div className="lh-archive-grid">
          <Overlay story={data.archive[0]} tall />
          {data.archive.slice(1, 3).map((story) => <Card key={story.id} story={story} />)}
        </div>
      </div>
      <Link href="/blog?page=1" className="lh-notch is-bottom">مشاهدهٔ آرشیو بهترین‌ها</Link>
    </section>,
    blocks: () => data.blocks.map(({ category, stories }) => stories.length >= 4 && <section key={category.id} className="container lh-section">
      <Head title={category.name} sub="مطالب محبوب این موضوع" more={category.href} icon="star" />
      <div className="lh-block">
        {stories.slice(0, 2).map((story) => <Overlay key={story.id} story={story} tall />)}
        <div className="lh-block-texts">{stories.slice(2, 6).map((story) => <TextCard key={story.id} story={story} />)}</div>
      </div>
    </section>),
    panel: () => data.panel && data.panel.stories.length >= 3 && <section className="container lh-section">
      <Head title={data.panel.category.name} sub="مطالب محبوب" more={data.panel.category.href} icon="trophy" />
      <div className="lh-panel" style={{ '--lh-c': data.panel.category.color } as CSSProperties}>{data.panel.stories.map((story) => <RoundRow key={story.id} story={story} />)}</div>
    </section>,
    social: () => data.social.length >= 4 && <section className="container lh-section">
      <Head title="انتخاب سردبیر" sub="مطالب پیشنهادی" icon="star" />
      <div className="lh-grid-4">{data.social.map((story) => <Overlay key={story.id} story={story} tall />)}</div>
      <div className="lh-center"><Link href="/blog?page=1" className="lh-btn is-ghost">مشاهدهٔ همه</Link></div>
    </section>,
  }
  // The search toolbar stays right under the hero (or first when the hero is hidden).
  const shown = order.filter((key, index) => LIONA_SECTIONS.includes(key) && order.indexOf(key) === index)
  return <>
    {shown.includes('hero') && sections.hero()}
    <div className="container lh-toolbar">{search}</div>
    {shown.filter((key) => key !== 'hero').map((key) => <Fragment key={key}>{sections[key]()}</Fragment>)}
  </>
}

/** Listing / search / category result card grid in the same visual language. */
export function LionaGrid({ stories }: { stories: LionaStory[] }) {
  return <div className="lh-grid-3">{stories.map((story) => <Card key={story.id} story={story} />)}</div>
}
