import Link from 'next/link'
import SiteHeader from '@/components/SiteHeader'
import LionaHome, { LionaGrid, type LionaCategory, type LionaData, type LionaStory } from '@/components/journal/LionaHome'
import { db } from '@/platform/database/prisma'
import { getServerLocale, getServerTheme } from '@/i18n/server'
import { dict } from '@/i18n/config'
import { categoryFilter } from '@/modules/site/server/categories'
import { categoryDescendants, postCategories } from '@/modules/site/domain/categories'
import { richTextToPlain } from '@/shared/content/sanitize'
import BuilderRenderer from '@/components/content/builder/BuilderRenderer'
import { ThemeFooter, ThemeHeader } from '@/components/content/builder/ThemeChrome'
import { editableFor, isPreview, resolveBuilderDoc, type BuilderPreview } from '@/modules/site/server/builder-preview'
import { resolvePlacedPage } from '@/modules/site/server/theme-templates'
import { requireModule } from '@/extensions/server/modules'
import SectionBarSlot from '@/components/site/SectionBarSlot'

const FALLBACK = '/images/journal-editorial-fallback.webp'
/** Badge colours for the journal's main categories (Liona palette). */
const CATEGORY_COLORS = ['#22b8cf', '#7c3aed', '#e11d48', '#16a34a', '#2563eb', '#d97706', '#c026d3', '#0891b2']

function readingMinutes(text: string | null | undefined) {
  return Math.max(1, Math.round(richTextToPlain(text).split(/\s+/).filter(Boolean).length / 200))
}

export default async function BlogPage({ searchParams: searchParamsPromise, preview }: { searchParams: Promise<{ category?: string; q?: string; page?: string }>; preview?: BuilderPreview }) {
  const searchParams = await searchParamsPromise
  await requireModule('journal')
  const [locale, theme] = await Promise.all([getServerLocale(), getServerTheme()])
  const navPages = await db.page.findMany({ where: { status: 'PUBLISHED', showInNav: true }, orderBy: { sortOrder: 'asc' }, select: { slug: true, title: true, titleEn: true } }).catch(() => [])
  const t = dict(locale)
  const isFa = locale === 'fa'
  const query = typeof searchParams.q === 'string' ? searchParams.q.trim().slice(0, 120) : ''
  const category = typeof searchParams.category === 'string' ? searchParams.category : ''
  const requestedPage = Number(searchParams.page)
  const pageSize = 24
  const where = { status: 'PUBLISHED', AND: [await categoryFilter(category)], ...(query ? { OR: [{ title: { contains: query } }, { titleEn: { contains: query } }, { excerpt: { contains: query } }, { excerptEn: { contains: query } }] } : {}) }
  const total = await db.post.count({ where })
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = Math.min(pages, Math.max(1, Number.isSafeInteger(requestedPage) ? requestedPage : 1))
  const isLanding = !category && !query && currentPage === 1
  const chromeContext = { route: 'blog' } as const
  if (isLanding) {
    // A theme page placed as the journal landing wins, unless the blog document itself is edited.
    const [placed, blogDoc] = await Promise.all([resolvePlacedPage('blog'), resolveBuilderDoc(preview, 'blog')])
    const useBlogDoc = !placed || preview?.pageId === 'blog'
    const builderDoc = useBlogDoc ? blogDoc : placed.doc
    const docPageId = useBlogDoc ? 'blog' : placed.meta.id
    if (builderDoc) {
      return (
        <>
          <ThemeHeader
            context={chromeContext} choice={builderDoc.layout?.header} theme={theme} locale={locale} navPages={navPages} preview={preview}
            fallback={<div className="journal-header-shell"><SiteHeader theme={theme} navPages={navPages} /></div>}
          />
          <SectionBarSlot section="blog" />
          <main className="journal-page journal-liona">
            <BuilderRenderer doc={builderDoc} locale={locale} preview={isPreview(preview)} editable={editableFor(preview, docPageId)} />
          </main>
          <ThemeFooter context={chromeContext} choice={builderDoc.layout?.footer} locale={locale} navPages={navPages} preview={preview} />
        </>
      )
    }
  }
  const browseUrl = (cat = category, page = 1) => {
    const params = new URLSearchParams()
    if (cat) params.set('category', cat)
    if (query) params.set('q', query)
    if (page > 1) params.set('page', String(page))
    return `/blog${params.size ? '?' + params.toString() : ''}`
  }
  const include = { category: true, categories: { include: { category: true } }, author: { select: { name: true } } } as const
  const [cats, listed, pool] = await Promise.all([
    db.postCategory.findMany({ orderBy: { name: 'asc' } }),
    isLanding ? Promise.resolve([]) : db.post.findMany({ where, take: pageSize, skip: (currentPage - 1) * pageSize, orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }], include }),
    isLanding ? db.post.findMany({ where: { status: 'PUBLISHED', publishedAt: { lte: new Date() } }, take: 60, orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }], include }) : Promise.resolve([]),
  ])
  type Story = typeof pool[number]

  // Root categories carry a colour (by position) used for their badges, circles and chips.
  const byId = new Map(cats.map((c) => [c.id, c]))
  const rootOf = (id: number) => {
    let node = byId.get(id)
    for (let guard = 0; node?.parentId && byId.has(node.parentId) && guard < 30; guard++) node = byId.get(node.parentId)
    return node
  }
  const roots = cats.filter((c) => !c.parentId)
  const rootCounts = new Map<number, number>()
  await Promise.all(roots.map(async (root) => {
    const ids = categoryDescendants(cats, root.id)
    rootCounts.set(root.id, await db.post.count({ where: { status: 'PUBLISHED', OR: [{ categoryId: { in: ids } }, { categories: { some: { categoryId: { in: ids } } } }] } }))
  }))
  const ordered = [...roots].sort((a, b) => (rootCounts.get(b.id) || 0) - (rootCounts.get(a.id) || 0))
  const categoryOf = (c: { id: number; name: string; nameEn: string; slug: string }): LionaCategory => {
    const root = rootOf(c.id) || c
    const index = Math.max(0, ordered.findIndex((r) => r.id === root.id))
    return { id: c.id, name: isFa ? c.name : c.nameEn || c.name, slug: c.slug, color: CATEGORY_COLORS[index % CATEGORY_COLORS.length], count: rootCounts.get(c.id) || 0, href: browseUrl(c.slug, 1) }
  }
  const fmt = (d: Date) => new Date(d).toLocaleDateString(isFa ? 'fa-IR' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const story = (post: Story): LionaStory => {
    const first = postCategories(post)[0]
    return {
      id: post.id, slug: post.slug, title: isFa ? post.title : post.titleEn || post.title,
      excerpt: richTextToPlain(isFa ? post.excerpt : post.excerptEn || post.excerpt, 160), cover: post.cover || FALLBACK,
      date: fmt(post.publishedAt), minutes: readingMinutes(isFa ? post.content : post.contentEn || post.content), views: post.views,
      author: post.author?.name || '', category: first ? categoryOf(first) : null,
    }
  }
  const currentCategory = cats.find((c) => c.slug === category)
  const searchForm = <form action="/blog" className="lh-search" role="search">
    {category && <input type="hidden" name="category" value={category} />}
    <input key={query} type="search" name="q" defaultValue={query} maxLength={120} aria-label={isFa ? 'جست‌وجوی نوشته‌ها' : 'Search articles'} placeholder={isFa ? 'جست‌وجو در مجله…' : 'Search the journal…'} />
    <button type="submit" aria-label={isFa ? 'جست‌وجو' : 'Search'}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg></button>
  </form>

  let body: React.ReactNode
  if (isLanding) {
    const stories = pool.map(story)
    // Hand out stories section by section; a small journal wraps around rather than leaving holes.
    let cursor = 0
    const take = (count: number) => {
      if (!stories.length) return []
      const out: LionaStory[] = []
      for (let i = 0; i < count && i < stories.length; i++) out.push(stories[(cursor + i) % stories.length])
      cursor += out.length
      return out
    }
    const categoriesUi = ordered.filter((c) => (rootCounts.get(c.id) || 0) > 0).map(categoryOf).slice(0, 12)
    const storiesIn = async (rootId: number, count: number) => (await db.post.findMany({
      where: { status: 'PUBLISHED', publishedAt: { lte: new Date() }, OR: [{ categoryId: { in: categoryDescendants(cats, rootId) } }, { categories: { some: { categoryId: { in: categoryDescendants(cats, rootId) } } } }] },
      take: count, orderBy: [{ views: 'desc' }, { publishedAt: 'desc' }], include,
    })).map(story)
    const busiest = categoriesUi.slice(0, 3)
    const [blockA, blockB, panelStories] = await Promise.all([
      busiest[0] ? storiesIn(busiest[0].id, 6) : Promise.resolve([]),
      busiest[1] ? storiesIn(busiest[1].id, 6) : Promise.resolve([]),
      busiest[2] ? storiesIn(busiest[2].id, 6) : Promise.resolve([]),
    ])
    const byViews = [...stories].sort((a, b) => b.views - a.views)
    const data: LionaData = {
      hero: take(1)[0], heroList: take(4), trending: take(4), latestLead: take(1)[0], latestStrip: take(7), latestRound: take(4),
      news: take(3), newsRows: take(6),
      weekly: [
        { key: 'all', label: isFa ? 'همه مطالب' : 'All', stories: stories.slice(0, 6) },
        { key: 'popular', label: isFa ? 'محبوب‌ترین‌ها' : 'Popular', stories: byViews.slice(0, 6) },
        { key: 'old', label: isFa ? 'قدیمی‌ترین‌ها' : 'Oldest', stories: stories.slice(-6).reverse() },
      ],
      archive: take(3),
      categories: categoriesUi,
      blocks: [busiest[0] && { category: busiest[0], stories: blockA }, busiest[1] && { category: busiest[1], stories: blockB }].filter((entry): entry is { category: LionaCategory; stories: LionaStory[] } => !!entry),
      panel: busiest[2] ? { category: busiest[2], stories: panelStories } : null,
      social: (pool.filter((post) => post.featured).length >= 4 ? pool.filter((post) => post.featured).map(story) : byViews).slice(0, 4),
    }
    body = stories.length ? <LionaHome data={data} search={searchForm} /> : <div className="container lh-section"><div className="journal-empty"><p>{t.noPosts}</p></div></div>
  } else {
    body = <div className="container lh-section lh-listing">
      <header className="lh-list-head">
        <nav className="lh-crumbs" aria-label={isFa ? 'مسیر صفحه' : 'Breadcrumb'}><Link href="/blog">{t.blog}</Link>{currentCategory && <> › <span>{isFa ? currentCategory.name : currentCategory.nameEn || currentCategory.name}</span></>}</nav>
        <h1>{currentCategory ? (isFa ? currentCategory.name : currentCategory.nameEn || currentCategory.name) : query ? (isFa ? `نتایج جست‌وجوی «${query}»` : `Results for “${query}”`) : (isFa ? 'همهٔ مطالب مجله' : 'All stories')}</h1>
        <span>{total.toLocaleString(isFa ? 'fa-IR' : 'en-US')} {isFa ? 'مطلب' : 'stories'}</span>
      </header>
      <div className="lh-toolbar is-inline">
        <nav className="lh-chips is-small" aria-label={isFa ? 'موضوعات مجله' : 'Journal topics'}>
          <Link href={browseUrl('', 1)} className={!category ? 'is-active' : ''}>{t.allCategories}</Link>
          {ordered.map((c) => <Link key={c.id} href={browseUrl(c.slug, 1)} className={category === c.slug ? 'is-active' : ''} style={{ '--lh-c': categoryOf(c).color } as React.CSSProperties}>{isFa ? c.name : c.nameEn || c.name}</Link>)}
        </nav>
        {searchForm}
      </div>
      {listed.length ? <LionaGrid stories={listed.map(story)} /> : <div className="journal-empty"><p>{t.noPosts}</p>{(query || category) && <Link href="/blog">{isFa ? 'بازگشت به همه نوشته‌ها' : 'View all stories'} ↗</Link>}</div>}
      {pages > 1 && <nav className="lh-pager" aria-label={isFa ? 'صفحه‌بندی نوشته‌ها' : 'Article pagination'}>
        {currentPage > 1 && <Link href={browseUrl(category, currentPage - 1)} rel="prev">{isFa ? 'صفحهٔ قبل' : 'Previous'}</Link>}
        <span>{currentPage.toLocaleString(isFa ? 'fa-IR' : 'en-US')} / {pages.toLocaleString(isFa ? 'fa-IR' : 'en-US')}</span>
        {currentPage < pages && <Link href={browseUrl(category, currentPage + 1)} rel="next">{isFa ? 'صفحهٔ بعد' : 'Next'}</Link>}
      </nav>}
    </div>
  }

  return (
    <>
      <ThemeHeader
        context={chromeContext} theme={theme} locale={locale} navPages={navPages} preview={preview}
        fallback={<div className="journal-header-shell"><SiteHeader theme={theme} navPages={navPages} /></div>}
      />
      <SectionBarSlot section="blog" />
      <main className="journal-page journal-lh">{body}</main>
      <ThemeFooter context={chromeContext} locale={locale} navPages={navPages} preview={preview} />
    </>
  )
}
