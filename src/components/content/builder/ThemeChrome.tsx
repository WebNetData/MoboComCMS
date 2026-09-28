import type { ReactNode } from 'react'
import TrustSeals from '@/components/site/TrustSeals'
import SiteHeader from '@/components/SiteHeader'
import SiteFooter from '@/components/SiteFooter'
import BuilderRenderer, { type BuilderContext, type BuilderLocale } from '@/components/content/builder/BuilderRenderer'
import { resolveThemeTemplate } from '@/modules/site/server/theme-templates'
import { previewTemplate, type BuilderPreview } from '@/modules/site/server/builder-preview'
import type { RenderContext } from '@/modules/site/domain/theme-templates'
import type { ChromeChoice } from '@/modules/site/domain/builder'

type NavPage = { slug: string; title: string; titleEn: string }

type HeaderProps = {
  context: RenderContext
  /** Page-level choice from the builder document layout ('default' | 'none' | template id). */
  choice?: ChromeChoice | string
  theme: string
  locale: BuilderLocale
  navPages?: NavPage[]
  breadcrumbs?: { label: string; href?: string }[]
  builderContext?: BuilderContext
  /** Rendered instead of the default site header when no template applies. */
  fallback?: ReactNode
  preview?: BuilderPreview
}

/**
 * Site header resolved through the theme builder: a page-level choice wins, then the
 * most specific published header template whose display rules match, then the
 * theme's default header.
 */
export async function ThemeHeader({ context, choice, theme, locale, navPages, breadcrumbs, builderContext, fallback, preview }: HeaderProps) {
  const editing = previewTemplate(preview, 'header')
  if (editing) {
    return <header className="br-theme-header" data-template={editing.id}>
      {editing.doc ? <BuilderRenderer doc={editing.doc} locale={locale} preview context={builderContext} /> : <div className="br-img-ph br-video-ph">{locale === 'fa' ? 'هدر خالی است — بلوک اضافه کنید' : 'Empty header — add blocks'}</div>}
    </header>
  }
  if (choice === 'none') return null
  const resolved = await resolveThemeTemplate('header', context, choice).catch(() => null)
  if (!resolved) return <>{fallback ?? <SiteHeader theme={theme} navPages={navPages} breadcrumbs={breadcrumbs} />}</>
  return <header className={`br-theme-header${resolved.meta.sticky ? ' is-sticky' : ''}`} data-template={resolved.meta.id}>
    <BuilderRenderer doc={resolved.doc} locale={locale} editable={false} context={builderContext} />
  </header>
}

type FooterProps = {
  context: RenderContext
  choice?: ChromeChoice | string
  locale: BuilderLocale
  navPages?: NavPage[]
  builderContext?: BuilderContext
  fallback?: ReactNode
  preview?: BuilderPreview
}

export async function ThemeFooter({ context, choice, locale, navPages, builderContext, fallback, preview }: FooterProps) {
  const editing = previewTemplate(preview, 'footer')
  if (editing) {
    return <footer className="br-theme-footer" data-template={editing.id}>
      {editing.doc ? <BuilderRenderer doc={editing.doc} locale={locale} preview context={builderContext} /> : <div className="br-img-ph br-video-ph">{locale === 'fa' ? 'فوتر خالی است — بلوک اضافه کنید' : 'Empty footer — add blocks'}</div>}
    </footer>
  }
  if (choice === 'none') return null
  const resolved = await resolveThemeTemplate('footer', context, choice).catch(() => null)
  if (!resolved) return <>{fallback ?? <SiteFooter navPages={navPages} />}</>
  return <footer className="br-theme-footer" data-template={resolved.meta.id}>
    <BuilderRenderer doc={resolved.doc} locale={locale} editable={false} context={builderContext} />
    <div className="container"><TrustSeals /></div>
  </footer>
}
