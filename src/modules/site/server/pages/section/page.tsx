import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import BuilderRenderer from '@/components/content/builder/BuilderRenderer'
import { ThemeFooter, ThemeHeader } from '@/components/content/builder/ThemeChrome'
import { getServerLocale, getServerTheme } from '@/i18n/server'
import { getPublicNavigationPages } from '@/modules/site/server/navigation'
import { resolvePlacedPage } from '@/modules/site/server/theme-templates'
import { editableFor, isPreview, type BuilderPreview } from '@/modules/site/server/builder-preview'
import { pageMeta } from '@/modules/site/server/seo'
import { SECTION_SLUG, type ThemeTemplateMeta } from '@/modules/site/domain/theme-templates'
import type { BuilderDoc } from '@/modules/site/domain/builder'

export async function generateMetadata({ params }: { params: Promise<{ section: string }> }): Promise<Metadata> {
  const { section } = await params
  if (!SECTION_SLUG.test(section)) return {}
  const placed = await resolvePlacedPage('section', section)
  if (!placed) return {}
  const locale = await getServerLocale()
  return pageMeta({ title: locale === 'fa' ? placed.meta.name : placed.meta.nameEn || placed.meta.name, path: `/${section}`, locale })
}

/** Renders one theme page: used by sections (/gaming) and by the builder preview of page templates. */
export async function ThemePageView({ meta, doc, preview }: { meta: ThemeTemplateMeta; doc: BuilderDoc | null; preview?: BuilderPreview }) {
  const [locale, theme, navPages] = await Promise.all([getServerLocale(), getServerTheme(), getPublicNavigationPages()])
  const placement = meta.placement
  const context = placement.kind === 'section'
    ? { route: 'section' as const, sectionSlug: placement.slug }
    : placement.kind === 'none' ? { route: 'page' as const } : { route: placement.kind }
  const builderContext = { postCategoryId: placement.postCategoryId, productCategoryId: placement.productCategoryId }
  return <>
    <ThemeHeader context={context} choice={doc?.layout?.header} theme={theme} locale={locale} navPages={navPages} builderContext={builderContext} preview={preview} />
    <main className="br-page-main">
      {doc
        ? <BuilderRenderer doc={doc} locale={locale} preview={isPreview(preview)} editable={editableFor(preview, meta.id)} context={builderContext} />
        : isPreview(preview) ? <div className="br-container"><div className="br-img-ph br-video-ph">{locale === 'fa' ? 'صفحهٔ خالی — یک بخش یا بلوک اضافه کنید' : 'Blank page — add a section or block'}</div></div> : null}
    </main>
    <ThemeFooter context={context} choice={doc?.layout?.footer} locale={locale} navPages={navPages} builderContext={builderContext} preview={preview} />
  </>
}

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params
  if (!SECTION_SLUG.test(section)) notFound()
  const placed = await resolvePlacedPage('section', section)
  if (!placed) notFound()
  return <ThemePageView meta={placed.meta} doc={placed.doc} />
}
