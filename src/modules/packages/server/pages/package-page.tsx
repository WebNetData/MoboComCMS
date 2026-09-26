import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getServerLocale, getServerTheme } from '@/i18n/server'
import { ThemeFooter, ThemeHeader } from '@/components/content/builder/ThemeChrome'
import { getPublicNavigationPages } from '@/modules/site/server/navigation'
import { getPackagePage } from '@/modules/packages/server/runtime'

type Params = Promise<{ id: string; slug: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id, slug } = await params
  const locale = await getServerLocale()
  const page = await getPackagePage(id, slug, locale)
  if (!page) return { title: 'Not found', robots: { index: false, follow: false } }
  return { title: locale === 'fa' ? page.title.fa : page.title.en || page.title.fa }
}

/** A page shipped by an uploaded package, rendered inside the active theme's chrome. */
export default async function PackagePageView({ params }: { params: Params }) {
  const { id, slug } = await params
  const [locale, theme, navPages] = await Promise.all([getServerLocale(), getServerTheme(), getPublicNavigationPages()])
  const page = await getPackagePage(id, slug, locale)
  if (!page) notFound()
  const fa = locale === 'fa'
  const title = fa ? page.title.fa : page.title.en || page.title.fa
  const context = { route: 'page' } as const
  return <>
    <ThemeHeader context={context} theme={theme} locale={locale} navPages={navPages} breadcrumbs={[{ label: fa ? 'خانه' : 'Home', href: '/' }, { label: title }]}/>
    <main id="main-content" className="package-page" data-package={id}>
      <h1 className="sr-only">{title}</h1>
      <div dangerouslySetInnerHTML={{ __html: page.html }}/>
    </main>
    <ThemeFooter context={context} locale={locale} navPages={navPages}/>
  </>
}
