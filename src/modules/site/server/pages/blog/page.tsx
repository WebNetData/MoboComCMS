import Link from 'next/link'
import SiteHeader from '@/components/SiteHeader'
import JournalHeroSlider, { type JournalSlide } from '@/components/journal/JournalHeroSlider'
import JournalTabs, { type JournalTab } from '@/components/journal/JournalTabs'
import { db } from '@/platform/database/prisma'
import { getServerLocale, getServerTheme } from '@/i18n/server'
import { dict } from '@/i18n/config'
import { categoryFilter } from '@/modules/site/server/categories'
import { categoryDescendants, categoryOptions, postCategories } from '@/modules/site/domain/categories'
import { richTextToPlain } from '@/shared/content/sanitize'
import BuilderRenderer from '@/components/content/builder/BuilderRenderer'
import { ThemeFooter, ThemeHeader } from '@/components/content/builder/ThemeChrome'
import { editableFor, isPreview, resolveBuilderDoc, type BuilderPreview } from '@/modules/site/server/builder-preview'
import { resolvePlacedPage } from '@/modules/site/server/theme-templates'
import { requireModule } from '@/extensions/server/modules'

const FALLBACK = '/images/journal-editorial-fallback.webp'

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
  const [cats, posts] = await Promise.all([
    db.postCategory.findMany({ orderBy: { name: 'asc' } }),
    db.post.findMany({
      where,
      take: pageSize,
      skip: (currentPage - 1) * pageSize,
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      include: { category: true, categories: { include: { category: true } }, author: { select: { name: true } } },
    }),
  ])
  const pool = posts
  const seg = (start: number, count: number) => pool.slice(start, start + count)
  const popular = [...pool].sort((a, b) => b.views - a.views).slice(0, 6)
  const fmt = (d: Date) => new Date(d).toLocaleDateString(isFa ? 'fa-IR' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  const title = (p: { title: string; titleEn: string }) => (isFa ? p.title : p.titleEn || p.title)
  const excerpt = (p: { excerpt: string; excerptEn: string }, length = 180) => richTextToPlain(isFa ? p.excerpt : p.excerptEn || p.excerpt, length)
  const categoryName = (c: { name: string; nameEn: string }) => (isFa ? c.name : c.nameEn || c.name)
  const badge = (p: Story) => {
    const first = postCategories(p)[0]
    return first ? categoryName(first) : t.blog
  }
  const minutes = (p: Story) => `${readingMinutes(isFa ? p.content : p.contentEn || p.content)} ${t.minRead}`
  const cover = (p: { cover: string | null }) => p.cover || FALLBACK
  const currentCategory = cats.find((c) => c.slug === category)
  const rootCategories = cats.filter((c) => !c.parentId)
  const byId = new Map(cats.map((c) => [c.id, c]))
  const rootIdOf = (id: number) => {
    let node = byId.get(id)
    let guard = 0
    while (node?.parentId && byId.has(node.parentId) && guard++ < 30) node = byId.get(node.parentId)
    return node?.id ?? id
  }
  const counts = new Map<number, number>()
  for (const post of pool) {
    for (const item of postCategories(post)) {
      const root = rootIdOf(item.id)
      counts.set(root, (counts.get(root) || 0) + 1)
    }
  }
  const tiles = rootCategories
    .map((cat) => ({ cat, count: counts.get(cat.id) || 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
  const tabDefs = rootCategories
    .map((cat) => {
      const ids = new Set(categoryDescendants(cats, cat.id))
      const items = pool.filter((post) => postCategories(post).some((item) => ids.has(item.id)))
      return { cat, items: items.slice(0, 6) }
    })
    .filter((tab) => tab.items.length >= 3)
    .slice(0, 3)
  const childCategories = (parentId: number | null, depth = 0): React.ReactNode =>
    depth > 30
      ? null
      : cats
          .filter((c) => c.parentId === parentId)
          .map((c) => (
            <div key={c.id} className="journal-topic-node">
              <Link href={browseUrl(c.slug)} className={category === c.slug ? 'is-active' : ''}>
                <span>{categoryName(c)}</span>
                <span aria-hidden="true">↗</span>
              </Link>
              {childCategories(c.id, depth + 1)}
            </div>
          ))

  type Story = typeof posts[number]

  const slides: JournalSlide[] = seg(0, 4).map((post) => ({
    href: `/blog/${post.slug}`,
    image: cover(post),
    category: badge(post),
    title: title(post),
    excerpt: excerpt(post, 150),
    meta: [fmt(post.publishedAt), minutes(post)],
  }))
  const trendPosts = seg(4, 4)
  const freshLead = pool[8]
  const freshDark = seg(9, 5)
  const freshCircles = seg(14, 4)
  const guidePosts = seg(18, 6)
  const tickerPosts = seg(0, 3)

  const Meta = ({ post }: { post: Story }) => (
    <span className="ln-meta">
      <span className="num">{fmt(post.publishedAt)}</span>
      <span>{minutes(post)}</span>
    </span>
  )

  const OverlayCard = ({ post, large = false }: { post: Story; large?: boolean }) => (
    <Link href={`/blog/${post.slug}`} className={`ln-card ln-card-overlay${large ? ' is-large' : ''}`}>
      <span className="ln-card-art">
        <img src={cover(post)} alt="" loading="lazy" decoding="async" />
      </span>
      <span className="ln-card-body">
        <span className="ln-badge">{badge(post)}</span>
        <strong className="ln-card-title">{title(post)}</strong>
        <em className="ln-card-excerpt">{excerpt(post, 130)}</em>
        <Meta post={post} />
      </span>
    </Link>
  )

  const PlainCard = ({ post }: { post: Story }) => (
    <Link href={`/blog/${post.slug}`} className="ln-card ln-card-plain">
      <span className="ln-card-art">
        <img src={cover(post)} alt="" loading="lazy" decoding="async" />
      </span>
      <span className="ln-card-body">
        <span className="ln-badge">{badge(post)}</span>
        <strong className="ln-card-title">{title(post)}</strong>
        <em className="ln-card-excerpt">{excerpt(post, 140)}</em>
        <span className="ln-meta-row">
          <Meta post={post} />
          <span className="ln-arrow" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M20 12H5M11 6l-6 6 6 6" />
            </svg>
          </span>
        </span>
      </span>
    </Link>
  )

  const Row = ({ post, variant }: { post: Story; variant: 'dark' | 'plain' | 'circle' }) => (
    <Link href={`/blog/${post.slug}`} className={`ln-row ln-row-${variant}`}>
      <span className="ln-row-art">
        <img src={cover(post)} alt="" loading="lazy" decoding="async" />
      </span>
      <span className="ln-row-body">
        <span className="ln-badge">{badge(post)}</span>
        <strong>{title(post)}</strong>
        <span className="ln-meta">
          <span className="num">{fmt(post.publishedAt)}</span>
        </span>
      </span>
    </Link>
  )

  const BandHead = ({ title: bandTitle, kicker, href }: { title: string; kicker?: string; href?: string }) => (
    <div className="ln-head">
      <div className="ln-head-title">
        <span className="ln-head-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M12 2.6l2.3 5.9 5.9 2.3-5.9 2.3L12 19l-2.3-5.9-5.9-2.3 5.9-2.3z" />
          </svg>
        </span>
        <div>
          <h2>{bandTitle}</h2>
          {kicker && <p>{kicker}</p>}
        </div>
      </div>
      {href && (
        <Link className="ln-more" href={href}>
          {isFa ? 'مطالب بیشتر...' : 'More stories...'}
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20 12H5M11 6l-6 6 6 6" />
          </svg>
        </Link>
      )}
    </div>
  )

  const tabs: JournalTab[] = tabDefs.map((tab) => ({ label: categoryName(tab.cat), href: browseUrl(tab.cat.slug) }))
  const tabPanels = tabDefs.map((tab) => (
    <div className="ln-grid ln-grid-3" key={tab.cat.id}>
      {tab.items.map((post) => (
        <PlainCard key={post.id} post={post} />
      ))}
    </div>
  ))

  return (
    <>
      <ThemeHeader
        context={chromeContext} theme={theme} locale={locale} navPages={navPages} preview={preview}
        fallback={<div className="journal-header-shell"><SiteHeader theme={theme} navPages={navPages} /></div>}
      />
      <main className="journal-page journal-liona">
        {isLanding && tickerPosts.length > 0 && (
          <div className="journal-ticker">
            <span className="journal-ticker-label">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
              </svg>
              {isFa ? 'تازه‌ترین‌های مجله:' : 'In the journal:'}
            </span>
            <div className="journal-ticker-viewport">
              <div className="journal-ticker-track">
                {[0, 1].map((copy) => (
                  <span className="journal-ticker-group" key={copy} aria-hidden={copy === 1}>
                    {tickerPosts.map((post) => (
                      <Link key={`${copy}-${post.id}`} href={`/blog/${post.slug}`}>
                        {title(post)}
                      </Link>
                    ))}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {isLanding && slides.length > 0 && (
          <div className="journal-hero-shell">
            <JournalHeroSlider
              slides={slides}
              labels={{
                previous: isFa ? 'اسلاید قبلی' : 'Previous slide',
                next: isFa ? 'اسلاید بعدی' : 'Next slide',
                slide: isFa ? 'اسلاید' : 'Slide',
              }}
            />
          </div>
        )}

        <div className="journal-inner">
          {!isLanding && (
            <header className="journal-heading">
              <div>
                <span className="journal-kicker">HAPPVPN / {t.blog.toUpperCase()}</span>
                <h2>
                  {currentCategory
                    ? categoryName(currentCategory)
                    : query
                      ? isFa
                        ? 'نتایج جست‌وجو'
                        : 'Search results'
                      : t.blog}
                </h2>
                <p>{query ? `${isFa ? 'جست‌وجو برای' : 'Searching for'} «${query}»` : isFa ? 'راهنما، فناوری و خبر؛ با نگاهی روشن‌تر به اینترنت.' : 'Guides, technology and news for a clearer internet.'}</p>
              </div>
              <span>
                {total.toLocaleString(isFa ? 'fa-IR' : 'en-US')} {isFa ? 'نوشته' : 'stories'}
              </span>
            </header>
          )}

          <div className="journal-navigation">
            <nav className="journal-category-nav" aria-label={isFa ? 'موضوعات مجله' : 'Journal topics'}>
              <Link href={browseUrl('')} className={!category ? 'is-active' : ''}>
                {t.allCategories}
              </Link>
              {categoryOptions(rootCategories, locale).map((option) => {
                const cat = cats.find((item) => String(item.id) === option.value)!
                return (
                  <Link key={cat.id} href={browseUrl(cat.slug)} className={category === cat.slug ? 'is-active' : ''}>
                    {option.label}
                  </Link>
                )
              })}
            </nav>
            <form action="/blog" className="journal-search" role="search">
              {category && <input type="hidden" name="category" value={category} />}
              <input
                key={query}
                type="search"
                name="q"
                defaultValue={query}
                maxLength={120}
                aria-label={isFa ? 'جست‌وجوی نوشته‌ها' : 'Search articles'}
                placeholder={isFa ? 'جست‌وجو در مجله…' : 'Search the journal…'}
              />
              <button type="submit" aria-label={isFa ? 'جست‌وجو' : 'Search'}>
                ⌕
              </button>
            </form>
          </div>

          {isLanding ? (
            <div className="ln-bands">
              {trendPosts.length >= 3 && (
                <section className="ln-band">
                  <BandHead title={isFa ? 'اخبار داغ فناوری' : 'Trending technology'} kicker={isFa ? 'آنچه امروز سر و صدا کرده است' : 'What is making noise today'} href={browseUrl()} />
                  <div className="ln-grid ln-grid-4">
                    {trendPosts.map((post) => (
                      <OverlayCard key={post.id} post={post} />
                    ))}
                  </div>
                </section>
              )}

              {(freshLead || freshDark.length > 0) && (
                <section className="ln-band">
                  <BandHead title={isFa ? 'جدیدترین مطالب ما' : 'Our latest stories'} kicker={isFa ? 'تازه منتشر شده' : 'Freshly published'} href={browseUrl()} />
                  <div className="ln-split">
                    {freshLead && (
                      <div className="ln-split-lead">
                        <OverlayCard post={freshLead} large />
                      </div>
                    )}
                    {freshDark.length > 0 && (
                      <div className="ln-panel ln-panel-dark">
                        <span className="ln-panel-title">{isFa ? 'در یک نگاه' : 'At a glance'}</span>
                        {freshDark.map((post) => (
                          <Row key={post.id} post={post} variant="dark" />
                        ))}
                      </div>
                    )}
                    {freshCircles.length > 0 && (
                      <div className="ln-panel ln-panel-plain">
                        <span className="ln-panel-title">{isFa ? 'خواندنی‌های کوتاه' : 'Quick reads'}</span>
                        {freshCircles.map((post) => (
                          <Row key={post.id} post={post} variant="circle" />
                        ))}
                      </div>
                    )}
                  </div>
                </section>
              )}

              {tiles.length > 0 && (
                <section className="ln-band ln-band-tint">
                  <BandHead title={isFa ? 'دسته‌بندی‌های مجله' : 'Journal categories'} kicker={isFa ? 'موضوع مورد علاقه‌ات را پیدا کن' : 'Find your next topic'} href={browseUrl()} />
                  <div className="ln-tiles">
                    {tiles.map(({ cat, count }) => (
                      <Link key={cat.id} href={browseUrl(cat.slug)} className="ln-tile">
                        <span className="ln-tile-count num">{count.toLocaleString(isFa ? 'fa-IR' : 'en-US')}</span>
                        <strong>{categoryName(cat)}</strong>
                        <span className="ln-tile-more">
                          {isFa ? 'مشاهده نوشته‌ها' : 'Explore stories'}
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M20 12H5M11 6l-6 6 6 6" />
                          </svg>
                        </span>
                      </Link>
                    ))}
                  </div>
                </section>
              )}

              {guidePosts.length >= 3 && (
                <section className="ln-band">
                  <BandHead title={isFa ? 'راهنماها و بررسی‌ها' : 'Guides and reviews'} kicker={isFa ? 'قدم به قدم، ساده و کاربردی' : 'Step by step and practical'} href={browseUrl()} />
                  <div className="ln-grid ln-grid-3">
                    {guidePosts.map((post) => (
                      <PlainCard key={post.id} post={post} />
                    ))}
                  </div>
                </section>
              )}

              {tabs.length > 1 && (
                <section className="ln-band">
                  <BandHead title={isFa ? 'مطالب برگزیده' : 'Featured picks'} kicker={isFa ? 'به تفکیک موضوع' : 'Browse by topic'} />
                  <JournalTabs tabs={tabs} panels={tabPanels} moreLabel={isFa ? 'مطالب بیشتر...' : 'More stories...'} />
                </section>
              )}

              {popular.length >= 3 && (
                <section className="ln-band ln-band-accent">
                  <BandHead title={isFa ? 'پربازدیدترین مطالب' : 'Most read'} kicker={isFa ? 'انتخاب خوانندگان مجله' : 'Chosen by our readers'} href={browseUrl()} />
                  <div className="ln-grid ln-grid-3 ln-grid-cards">
                    {popular.map((post) => (
                      <PlainCard key={post.id} post={post} />
                    ))}
                  </div>
                </section>
              )}

              {pool.length === 0 && (
                <div className="journal-empty">
                  <p>{t.noPosts}</p>
                  {(query || category) && (
                    <Link href="/blog">{isFa ? 'بازگشت به همه نوشته‌ها' : 'View all stories'} ↗</Link>
                  )}
                </div>
              )}
            </div>
          ) : (
            <section className="ln-band" aria-label={isFa ? 'آخرین نوشته‌ها' : 'Latest stories'}>
              <BandHead title={isFa ? 'آخرین نوشته‌ها' : 'Latest stories'} kicker={isFa ? 'همه نوشته‌ها' : 'All stories'} />
              <div className="ln-grid ln-grid-3">
                {pool.map((post) => (
                  <PlainCard key={post.id} post={post} />
                ))}
                {pool.length === 0 && (
                  <div className="journal-empty">
                    <p>{t.noPosts}</p>
                    {(query || category) && (
                      <Link href="/blog">{isFa ? 'بازگشت به همه نوشته‌ها' : 'View all stories'} ↗</Link>
                    )}
                  </div>
                )}
              </div>
            </section>
          )}

          <section className="journal-topic-browser">
            <div>
              <span className="journal-kicker">{isFa ? 'کاوش در مجله' : 'BROWSE THE JOURNAL'}</span>
              <h2>{isFa ? 'همهٔ موضوعات' : 'All topics'}</h2>
            </div>
            <nav aria-label={isFa ? 'دسته‌بندی‌های مجله' : 'Journal categories'}>
              <Link className={`journal-topic-all ${!category ? 'is-active' : ''}`} href={browseUrl('')}>
                {t.allCategories}
              </Link>
              {childCategories(null)}
            </nav>
          </section>

          {pages > 1 && (
            <nav className="content-pagination" aria-label={isFa ? 'صفحه‌بندی نوشته‌ها' : 'Article pagination'}>
              {currentPage > 1 && (
                <Link className="btn btn-ghost" href={browseUrl(category, currentPage - 1)}>
                  {isFa ? 'صفحه قبل' : 'Previous'}
                </Link>
              )}
              <span>
                {currentPage.toLocaleString(isFa ? 'fa-IR' : 'en-US')} / {pages.toLocaleString(isFa ? 'fa-IR' : 'en-US')}
              </span>
              {currentPage < pages && (
                <Link className="btn btn-ghost" href={browseUrl(category, currentPage + 1)}>
                  {isFa ? 'صفحه بعد' : 'Next'}
                </Link>
              )}
              {isLanding && (
                <Link className="btn btn-primary" href={browseUrl(category, 2)}>
                  {isFa ? 'مشاهده همه نوشته‌ها' : 'View all stories'}
                </Link>
              )}
            </nav>
          )}
        </div>
      </main>
      <ThemeFooter context={chromeContext} locale={locale} navPages={navPages} preview={preview} />
    </>
  )
}
