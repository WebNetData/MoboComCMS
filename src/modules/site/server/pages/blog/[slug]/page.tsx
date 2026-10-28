import { articleBodyWithExcerpt } from '@/modules/site/domain/article-output'
import { categoryMembership } from '@/modules/site/server/categories'
import { Fragment, type CSSProperties } from 'react'
import ManageBar from '@/components/admin/ManageBar'
import { postCategories } from '@/modules/site/domain/categories'
import Link from '@/components/AppLink'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import SiteHeader from '@/components/SiteHeader'
import ArticleToc from '@/components/ArticleToc'
import ShareRow from '@/components/ShareRow'
import PostComments from '@/components/PostComments'
import JournalTextSize from '@/components/journal/JournalTextSize'
import { db } from '@/platform/database/prisma'
import { getServerLocale, getServerTheme } from '@/i18n/server'
import { dict } from '@/i18n/config'
import { cleanRichText, richTextToPlain } from '@/shared/content/sanitize'
import { ItemActionBar } from '@/components/engage/Engagement'
import { articleJsonLd, breadcrumbJsonLd, pageMeta, siteBase } from '@/modules/site/server/seo'
import BuilderRenderer from '@/components/content/builder/BuilderRenderer'
import { editableFor, isPreview, previewTemplate, resolveBuilderDoc, type BuilderPreview } from '@/modules/site/server/builder-preview'
import { postContext } from '@/modules/site/server/theme-templates'
import { resolvePostPresentation } from '@/modules/site/server/post-presentation'
import { postStyleAttributes } from '@/modules/journal/domain/post-styles'
import { requireModule } from '@/extensions/server/modules'
import { getViewer } from '@/modules/membership/server/membership'
import { teaserHtml } from '@/modules/membership/domain/membership'
import { VipGate } from '@/components/media/MediaCards'
import { isPaid, paywallView } from '@/modules/paywall/server/paywall'
import { publicBlocksHtml as blocksHtml } from '@/modules/editor/server/documents'
import BuyContent from '@/components/paywall/BuyContent'
import { ThemeFooter, ThemeHeader } from '@/components/content/builder/ThemeChrome'
import { docHasSlotWidget, ensureContentSlot } from '@/modules/site/domain/builder'
import SectionBarSlot from '@/components/site/SectionBarSlot'
import PromoSlot from '@/components/promo/PromoSlot'
import { safeJsonLd } from '@/shared/seo/json-ld'
import { isLivePost, livePostWhere } from '@/modules/journal/domain/journal'
import { publicPostLinkItems } from '@/modules/journal/server/item-links'
import ReadingProgress from '@/components/journal/ReadingProgress'
import ArticleRail from '@/components/journal/ArticleRail'
import { PostFormatClose, PostFormatLead } from '@/components/journal/PostFormat'
import { factsFor, reviewJsonLd } from '@/modules/journal/domain/formats'
import { allLists } from '@/modules/vocabulary/server/vocabulary'
import { withTextDirections } from '@/modules/editor/domain/rich-text'
import { pictureOf } from '@/modules/identity/domain/picture'
import { sized, srcSet } from '@/shared/media/image'

const FALLBACK = '/images/journal-editorial-fallback.webp'

function readingMinutes(text: string | null | undefined) {
  const words = richTextToPlain(text).split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / 200))
}

export async function generateMetadata({ params: paramsPromise }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const params = await paramsPromise
  const post = await db.post.findUnique({ where: { slug: params.slug }, include: { categories: { include: { category: true } }, category: true } }).catch(() => null)
  if (!post || !isLivePost(post)) return { title: 'Not found', robots: { index: false, follow: false } }
  const locale = await getServerLocale()
  const isFa = locale === 'fa'
  const title = isFa ? post.title : post.titleEn || post.title
  const body = isFa ? post.content : post.contentEn || post.content
  const excerpt = richTextToPlain(isFa ? post.excerpt : post.excerptEn || post.excerpt, 160) || richTextToPlain(body, 160)
  return pageMeta({
    title,
    description: excerpt,
    path: `/blog/${post.slug}`,
    image: post.cover || undefined,
    type: 'article',
    locale,
    publishedTime: post.publishedAt?.toISOString(),
    modifiedTime: post.updatedAt?.toISOString(),
    keywords: [title, ...postCategories(post).map((c) => (isFa ? c.name : c.nameEn || c.name)), isFa ? 'وبلاگ وی پی ان' : 'vpn blog', 'MoboComCMS'].filter(Boolean),
  })
}

/** `askedStyle`: a style named in the address (`?style=ps-…`), shown instead of the article's own for a look. */
export default async function PostPage({ params: paramsPromise, preview, askedStyle }: { params: Promise<{ slug: string }>; preview?: BuilderPreview; askedStyle?: string }) {
  const params = await paramsPromise
  await requireModule('journal')
  const [locale, theme] = await Promise.all([getServerLocale(), getServerTheme()])
  const navPages = await db.page
    .findMany({ where: { status: 'PUBLISHED', showInNav: true }, orderBy: { sortOrder: 'asc' }, select: { slug: true, title: true, titleEn: true } })
    .catch(() => [])
  const t = dict(locale)
  const isFa = locale === 'fa'

  const post = await db.post.findUnique({
    where: { slug: params.slug },
    include: {
      categories: { include: { category: true } },
      category: true,
      author: { select: { name: true, avatarColor: true, telegramUsername: true, telegramPhoto: true, createdAt: true, userProfile: { select: { username: true, avatar: true, cover: true, headline: true, bio: true, verified: true } } } },
    },
  })
  const now = new Date()
  if (!post || (!isLivePost(post, now) && !isPreview(preview))) notFound()

  if (!isPreview(preview)) await db.post.update({ where: { id: post.id }, data: { views: { increment: 1 } } })
  // Members-only articles: guests get a teaser and a VIP call to action; the post's own
  // builder layout is skipped so premium blocks never render for non-members.
  // Paid articles (paywall module) work the same way: a teaser and the buy box until bought.
  const paid = !isPreview(preview) && await isPaid([{ ownerType: 'post', ownerId: post.id }])
  const viewer = (post.access === 'MEMBERS' || paid) && !isPreview(preview) ? await getViewer() : null
  const paywall = paid && viewer ? await paywallView(viewer, [{ ownerType: 'post', ownerId: post.id }]) : null
  const locked = paywall ? !paywall.open : !!viewer && post.access === 'MEMBERS' && !viewer.opens
  const builderDoc = locked ? null : await resolveBuilderDoc(preview, `post-${post.id}`)
  const renderContext = await postContext(postCategories(post).map((c) => c.id))
  const editingTemplate = previewTemplate(preview, 'single-post')
  const presentation = await resolvePostPresentation({ postId: post.id, format: post.format, ctx: renderContext, previewTemplate: editingTemplate, askedStyle })
  const templateDoc = presentation.doc
  const dress = postStyleAttributes(presentation.style)
  const builderContext = { postCategoryId: post.category?.id ?? postCategories(post)[0]?.id ?? null, currentPostId: post.id }
  const ownEditable = editableFor(preview, `post-${post.id}`)

  const anchor = post.publishedAt ?? post.createdAt
  const authorWhere = post.authorId ? { ...livePostWhere(now), authorId: post.authorId } : null
  const [related, newer, older, authorPosts, authorViews, linkedItems] = await Promise.all([
    db.post.findMany({
      where: { ...livePostWhere(now), ...categoryMembership(postCategories(post).map((c) => c.id)), id: { not: post.id } },
      take: 4,
      orderBy: { publishedAt: 'desc' },
      include: { category: true, categories: { include: { category: true } } },
    }),
    db.post.findFirst({
      where: { status: 'PUBLISHED', publishedAt: { gt: anchor, lte: now } },
      orderBy: { publishedAt: 'asc' },
      select: { slug: true, title: true, titleEn: true, cover: true },
    }),
    db.post.findFirst({
      where: { status: 'PUBLISHED', publishedAt: { lt: anchor, lte: now } },
      orderBy: { publishedAt: 'desc' },
      select: { slug: true, title: true, titleEn: true, cover: true },
    }),
    authorWhere ? db.post.count({ where: authorWhere }) : 0,
    authorWhere ? db.post.aggregate({ where: authorWhere, _sum: { views: true } }) : { _sum: { views: null } },
    publicPostLinkItems(post.id),
  ])

  const title = isFa ? post.title : post.titleEn || post.title
  const content = post.content ? (isFa ? post.content : post.contentEn || post.content) : ''
  const lead = richTextToPlain(isFa ? post.excerpt : post.excerptEn || post.excerpt, 230)
  const fmt = (d: Date) => new Date(d).toLocaleDateString(isFa ? 'fa-IR' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const authorName = post.author?.name || 'MoboComCMS'
  const initial = (authorName || 'H').trim().slice(0, 1).toUpperCase()
  // The author's own public profile, when they have one: their picture, cover and words instead of a placeholder.
  const authorProfile = post.author?.userProfile || null
  const authorPhoto = pictureOf(post.author)
  const authorAbout = (authorProfile?.bio || authorProfile?.headline || '').trim()
  const tagList = postCategories(post)
  const coverImage = post.cover || FALLBACK

  const base = await siteBase()
  const articleLd = articleJsonLd({
    base,
    title,
    description: richTextToPlain(isFa ? post.excerpt : post.excerptEn || post.excerpt, 200) || richTextToPlain(content, 200),
    url: `${base}/blog/${post.slug}`,
    image: post.cover || undefined,
    published: post.publishedAt?.toISOString(),
    modified: post.updatedAt?.toISOString(),
    author: authorName,
    section: post.category ? (isFa ? post.category.name : post.category.nameEn || post.category.name) : undefined,
  })
  // The path of the article: home, the magazine, the category it is filed under with the categories above it, then the title.
  const filedUnder = post.category ?? postCategories(post)[0] ?? null
  const categoryTrail: { id: number; slug: string; name: string; nameEn: string; parentId: number | null }[] = []
  for (let node: (typeof categoryTrail)[number] | null = filedUnder, depth = 0; node && depth < 4; depth += 1) {
    categoryTrail.unshift(node)
    node = node.parentId && !categoryTrail.some((seen) => seen.id === node?.parentId) ? await db.postCategory.findUnique({ where: { id: node.parentId } }).catch(() => null) : null
  }
  const trail = [
    { label: isFa ? 'خانه' : 'Home', href: '/' },
    { label: isFa ? 'مجله' : t.blog, href: '/blog' },
    ...categoryTrail.map((category) => ({ label: isFa ? category.name : category.nameEn || category.name, href: `/blog?category=${encodeURIComponent(category.slug)}` })),
  ]
  const crumbsLd = breadcrumbJsonLd(base, [...trail.map((step) => ({ name: step.label, path: step.href })), { name: title, path: `/blog/${post.slug}` }])

  const headerSlot = (
    // A small copy of the cover is also a style value: the cinematic style blurs it behind the band (loaded only there).
    <header className="journal-post-head jp-hero" style={{ '--jp-cover': `url("${encodeURI(sized(coverImage, 400))}")` } as CSSProperties}>
      {/* The cover is the header's own background: decoration here, described by the title beside it. */}
      <img className="jp-hero-bg" src={coverImage} alt="" fetchPriority="high" decoding="async" />
      <div className="journal-post-cats">
        {tagList.map((cat) => (
          <Link key={cat.id} href={`/blog?category=${encodeURIComponent(cat.slug)}`} className="ln-badge">
            {isFa ? cat.name : cat.nameEn || cat.name}
          </Link>
        ))}
      </div>
      <h1>{title}</h1>
      {lead && <p className="journal-post-lead">{lead}</p>}
      <ItemActionBar item={{ type: 'post', id: post.id }} title={title} image={post.cover} />
      <div className="journal-post-meta">
        <span className="journal-post-author-chip">
          <span className="journal-avatar" style={post.author?.avatarColor ? { background: post.author.avatarColor } : undefined}>
            {authorPhoto ? <img src={sized(authorPhoto, 96)} alt="" decoding="async" /> : initial}
          </span>
          <span className="journal-avatar-copy">
            <small>{isFa ? 'نوشتهٔ' : 'Written by'}</small>
            <strong>{authorName}</strong>
          </span>
        </span>
        <span className="jp-facts">
          <span className="jp-fact"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="3" /><path d="M8 3v4M16 3v4M3.5 10h17" /></svg><time dateTime={post.publishedAt.toISOString()} className="num">{fmt(post.publishedAt)}</time></span>
          <span className="jp-fact"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>{readingMinutes(content)} {t.minRead}</span>
          <span className="jp-fact"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.8" /></svg>{post.views.toLocaleString(isFa ? 'fa-IR' : 'en-US')} {t.views}</span>
        </span>
        <JournalTextSize
          labels={{
            title: isFa ? 'اندازه متن' : 'Text size',
            smaller: isFa ? 'کوچک‌تر' : 'Smaller text',
            larger: isFa ? 'بزرگ‌تر' : 'Larger text',
          }}
        />
      </div>
    </header>
  )

  const coverSlot = (
    <figure className="journal-post-figure">
      <img src={sized(coverImage, 960)} srcSet={srcSet(coverImage, 960)} alt="" loading="lazy" decoding="async" />
    </figure>
  )

  // An article written in blocks shows its document (every value escaped by the renderer). A locked article still shows the teaser cut
  // from its HTML copy, and a visitor reading in English gets the English body when the article has one.
  const articleBlocks = !locked && (isFa || !post.contentEn) ? await blocksHtml(post) : null
  // The post's format (the owner's list) decides which of its facts the page shows: a video or a guest above the
  // body, a review summary or a news source below it.
  const formatEntry = (await allLists('journal').catch(() => ({ POST_FORMAT: [] as { code: string; family: string }[] }))).POST_FORMAT?.find((entry) => entry.code === post.format)
  const facts = factsFor(formatEntry?.family || 'ARTICLE', post.formatData)
  // A review with a score and a linked item gets review stars in search results (structured data only).
  const reviewLd = reviewJsonLd({ facts, items: linkedItems, url: `${base}/blog/${post.slug}`, author: authorName || undefined, published: post.publishedAt?.toISOString(), base })
  const contentSlot = (
    <>
      <ReadingProgress />
      <div className="jp-read">
      <ArticleRail title={title} fa={isFa} />
      <div className="jp-main">
      <ArticleToc />
      <PostFormatLead facts={facts} title={title} fa={isFa} />
      <article
        id="article-body"
        className={`prose journal-prose${locked ? ' vip-teaser' : ''}${articleBlocks !== null ? ' mcb-document' : ''}`}
        dangerouslySetInnerHTML={{ __html: articleBodyWithExcerpt(articleBlocks ?? withTextDirections(cleanRichText(locked ? teaserHtml(content) : content)), isFa ? post.excerpt : post.excerptEn || post.excerpt, isFa) }}
      />
      <PostFormatClose facts={facts} fa={isFa} />
      {paywall && !paywall.open && <BuyContent view={paywall} loggedIn={!!viewer?.userId} next={`/blog/${post.slug}#buy`} noun="مقاله" />}
      {!paywall && locked && <VipGate fa={isFa} loggedIn={!!viewer?.userId} next={`/blog/${post.slug}`} title={isFa ? 'ادامه این مطلب مخصوص اعضای ویژه است' : 'The rest of this article is for VIP members'} />}

      {tagList.length > 0 && (
        <div className="journal-tags">
          <h2>{isFa ? 'برچسب‌ها:' : 'Tags:'}</h2>
          <div className="journal-tags-list">
            {tagList.map((cat) => (
              <Link key={cat.id} href={`/blog?category=${encodeURIComponent(cat.slug)}`}>
                #{isFa ? cat.name : cat.nameEn || cat.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      <ShareRow title={title} />
      </div>
      </div>
    </>
  )

  const footerSlot = (
    <>
      {linkedItems.length > 0 && (
        <section className="journal-related" aria-labelledby="journal-linked-items-title">
          <div className="ln-head">
            <div className="ln-head-title">
              <div>
                <h2 id="journal-linked-items-title">{isFa ? 'مطالب مرتبط' : 'Related content'}</h2>
              </div>
            </div>
          </div>
          <div className="journal-related-grid journal-linked-grid">
            {linkedItems.map((item) => (
              <Link key={`${item.type}:${item.id}`} href={item.url} className="ln-card ln-card-plain">
                {item.image && <span className="ln-card-art"><img src={sized(item.image, 400)} srcSet={srcSet(item.image, 400)} alt="" loading="lazy" decoding="async" /></span>}
                <span className="ln-card-body">
                  <strong className="ln-card-title">{isFa ? item.title : item.titleEn || item.title}</strong>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
      <section className="journal-bio" aria-labelledby="journal-bio-title">
        <div className={`journal-bio-art${authorProfile?.cover ? ' has-cover' : ''}`} style={authorProfile?.cover ? { backgroundImage: `url("${encodeURI(sized(authorProfile.cover, 640))}")` } : undefined} aria-hidden="true">
          <span className="journal-bio-avatar" style={post.author?.avatarColor ? { background: post.author.avatarColor } : undefined}>
            {authorPhoto ? <img src={sized(authorPhoto, 96)} alt="" decoding="async" loading="lazy" /> : initial}
          </span>
        </div>
        <div className="journal-bio-body">
          <span className="journal-bio-label" id="journal-bio-title">
            {isFa ? 'درباره نویسنده' : 'About the author'}
          </span>
          <h3>{authorProfile ? <Link href={`/u/${authorProfile.username}`}>{authorName}</Link> : authorName}{authorProfile?.verified && <span className="journal-bio-verified" title={isFa ? 'تأییدشده' : 'Verified'} aria-label={isFa ? 'تأییدشده' : 'Verified'}>✓</span>}</h3>
          <p dir="auto">
            {authorAbout || (isFa
              ? 'راهنماها و خبرهای کاربردی برای تجربه‌ای امن‌تر و سریع‌تر در دنیای متصل؛ ساده، شفاف و بدون حاشیه.'
              : 'Practical guides and stories for a safer, faster connected world — simple, clear and to the point.')}
          </p>
          <div className="journal-bio-stats">
            <span>
              <strong>{authorPosts.toLocaleString(isFa ? 'fa-IR' : 'en-US')}</strong>
              {isFa ? 'نوشته' : 'stories'}
            </span>
            <span>
              <strong>{(authorViews._sum.views || 0).toLocaleString(isFa ? 'fa-IR' : 'en-US')}</strong>
              {t.views}
            </span>
            <span>
              <strong className="num">{new Date(post.author?.createdAt || post.createdAt).toLocaleDateString(isFa ? 'fa-IR' : 'en-US', { year: 'numeric', month: 'short' })}</strong>
              {isFa ? 'عضو از' : 'joined'}
            </span>
          </div>
          <div className="journal-bio-actions">
            <Link className="btn btn-primary" href="/blog">
              {isFa ? 'همه نوشته‌های مجله' : 'All journal stories'}
            </Link>
            {post.author?.telegramUsername && (
              <a className="btn btn-ghost" href={`https://t.me/${post.author.telegramUsername}`} target="_blank" rel="noreferrer">
                Telegram
              </a>
            )}
          </div>
        </div>
      </section>

      {(newer || older) && (
        <nav className="journal-pager" aria-label={isFa ? 'نوشته‌های قبلی و بعدی' : 'Previous and next posts'}>
          {older ? (
            <Link href={`/blog/${older.slug}`} className="journal-pager-item is-older">
              <span className="journal-pager-label"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>{isFa ? 'نوشتهٔ قبلی' : 'Previous'}</span>
              <span className="journal-pager-art">
                <img src={sized(older.cover || FALLBACK, 400)} alt="" loading="lazy" decoding="async" />
              </span>
              <strong>{isFa ? older.title : older.titleEn || older.title}</strong>
            </Link>
          ) : (
            <span className="journal-pager-item is-empty" />
          )}
          {newer ? (
            <Link href={`/blog/${newer.slug}`} className="journal-pager-item is-newer">
              <span className="journal-pager-label">{isFa ? 'نوشتهٔ بعدی' : 'Next'}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" /></svg></span>
              <span className="journal-pager-art">
                <img src={sized(newer.cover || FALLBACK, 400)} alt="" loading="lazy" decoding="async" />
              </span>
              <strong>{isFa ? newer.title : newer.titleEn || newer.title}</strong>
            </Link>
          ) : (
            <span className="journal-pager-item is-empty" />
          )}
        </nav>
      )}

      {related.length > 0 && (
        <section className="journal-related">
          <div className="ln-head">
            <div className="ln-head-title">
              <span className="ln-head-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M12 2.6l2.3 5.9 5.9 2.3-5.9 2.3L12 19l-2.3-5.9-5.9-2.3 5.9-2.3z" />
                </svg>
              </span>
              <div>
                <h2>{isFa ? 'پست‌های مرتبط' : t.relatedPosts}</h2>
                <p>{isFa ? 'ادامه مطالعه' : 'Read next'}</p>
              </div>
            </div>
            <Link className="ln-more" href="/blog">
              {isFa ? 'مطالب بیشتر...' : 'More stories...'}
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M20 12H5M11 6l-6 6 6 6" />
              </svg>
            </Link>
          </div>
          <div className="journal-related-grid">
            {related.map((item) => (
              <Link key={item.id} href={`/blog/${item.slug}`} className="ln-card ln-card-plain">
                <span className="ln-card-art">
                  <img src={sized(item.cover || FALLBACK, 400)} srcSet={srcSet(item.cover, 400)} alt="" loading="lazy" decoding="async" />
                </span>
                <span className="ln-card-body">
                  <span className="ln-badge">
                    {(() => {
                      const cat = postCategories(item)[0]
                      return cat ? (isFa ? cat.name : cat.nameEn || cat.name) : t.blog
                    })()}
                  </span>
                  <strong className="ln-card-title">{isFa ? item.title : item.titleEn || item.title}</strong>
                  <span className="ln-meta">
                    <span className="num">{fmt(item.publishedAt)}</span>
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <PostComments slug={post.slug} />
    </>
  )

  // A post's own builder document is the full page layout: slot widgets place the
  // article anywhere (before / after / beside). Missing slots fall back to defaults.
  const ownLayout = !editingTemplate && builderDoc && builderDoc.mode === 'builder' && builderDoc.sections.length > 0
  const ownHas = (type: 'post-header' | 'post-cover' | 'content' | 'post-footer') =>
    !!builderDoc && docHasSlotWidget(builderDoc, type)
  const chromeDoc = ownLayout ? builderDoc : templateDoc
  const slots = { 'post-header': headerSlot, 'post-cover': coverSlot, content: contentSlot, 'post-footer': footerSlot }

  return (
    <>
      {!isPreview(preview) && <ManageBar title="مدیریت نوشته" anyOf={['cms.posts']} links={[{ href: `/admin/posts?edit=${post.id}`, label: 'ویرایش نوشته' }, { href: '/admin/comments', label: 'نظرها' }, { href: '/admin/posts', label: 'همهٔ نوشته‌ها' }]} />}
      <ThemeHeader
        context={renderContext} choice={chromeDoc?.layout?.header} theme={theme} locale={locale} navPages={navPages}
        builderContext={builderContext} preview={preview}
        fallback={(
          <div className="journal-header-shell">
            <SiteHeader
              theme={theme}
              navPages={navPages}
            />
          </div>
        )}
      />
      <SectionBarSlot section="blog" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(articleLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(crumbsLd) }} />
      {reviewLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(reviewLd) }} />}

      {(() => {
        const crumb = (
          <nav className="journal-crumb-pill" aria-label={isFa ? 'مسیر صفحه' : 'Breadcrumb'}>
            {trail.map((step) => <Fragment key={step.href}><Link href={step.href}>{step.label}</Link><span aria-hidden="true">/</span></Fragment>)}
            <span className="current" aria-current="page">{title}</span>
          </nav>
        )
        // Built layouts (own document or a template) control the full page width;
        // each section decides its own width (boxed / narrow / full).
        if (ownLayout && builderDoc) {
          return (
            <main className="journal-post journal-post-built" {...dress.attrs} style={Object.keys(dress.vars).length ? dress.vars as CSSProperties : undefined}>
              <div className="br-container journal-built-crumb">{crumb}</div>
              {!ownHas('post-header') && <div className="br-container">{headerSlot}</div>}
              {!ownHas('post-cover') && <div className="br-container">{coverSlot}</div>}
              <BuilderRenderer doc={ensureContentSlot(builderDoc)} locale={locale} preview={isPreview(preview)} editable={ownEditable} context={builderContext} slots={slots} />
              {!ownHas('post-footer') && <div className="br-container">{footerSlot}</div>}
            </main>
          )
        }
        if (templateDoc && templateDoc.mode === 'builder') {
          return (
            <main className="journal-post journal-post-built" {...dress.attrs} style={Object.keys(dress.vars).length ? dress.vars as CSSProperties : undefined}>
              <div className="br-container journal-built-crumb">{crumb}</div>
              <BuilderRenderer
                doc={ensureContentSlot(templateDoc)}
                locale={locale}
                preview={isPreview(preview)}
                editable={!!editingTemplate}
                context={builderContext}
                slots={{
                  ...slots,
                  content: (
                    <>
                      {builderDoc && <div className="journal-post-builder"><BuilderRenderer doc={builderDoc} locale={locale} preview={isPreview(preview)} editable={ownEditable} context={builderContext} /></div>}
                      {contentSlot}
                    </>
                  ),
                }}
              />
            </main>
          )
        }
        return (
          <main className="journal-post journal-post-solo" {...dress.attrs} style={Object.keys(dress.vars).length ? dress.vars as CSSProperties : undefined}>
            <div className="journal-post-shell">
              {crumb}
              <PromoSlot placement="content-top" />
              {templateDoc && <div className="journal-post-builder"><BuilderRenderer doc={templateDoc} locale={locale} editable={!!editingTemplate} preview={isPreview(preview)} context={builderContext} /></div>}
              {headerSlot}
              {coverSlot}
              {builderDoc && <div className="journal-post-builder"><BuilderRenderer doc={builderDoc} locale={locale} preview={isPreview(preview)} editable={ownEditable} context={builderContext} /></div>}
              <div className="journal-post-col">
                {contentSlot}
                <PromoSlot placement="content-bottom" />
                {footerSlot}
              </div>
            </div>
          </main>
        )
      })()}
      <ThemeFooter context={renderContext} choice={chromeDoc?.layout?.footer} locale={locale} navPages={navPages} builderContext={builderContext} preview={preview} />
    </>
  )
}
