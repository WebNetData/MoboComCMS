import type { Metadata, Viewport } from 'next'
import './globals.css'
import './studio.css'
import './happ-design.css'
import './content-design.css'
import './builder-render.css'
import './theme-builder.css'
import '@/themes/generated.css'
import '@/themes/code/orbital/homepage.css'
import '@/themes/code/orbital/network.css'
import '@/themes/code/orbital/chrome.css'
import './application-polish.css'
import './fonts.css'
import './ticket-center.css'
import './subscription-hub.css'
import './store-design.css'
import './journal-design.css'
import './media-design.css'
import './forum.css'
import './engage.css'
import './shipping.css'
import './megamenu.css'
import './taxonomy.css'
import './software-portal.css'
import './games-portal.css'
import './journal-liona.css'
import './store-front.css'
import './store-marketing.css'
import './admin-uploads.css'
import './community.css'
import './account-home.css'
import './store-admin.css'
import './server-panel.css'
import './dashboard-shell.css'
import './official-invoice.css'
import './paywall.css'
import './marketplace.css'
import './livechat.css'
import './promo.css'
import './formbuilder.css'
import Providers from '@/components/Providers'
import { LocaleProvider } from '@/i18n/LocaleProvider'
import LocaleSetter from '@/i18n/LocaleSetter'
import { getServerLocale, getServerTheme } from '@/i18n/server'
import { dirOf } from '@/i18n/config'
import { deviceLocaleBootstrap } from '@/i18n/device-locale'
import { siteLocales } from '@/i18n/policy'
import { applyTitleTemplate } from '@/modules/seo/domain/seo'
import { getSiteSeo, organizationJsonLd } from '@/modules/site/server/seo'
import { getPublicSiteConfig } from '@/modules/site/config/store'
import { defaultSiteFonts } from '@/modules/site/config/types'
import { safeCustomCss } from '@/modules/site/config/validation'
import { bundledThemes } from '@/themes/registry'
import SiteProvider from '@/components/site/SiteProvider'
import ExtensionProvider from '@/extensions/client/ExtensionProvider'
import { getPublicExtensionRuntime } from '@/extensions/server/state'
import { pathDisabled } from '@/platform/extensions/contracts'
import PreviewBridge from '@/components/site/PreviewBridge'
import MusicPlayerProvider from '@/components/media/MusicPlayer'
import type { CSSProperties } from 'react'
import { resolveCodeThemeId } from '@/themes/runtime'
import { getPackageRuntime } from '@/modules/packages/server/runtime'
import PwaClient from '@/components/pwa/PwaClient'
import { CompareTray } from '@/components/engage/CompareControls'
import RouteAliasProvider from '@/platform/routing/RouteAliasProvider'
import { setRouteAliases } from '@/platform/routing/aliases'
import { loadRouteAliases } from '@/modules/site/server/routes'
import WebVitals from '@/components/site/WebVitals'

export const dynamic = 'force-dynamic'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0e1017' },
  ],
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale()
  const seo = await getSiteSeo(locale)

  return {
    metadataBase: new URL(seo.base),
    title: {
      default: seo.config.homeTitle || `${seo.name} — ${seo.tagline}`,
      template: applyTitleTemplate(seo.config.titleTemplate, seo.name),
    },
    description: seo.description,
    applicationName: seo.name,
    generator: 'Next.js',
    keywords: seo.config.keywords.length ? seo.config.keywords : undefined,
    category: 'shopping',
    alternates: seo.bilingual ? { canonical: seo.base, languages: { fa: seo.base, en: seo.base, 'x-default': seo.base } } : { canonical: seo.base, types: { 'application/rss+xml': `${seo.base}/feed.xml` } },
    icons: { icon: '/favicon.svg', apple: '/pwa-icon/180' },
    appleWebApp: { capable: true, title: seo.name, statusBarStyle: 'default' },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 },
    },
    verification: {
      ...(seo.config.verification.google ? { google: seo.config.verification.google } : {}),
      ...(seo.config.verification.yandex ? { yandex: seo.config.verification.yandex } : {}),
      ...(seo.config.verification.bing ? { other: { 'msvalidate.01': seo.config.verification.bing } } : {}),
    },
    openGraph: {
      type: 'website',
      url: seo.base,
      siteName: seo.name,
      title: `${seo.name} — ${seo.tagline}`,
      description: seo.description,
      locale: locale === 'fa' ? 'fa_IR' : 'en_US',
      images: [{ url: seo.ogImage, width: 1200, height: 630, alt: seo.name }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${seo.name} — ${seo.tagline}`,
      description: seo.description,
      images: [seo.ogImage],
    },
    other: {
      'format-detection': 'telephone=no',
    },
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getServerLocale()
  const theme = await getServerTheme()
  const [jsonLd, siteConfig, extensions, packages, routeAliases] = await Promise.all([organizationJsonLd(locale), getPublicSiteConfig(), getPublicExtensionRuntime(), getPackageRuntime(locale).catch(() => null), loadRouteAliases()])
  setRouteAliases(routeAliases)
  // Menus never link into disabled feature modules (e.g. /blog while the journal is off) — for every theme.
  // Pages of enabled uploaded packages that ask for it join the main menu.
  const locales = siteLocales()
  const site = { ...siteConfig, locales, navigation: [...siteConfig.navigation.filter(link => !pathDisabled(link.href, extensions)), ...(packages?.nav || [])], footer: siteConfig.footer.filter(link => !pathDisabled(link.href, extensions)) }
  // The site-wide music player keeps playing across page navigations while the music module is on.
  const musicOn = !pathDisabled('/music', extensions)
  const design = [...bundledThemes, ...site.themes].find(t => t.id === site.themeId) || bundledThemes[0]
  const fonts = { ...defaultSiteFonts(locale), ...(site.fonts || {}) }
  const light = design.lightColors
  const tokens = {
    '--site-bg': design.colors.background, '--site-surface': design.colors.surface, '--site-accent': design.colors.accent, '--site-text': design.colors.text, '--site-muted': design.colors.muted, '--site-border': design.colors.border, '--site-radius': `${design.radius}px`,
    '--site-font-body': fonts.body, '--site-font-heading': fonts.heading,
    ...(light ? {
      '--site-light-bg': light.background, '--site-light-surface': light.surface, '--site-light-accent': light.accent, '--site-light-text': light.text, '--site-light-muted': light.muted, '--site-light-border': light.border,
    } : {}),
  } as CSSProperties
  if (design.extends === 'orbital') Object.assign(tokens, { '--orbital-blue': design.colors.accent, '--hp-radius': `${design.radius}px`, ...(theme === 'dark' ? { '--orbital-bg': design.colors.background, '--orbital-surface': design.colors.surface, '--orbital-text': design.colors.text, '--orbital-muted': design.colors.muted, '--orbital-border': design.colors.border } : {}) })

  return (
    <html lang={locale} dir={dirOf(locale)} data-theme={theme} data-design={resolveCodeThemeId(site)} style={tokens} suppressHydrationWarning>
      <head>
        {locales.length > 1 && <script dangerouslySetInnerHTML={{ __html: deviceLocaleBootstrap }} />}
        {packages?.css ? <style data-packages dangerouslySetInnerHTML={{ __html: packages.css }} /> : null}
        {site.customCss?.trim() ? <style data-site-custom dangerouslySetInnerHTML={{ __html: safeCustomCss(site.customCss) }} /> : null}
      </head>
      <body>
        <script
          type="application/ld+json"
          // structured data for search engines (Organization + WebSite)
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
        />
        <PreviewBridge />
        <WebVitals />
        <RouteAliasProvider map={routeAliases}><LocaleProvider locale={locale}>
          <LocaleSetter locale={locale} theme={theme} />
          <Providers><SiteProvider config={site}><ExtensionProvider runtime={extensions} packageSlots={packages?.slots}>{musicOn ? <MusicPlayerProvider>{children}</MusicPlayerProvider> : children}<PwaClient /><CompareTray /></ExtensionProvider></SiteProvider></Providers>
        </LocaleProvider></RouteAliasProvider>
      </body>
    </html>
  )
}
