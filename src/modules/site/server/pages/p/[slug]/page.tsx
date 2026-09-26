import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { db } from '@/platform/database/prisma'
import { getServerLocale, getServerTheme } from '@/i18n/server'
import { dict } from '@/i18n/config'
import { cleanRichText, richTextToPlain } from '@/shared/content/sanitize'
import { breadcrumbJsonLd, pageMeta, siteBase } from '@/modules/site/server/seo'
import TitleCover from '@/components/content/TitleCover'
import ArticleToc from '@/components/ArticleToc'
import Link from 'next/link'
import { getPageLayout } from '@/modules/site/server/page-layout'
import PublicForm from '@/components/site/PublicForm'
import BuilderRenderer from '@/components/content/builder/BuilderRenderer'
import { editableFor, isPreview, resolveBuilderDoc, type BuilderPreview } from '@/modules/site/server/builder-preview'
import { ThemeFooter, ThemeHeader } from '@/components/content/builder/ThemeChrome'


export async function generateMetadata({ params: paramsPromise }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const params = await paramsPromise
  const page = await db.page.findUnique({ where: { slug: params.slug } }).catch(() => null)
  if (!page || page.status !== 'PUBLISHED') return { title: 'Not found', robots: { index: false, follow: false } }
  const locale = await getServerLocale()
  const isFa = locale === 'fa'
  const title = isFa ? page.title : page.titleEn || page.title
  const body = isFa ? page.content : page.contentEn || page.content
  const layout = await getPageLayout(page.id)
  return pageMeta({
    title,
    description: richTextToPlain(body, 160),
    path: `/p/${page.slug}`,
    locale,
    image: layout.cover || undefined,
  })
}

export default async function CustomPage({ params: paramsPromise, preview }: { params: Promise<{ slug: string }>; preview?: BuilderPreview }) {
  const params = await paramsPromise
  const [locale, theme] = await Promise.all([getServerLocale(), getServerTheme()])
  const navPages = await db.page.findMany({ where: { status: 'PUBLISHED', showInNav: true }, orderBy: { sortOrder: 'asc' }, select: { slug: true, title: true, titleEn: true } }).catch(() => [])
  const t = dict(locale)
  const isFa = locale === 'fa'

  const page = await db.page.findUnique({ where: { slug: params.slug } })
  if (!page || (page.status !== 'PUBLISHED' && !isPreview(preview))) notFound()
  const layout = await getPageLayout(page.id)
  const builderDoc = await resolveBuilderDoc(preview, String(page.id))
  const attachedForm = layout.formSlug ? await db.siteForm.findUnique({ where: { slug: layout.formSlug } }) : null

  const title = isFa ? page.title : page.titleEn || page.title
  const content = cleanRichText(isFa ? page.content : page.contentEn || page.content)
  const base = await siteBase()
  const crumbsLd = breadcrumbJsonLd(base, [
    { name: isFa ? 'خانه' : 'Home', path: '/' },
    { name: title, path: `/p/${page.slug}` },
  ])

  const chromeContext = { route: 'page' } as const
  const hasLegacy = !!content || !!attachedForm?.published
  return (
    <>
      <ThemeHeader context={chromeContext} choice={builderDoc?.layout?.header} theme={theme} locale={locale} navPages={navPages} breadcrumbs={[{ label: isFa ? 'خانه' : 'Home', href: '/' }, { label: title }]} preview={preview} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(crumbsLd) }} />
      <main>
        {layout.pageTitle === 'show' ? <TitleCover cover={layout.cover} eyebrow={<span>{isFa ? 'راهنما و اطلاعات' : 'Resources & information'}</span>} title={title} /> : <h1 className="sr-only">{title}</h1>}
        {builderDoc && <BuilderRenderer doc={builderDoc} locale={locale} preview={isPreview(preview)} editable={editableFor(preview, String(page.id))} />}
        {hasLegacy && (
          <div className={`container page-main content-surface managed-page managed-page-${layout.pageLayout} covered-page-body`}>
            <div className={layout.pageLayout === 'sidebar' ? 'article-layout' : 'managed-page-body'}>
              <div>{content && <article id="article-body" className={`content-reading prose ${layout.pageFrame === 'plain' ? 'content-unframed' : ''}`} dangerouslySetInnerHTML={{ __html: content }} />}{attachedForm?.published && <div className="mt-8"><PublicForm form={{ ...attachedForm, fields: JSON.parse(attachedForm.fields) }} /></div>}</div>
              {layout.pageLayout === 'sidebar' && <div className="content-sidebar"><ArticleToc />{navPages.length > 0 && <aside className="toc"><h2 className="toc-title">{isFa ? 'بیشتر بخوانید' : 'Explore more'}</h2>{navPages.filter(p => p.slug !== page.slug).map(p => <Link className="content-sidebar-link" key={p.slug} href={`/p/${p.slug}`}>{isFa ? p.title : p.titleEn || p.title}</Link>)}</aside>}</div>}
            </div>
          </div>
        )}
      </main>
      <ThemeFooter context={chromeContext} choice={builderDoc?.layout?.footer} locale={locale} navPages={navPages} preview={preview} />
    </>
  )
}
