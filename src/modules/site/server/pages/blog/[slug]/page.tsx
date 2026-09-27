import { categoryMembership } from '@/modules/site/server/categories'
import { postCategories } from '@/modules/site/domain/categories'
import Link from 'next/link'
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
import { postContext, resolveEntryLayout } from '@/modules/site/server/theme-templates'
import { requireModule } from '@/extensions/server/modules'
import { getViewer } from '@/modules/membership/server/membership'
import { teaserHtml } from '@/modules/membership/domain/membership'
import { VipGate } from '@/components/media/MediaCards'
import { ThemeFooter, ThemeHeader } from '@/components/content/builder/ThemeChrome'
import { docHasSlotWidget, ensureContentSlot } from '@/modules/site/domain/builder'
import SectionBarSlot from '@/components/site/SectionBarSlot'

const FALLBACK = '/images/journal-editorial-fallback.webp'

function readingMinutes(text: string | null | undefined) {
  const words = richTextToPlain(text).split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / 200))
}

export async function generateMetadata({ params: paramsPromise }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const params = await paramsPromise
  const post = await db.post.findUnique({ where: { slug: params.slug }, include: { categories: { include: { category: true } }, category: true } }).catch(() => null)
  if (!post || post.status !== 'PUBLISHED') return { title: 'Not found', robots: { index: false, follow: false } }
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

export default async function PostPage({ params: paramsPromise, preview }: { params: Promise<{ slug: string }>; preview?: BuilderPreview }) {
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
      author: { select: { name: true, avatarColor: true, telegramUsername: true, telegramPhoto: true, createdAt: true } },
    },
  })
  if (!post || (post.status !== 'PUBLISHED' && !isPreview(preview))) notFound()

  if (!isPreview(preview)) await db.post.update({ where: { id: post.id }, data: { views: { increment: 1 } } })
  // Members-only articles: guests get a teaser and a VIP call to action; the post's own
  // builder layout is skipped so premium blocks never render for non-members.
  const viewer = post.access === 'MEMBERS' && !isPreview(preview) ? await getViewer() : null
  const locked = !!viewer && !viewer.member
  const builderDoc = locked ? null : await resolveBuilderDoc(preview, `post-${post.id}`)
  const renderContext = await postContext(postCategories(post).map((c) => c.id))
  const editingTemplate = previewTemplate(preview, 'single-post')
  const templateDoc = await resolveEntryLayout('post', post.id, renderContext, editingTemplate)
  const builderContext = { postCategoryId: post.category?.id ?? postCategories(post)[0]?.id ?? null, currentPostId: post.id }
  const ownEditable = editableFor(preview, `post-${post.id}`)

  const anchor = post.publishedAt ?? post.createdAt
  const authorWhere = post.authorId ? { status: 'PUBLISHED' as const, authorId: post.authorId } : null
  const [related, newer, older, authorPosts, authorViews] = await Promise.all([
    db.post.findMany({
      where: { status: 'PUBLISHED', ...categoryMembership(postCategories(post).map((c) => c.id)), id: { not: post.id } },
      take: 4,
      orderBy: { publishedAt: 'desc' },
      include: { category: true, categories: { include: { category: true } } },
    }),
    db.post.findFirst({
      where: { status: 'PUBLISHED', publishedAt: { gt: anchor } },
      orderBy: { publishedAt: 'asc' },
      select: { slug: true, title: true, titleEn: true, cover: true },
    }),
    db.post.findFirst({
      where: { status: 'PUBLISHED', publishedAt: { lt: anchor } },
      orderBy: { publishedAt: 'desc' },
      select: { slug: true, title: true, titleEn: true, cover: true },
    }),
    authorWhere ? db.post.count({ where: authorWhere }) : 0,
    authorWhere ? db.post.aggregate({ where: authorWhere, _sum: { views: true } }) : { _sum: { views: null } },
  ])

  const title = isFa ? post.title : post.titleEn || post.title
  const content = post.content ? (isFa ? post.content : post.contentEn || post.content) : ''
  const lead = richTextToPlain(isFa ? post.excerpt : post.excerptEn || post.excerpt, 230)
  const fmt = (d: Date) => new Date(d).toLocaleDateString(isFa ? 'fa-IR' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const authorName = post.author?.name || 'MoboComCMS'
  const initial = (authorName || 'H').trim().slice(0, 1).toUpperCase()
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
  const crumbsLd = breadcrumbJsonLd(base, [
    { name: isFa ? 'خانه' : 'Home', path: '/' },
    { name: t.blog, path: '/blog' },
    { name: title, path: `/blog/${post.slug}` },
  ])

  const headerSlot = (
    <header className="journal-post-head">
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
            {post.author?.telegramPhoto ? <img src={post.author.telegramPhoto} alt="" /> : initial}
          </span>
          <span className="journal-avatar-copy">
            <small>{isFa ? 'نوشتهٔ' : 'Written by'}</small>
            <strong>{authorName}</strong>
          </span>
        </span>
        <span className="journal-post-meta-item num">{fmt(post.publishedAt)}</span>
        <span className="journal-post-pill">
          {readingMinutes(content)} {t.minRead}
        </span>
        <span className="journal-post-pill">
          {post.views.toLocaleString(isFa ? 'fa-IR' : 'en-US')} {t.views}
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
      <img src={coverImage} alt="" fetchPriority="high" />
    </figure>
  )

  const contentSlot = (
    <>
      <ArticleToc />
      <article
        id="article-body"
        className={`prose journal-prose${locked ? ' vip-teaser' : ''}`}
        dangerouslySetInnerHTML={{ __html: cleanRichText(locked ? teaserHtml(content) : content) }}
      />
      {locked && <VipGate fa={isFa} loggedIn={!!viewer?.userId} next={`/blog/${post.slug}`} title={isFa ? 'ادامه این مطلب مخصوص اعضای ویژه است' : 'The rest of this article is for VIP members'} />}

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
    </>
  )

  const footerSlot = (
    <>
      <section className="journal-bio" aria-labelledby="journal-bio-title">
        <div className="journal-bio-art" aria-hidden="true">
          <span className="journal-bio-avatar" style={post.author?.avatarColor ? { background: post.author.avatarColor } : undefined}>
            {post.author?.telegramPhoto ? <img src={post.author.telegramPhoto} alt="" /> : initial}
          </span>
        </div>
        <div className="journal-bio-body">
          <span className="journal-bio-label" id="journal-bio-title">
            {isFa ? 'درباره نویسنده' : 'About the author'}
          </span>
          <h3>{authorName}</h3>
          <p>
            {isFa
              ? 'راهنماها و خبرهای کاربردی برای تجربه‌ای امن‌تر و سریع‌تر در دنیای متصل؛ ساده، شفاف و بدون حاشیه.'
              : 'Practical guides and stories for a safer, faster connected world — simple, clear and to the point.'}
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
              <span className="journal-pager-label">{isFa ? 'پست قبلی' : 'Previous'}</span>
              <span className="journal-pager-art">
                <img src={older.cover || FALLBACK} alt="" loading="lazy" decoding="async" />
              </span>
              <strong>{isFa ? older.title : older.titleEn || older.title}</strong>
            </Link>
          ) : (
            <span className="journal-pager-item is-empty" />
          )}
          {newer ? (
            <Link href={`/blog/${newer.slug}`} className="journal-pager-item is-newer">
              <span className="journal-pager-label">{isFa ? 'پست بعدی' : 'Next'}</span>
              <span className="journal-pager-art">
                <img src={newer.cover || FALLBACK} alt="" loading="lazy" decoding="async" />
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
                  <img src={item.cover || FALLBACK} alt="" loading="lazy" decoding="async" />
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
      <ThemeHeader
        context={renderContext} choice={chromeDoc?.layout?.header} theme={theme} locale={locale} navPages={navPages}
        builderContext={builderContext} preview={preview}
        fallback={(
          <div className="journal-header-shell">
            <SiteHeader
              theme={theme}
              navPages={navPages}
              breadcrumbs={[{ label: isFa ? 'خانه' : 'Home', href: '/' }, { label: t.blog, href: '/blog' }, { label: title }]}
            />
          </div>
        )}
      />
      <SectionBarSlot section="blog" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(crumbsLd) }} />

      {(() => {
        const crumb = (
          <nav className="journal-crumb-pill" aria-label={isFa ? 'مسیر صفحه' : 'Breadcrumb'}>
            <Link href="/">{isFa ? 'خانه' : 'Home'}</Link>
            <span aria-hidden="true">/</span>
            <Link href="/blog">{t.blog}</Link>
            <span aria-hidden="true">/</span>
            <span className="current">{title}</span>
          </nav>
        )
        // Built layouts (own document or a template) control the full page width;
        // each section decides its own width (boxed / narrow / full).
        if (ownLayout && builderDoc) {
          return (
            <main className="journal-post journal-post-built">
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
            <main className="journal-post journal-post-built">
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
          <main className="journal-post journal-post-solo">
            <div className="journal-post-shell">
              {crumb}
              {templateDoc && <div className="journal-post-builder"><BuilderRenderer doc={templateDoc} locale={locale} editable={!!editingTemplate} preview={isPreview(preview)} context={builderContext} /></div>}
              {headerSlot}
              {coverSlot}
              {builderDoc && <div className="journal-post-builder"><BuilderRenderer doc={builderDoc} locale={locale} preview={isPreview(preview)} editable={ownEditable} context={builderContext} /></div>}
              <div className="journal-post-col">
                {contentSlot}
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
