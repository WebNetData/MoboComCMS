import PdfDownload from '@/components/content/PdfDownload'
import { contentRouteParams } from '@/shared/routing/params'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { db } from '@/platform/database/prisma'
import { pageDescription } from '@/modules/site/server/page-description'
import { getServerLocale, getServerTheme } from '@/i18n/server'
import { dict } from '@/i18n/config'
import { cleanRichText } from '@/shared/content/sanitize'
import { formShortcodes } from '@/modules/forms/domain/embed'
import { breadcrumbJsonLd, pageMeta, siteBase } from '@/modules/site/server/seo'
import TitleCover from '@/components/content/TitleCover'
import ArticleToc from '@/components/ArticleToc'
import Link from '@/components/AppLink'
import { getPageLayout } from '@/modules/site/server/page-layout'
import PublicForm from '@/components/site/PublicForm'
import { parseForm, publicForm } from '@/modules/forms/domain/forms'
import BuilderRenderer from '@/components/content/builder/BuilderRenderer'
import { editableFor, isPreview, resolveBuilderDoc, type BuilderPreview } from '@/modules/site/server/builder-preview'
import { ThemeFooter, ThemeHeader } from '@/components/content/builder/ThemeChrome'
import { safeJsonLd } from '@/shared/seo/json-ld'
import { publicBlocksHtml as pageBlocksHtml } from '@/modules/editor/server/documents'
import { withTextDirections } from '@/modules/editor/domain/rich-text'
import AboutTemplate from '@/components/site/company/AboutTemplate'
import ContactTemplate from '@/components/site/company/ContactTemplate'
import LegalTemplate from '@/components/site/company/LegalTemplate'


/** The other published pages laid out as legal documents (terms, privacy, refunds…), for «اسناد مرتبط». */
async function legalDocuments(id: number) {
  const layouts = await db.setting.findMany({ where: { key: { startsWith: 'page.layout.' }, value: { contains: '"companyPanel":"legal"' } }, select: { key: true } }).catch(() => [])
  const ids = layouts.map((row) => Number(row.key.slice('page.layout.'.length))).filter((other) => Number.isSafeInteger(other) && other !== id)
  if (!ids.length) return []
  return db.page.findMany({ where: { id: { in: ids }, status: 'PUBLISHED' }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], select: { slug: true, title: true }, take: 8 }).catch(() => [])
}

export async function generateMetadata({ params: paramsPromise }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const params = await contentRouteParams(paramsPromise)
  const page = await db.page.findUnique({ where: { slug: params.slug } }).catch(() => null)
  if (!page || page.status !== 'PUBLISHED') return { title: 'Not found', robots: { index: false, follow: false } }
  const locale = await getServerLocale()
  const isFa = locale === 'fa'
  const title = isFa ? page.title : page.titleEn || page.title
  const layout = await getPageLayout(page.id)
  return pageMeta({
    title,
    description: await pageDescription(page, locale, layout.companyPanel),
    path: `/p/${page.slug}`,
    locale,
    image: layout.cover || undefined,
  })
}

export default async function CustomPage({ params: paramsPromise, preview }: { params: Promise<{ slug: string }>; preview?: BuilderPreview }) {
  const params = await contentRouteParams(paramsPromise)
  const [locale, theme, requestHeaders] = await Promise.all([getServerLocale(), getServerTheme(), headers()])
  const navPages = await db.page.findMany({ where: { status: 'PUBLISHED', showInNav: true }, orderBy: { sortOrder: 'asc' }, select: { slug: true, title: true, titleEn: true } }).catch(() => [])
  const t = dict(locale)
  const isFa = locale === 'fa'

  const page = await db.page.findUnique({ where: { slug: params.slug } })
  if (!page || (page.status !== 'PUBLISHED' && !isPreview(preview))) notFound()
  const layout = await getPageLayout(page.id)
  const builderDoc = await resolveBuilderDoc(preview, String(page.id))
  const attachedForm = layout.formSlug ? await db.siteForm.findUnique({ where: { slug: layout.formSlug } }) : null

  const title = isFa ? page.title : page.titleEn || page.title
  // A page written in blocks is rendered from its document; the HTML built there has every value escaped and is not passed through the HTML cleaner.
  // A form shortcode in the text becomes a placeholder the page mounts the live form into.
  const written = await pageBlocksHtml(page)
  const blocks = written === null ? null : formShortcodes(written)
  const content = blocks === null ? formShortcodes(cleanRichText(isFa ? page.content : page.contentEn || page.content)) : ''
  const base = await siteBase()
  const crumbsLd = breadcrumbJsonLd(base, [
    { name: isFa ? 'خانه' : 'Home', path: '/' },
    { name: title, path: `/p/${page.slug}` },
  ])

  const chromeContext = { route: 'page' } as const
  // A design template (about, contact or legal; chosen in Pages admin) lays out the page's own text and form itself.
  const template = layout.companyPanel
  const templateBody = blocks ?? (content ? withTextDirections(content) : '')
  const related = template === 'legal' ? await legalDocuments(page.id) : []
  const hasLegacy = template === 'none' && (!!content || !!attachedForm?.published)
  return (
    <>
      <ThemeHeader context={chromeContext} choice={builderDoc?.layout?.header} theme={theme} locale={locale} navPages={navPages} breadcrumbs={[{ label: isFa ? 'خانه' : 'Home', href: '/' }, { label: title }]} preview={preview} />
      {/* Browsers hide the nonce attribute after parsing; its .nonce property still matches CSP. */}
      <script nonce={requestHeaders.get('x-nonce') || undefined} suppressHydrationWarning type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(crumbsLd) }} />
      <main>
        {template === 'about' && <AboutTemplate title={title} body={templateBody} />}
        {template === 'contact' && <ContactTemplate title={title} body={templateBody} form={attachedForm?.published ? publicForm(parseForm(attachedForm)) : null} />}
        {template === 'legal' && <LegalTemplate title={title} body={templateBody} updatedAt={page.updatedAt} related={related} />}
        {template !== 'none' ? null : layout.pageTitle === 'show' ? <TitleCover cover={layout.cover} eyebrow={<span>{isFa ? 'راهنما و اطلاعات' : 'Resources & information'}</span>} title={title} /> : <h1 className="sr-only">{title}</h1>}
        {builderDoc && <BuilderRenderer doc={builderDoc} locale={locale} preview={isPreview(preview)} editable={editableFor(preview, String(page.id))} />}
        {template === 'none' && blocks !== null && <div className="mcb-document container page-main" dangerouslySetInnerHTML={{ __html: blocks }} />}
        {hasLegacy && (
          <div className={`container page-main content-surface managed-page managed-page-${layout.pageLayout} covered-page-body`}>
            <div className={layout.pageLayout === 'sidebar' ? 'article-layout' : 'managed-page-body'}>
              <div>{content && <article id="article-body" className={`content-reading prose ${layout.pageFrame === 'plain' ? 'content-unframed' : ''}`} dangerouslySetInnerHTML={{ __html: withTextDirections(content) }} />}{attachedForm?.published && <div className="mt-8"><PublicForm form={publicForm(parseForm(attachedForm))} /></div>}</div>
              {layout.pageLayout === 'sidebar' && <div className="content-sidebar"><ArticleToc />{navPages.length > 0 && <aside className="toc"><h2 className="toc-title">{isFa ? 'بیشتر بخوانید' : 'Explore more'}</h2>{navPages.filter(p => p.slug !== page.slug).map(p => <Link className="content-sidebar-link" key={p.slug} href={`/p/${p.slug}`}>{isFa ? p.title : p.titleEn || p.title}</Link>)}</aside>}</div>}
            </div>
          </div>
        )}
      </main>
      <div className="container content-pdf-actions"><PdfDownload item={`page:${page.id}`}/></div>
      <ThemeFooter context={chromeContext} choice={builderDoc?.layout?.footer} locale={locale} navPages={navPages} preview={preview} />
    </>
  )
}
