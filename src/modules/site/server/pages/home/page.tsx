import { headers } from 'next/headers'
import LandingPage from '@/components/site/LandingPage'
import BuilderRenderer from '@/components/content/builder/BuilderRenderer'
import { ThemeFooter, ThemeHeader } from '@/components/content/builder/ThemeChrome'
import SectionBarSlot from '@/components/site/SectionBarSlot'
import { getPublicSiteConfig } from '@/modules/site/config/store'
import { getServerLocale, getServerTheme } from '@/i18n/server'
import { translate } from '@/modules/site/config/types'
import { faqJsonLd } from '@/modules/site/server/seo'
import { getPublicNavigationPages } from '@/modules/site/server/navigation'
import { getLandingData } from '@/modules/site/server/homepage'
import { editableFor, isPreview, resolveBuilderDoc, type BuilderPreview } from '@/modules/site/server/builder-preview'
import { resolvePlacedPage } from '@/modules/site/server/theme-templates'
import { PluginOutlet } from '@/plugins/registry'
import type { RenderContext } from '@/modules/site/domain/theme-templates'
import { safeJsonLd } from '@/shared/seo/json-ld'

const CONTEXT: RenderContext = { route: 'home' }

/**
 * Home page. Order: a published theme page placed as "home" → the home builder
 * document → the default landing page.
 */
export default async function HomeView({ preview }: { preview?: BuilderPreview }) {
  const [locale, theme] = await Promise.all([getServerLocale(), getServerTheme()])
  const [site, navPages, landingData, placed, homeDoc] = await Promise.all([
    getPublicSiteConfig(),
    getPublicNavigationPages(),
    getLandingData(),
    resolvePlacedPage('home'),
    resolveBuilderDoc(preview, 'home'),
  ])
  // While the home builder document itself is edited, show it even if a theme page is placed.
  const useHomeDoc = !placed || preview?.pageId === 'home'
  const builderDoc = useHomeDoc ? homeDoc : placed.doc
  const docPageId = useHomeDoc ? 'home' : placed.meta.id
  const nonce = (await headers()).get('x-nonce') || undefined
  const faq = builderDoc ? [] : site.sections.filter(s => s.enabled && s.kind === 'faq').flatMap(s => s.items.map(i => ({ q: translate(i.title, locale), a: translate(i.text, locale) })))
  const main = builderDoc
    ? <><PluginOutlet slot="home.before-main" site={site} locale={locale}/><main className="br-page-main" data-solution={useHomeDoc ? undefined : placed?.meta.solution}><BuilderRenderer doc={builderDoc} locale={locale} data={landingData} preview={isPreview(preview)} editable={editableFor(preview, docPageId)}/></main><PluginOutlet slot="home.after-main" site={site} locale={locale}/></>
    : <LandingPage site={site} locale={locale} data={landingData}/>
  return <>
    {faq.length > 0 && <script nonce={nonce} type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(faqJsonLd(faq)) }}/>}
    <ThemeHeader context={CONTEXT} choice={builderDoc?.layout?.header} theme={theme} locale={locale} navPages={navPages} preview={preview}/>
    <SectionBarSlot section="home" />
    {main}
    <ThemeFooter context={CONTEXT} choice={builderDoc?.layout?.footer} locale={locale} navPages={navPages} preview={preview}/>
  </>
}
