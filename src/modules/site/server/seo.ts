import type { SiteIdentity } from '@/modules/site/domain/site-identity'
import { toPublicPath } from '@/platform/routing/aliases'
import type { Locale } from '@/i18n/dictionaries'
// Shared SEO helpers: canonical URLs, hreflang alternates, Open Graph/Twitter
// cards and the JSON-LD graphs that search engines read.
import type { Metadata } from 'next'
import { getSettings } from '@/modules/settings/server'
import { db } from '@/platform/database/prisma'
import { getSiteConfig } from '@/modules/site/config/store'
import { translate } from '@/modules/site/config/types'
import { minorToDecimal, normalizeCurrency, toMinor } from '@/shared/money'
import { getSeoConfig } from '@/modules/seo/server/config'
import { siteLocales } from '@/i18n/policy'
import type { SeoConfig } from '@/modules/seo/domain/seo'

export interface SiteSeo {
  identity: SiteIdentity
  base: string
  name: string
  tagline: string
  description: string
  locale: Locale
  ogImage: string
  themeColor: string
  verification: string
  twitter: string
  config: SeoConfig
  /** hreflang alternates only make sense on multi-language deployments. */
  bilingual: boolean
}

/** Reads the branding/SEO settings once per render. */
export async function getSiteSeo(locale: Locale = 'en'): Promise<SiteSeo> {
  const s = await getSettings().catch(() => ({}) as Record<string, string>)
  const base = (s.siteUrl || process.env.NEXTAUTH_URL || 'http://localhost:3000').replace(/\/+$/, '')
  const [site, config] = await Promise.all([getSiteConfig(), getSeoConfig()])
  const name = site.brand
  const tagline = translate(site.tagline, locale)
  const absolute = (url: string) => (url.startsWith('/') ? `${base}${url}` : url)
  return {
    base,
    name,
    identity: site.identity || {},
    tagline,
    description:
      config.description ||
      (locale === 'fa'
        ? `${name}؛ ${tagline}. خرید کالا و محصولات مجازی، مجله، موزیک، فیلم و سریال، بازی، دانلود نرم‌افزار و تالار گفتمان.`
        : `${name} — ${tagline}. Shop, magazine, music, movies, games, software downloads and community forum.`),
    locale,
    ogImage: absolute(config.ogImage || '/og.png'),
    themeColor: s.themeColor || '#5b36f2',
    verification: config.verification.google,
    twitter: s.supportTelegram || '',
    config,
    bilingual: siteLocales().length > 1,
  }
}

export interface PageMetaInput {
  title: string
  description?: string
  path?: string
  image?: string
  type?: 'website' | 'article' | 'product'
  keywords?: string[]
  publishedTime?: string
  modifiedTime?: string
  noIndex?: boolean
  locale?: Locale
}

/** Builds a full Metadata object with canonical + fa/en alternates. */
export async function pageMeta(input: PageMetaInput): Promise<Metadata> {
  const locale = input.locale || 'en'
  const seo = await getSiteSeo(locale)
  const url = input.path ? `${seo.base}${toPublicPath(input.path.startsWith('/') ? input.path : '/' + input.path)}` : seo.base
  const description = input.description || seo.description
  const image = input.image || seo.ogImage

  return {
    title: input.title,
    description,
    keywords: input.keywords,
    metadataBase: new URL(seo.base),
    alternates: seo.bilingual ? { canonical: url, languages: { fa: url, en: url, 'x-default': url } } : { canonical: url },
    robots: input.noIndex ? { index: false, follow: false } : { index: true, follow: true },
    openGraph: {
      type: input.type === 'article' ? 'article' : 'website',
      url,
      title: input.title,
      description,
      siteName: seo.name,
      locale: locale === 'fa' ? 'fa_IR' : 'en_US',
      images: [{ url: image, width: 1200, height: 630, alt: input.title }],
      ...(input.publishedTime ? { publishedTime: input.publishedTime, modifiedTime: input.modifiedTime || input.publishedTime } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: input.title,
      description,
      images: [image],
      ...(seo.twitter ? { site: seo.twitter } : {}),
    },
  }
}

/** Organization + WebSite graph with a sitelinks search box. */
/**
 * A page that declares its own share card replaces the site's whole card, so this puts back what it left out: the page's
 * own address (from its canonical), the site's name and language, and the site's picture when the page has none.
 */
export async function shareCard(meta: Metadata, locale: Locale = 'fa'): Promise<Metadata> {
  const seo = await getSiteSeo(locale)
  const canonical = meta.alternates?.canonical
  const url = typeof canonical === 'string' || canonical instanceof URL ? canonical : undefined
  const own = (meta.openGraph || {}) as Record<string, unknown>
  const openGraph = { type: 'website', siteName: seo.name, locale: locale === 'fa' ? 'fa_IR' : 'en_US', ...(url ? { url } : {}), ...own, images: own.images || [seo.ogImage] }
  return { ...meta, openGraph: openGraph as Metadata['openGraph'] }
}

export async function organizationJsonLd(locale: Locale = 'en') {
  const seo = await getSiteSeo(locale)
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${seo.base}/#organization`,
        name: seo.name,
        ...(seo.config.brandLatin && seo.config.brandLatin !== seo.name ? { alternateName: seo.config.brandLatin } : {}),
        ...(seo.config.organization.legalName ? { legalName: seo.config.organization.legalName } : {}),
        url: seo.base,
        description: seo.description,
        logo: { '@type': 'ImageObject', url: seo.config.logo ? (seo.config.logo.startsWith('/') ? `${seo.base}${seo.config.logo}` : seo.config.logo) : `${seo.base}/og.png` },
        ...(seo.config.sameAs.length ? { sameAs: seo.config.sameAs } : {}),
        ...(seo.config.organization.email || seo.config.organization.phone ? { contactPoint: { '@type': 'ContactPoint', contactType: 'customer support', availableLanguage: ['fa'], ...(seo.config.organization.email ? { email: seo.config.organization.email } : {}), ...(seo.config.organization.phone ? { telephone: seo.config.organization.phone } : {}) } } : {}),
        ...(seo.config.organization.address ? { address: seo.config.organization.address } : {}),
      },
      {
        '@type': 'WebSite',
        '@id': `${seo.base}/#website`,
        url: seo.base,
        name: seo.name,
        description: seo.description,
        inLanguage: locale === 'fa' ? 'fa-IR' : 'en-US',
        publisher: { '@id': `${seo.base}/#organization` },
        potentialAction: {
          '@type': 'SearchAction',
          target: `${seo.base}/blog?q={search_term_string}`,
          'query-input': 'required name=search_term_string',
        },
      },
    ],
  }
}

export function articleJsonLd(input: {
  base: string
  title: string
  description: string
  url: string
  image?: string
  published?: string
  modified?: string
  author?: string
  section?: string
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: input.title,
    description: input.description,
    image: input.image ? [input.image] : undefined,
    datePublished: input.published,
    dateModified: input.modified || input.published,
    author: { '@type': 'Person', name: input.author || 'MoboComCMS' },
    publisher: { '@type': 'Organization', name: 'MoboComCMS' },
    articleSection: input.section,
    mainEntityOfPage: { '@type': 'WebPage', '@id': input.url },
  }
}

export function productJsonLd(input: { name: string; description: string; price: number; currency?: string; brand?: string; image?: string; url: string; inStock?: boolean; rating?: number; reviewCount?: number }) {
  const currency = normalizeCurrency(input.currency || 'USD')
  const amount = toMinor(String(input.price), currency)
  // Toman is an internal display currency; structured offers use the ISO rial.
  const offerCurrency = currency === 'IRT' ? 'IRR' : currency
  const offerAmount = currency === 'IRT' ? amount * 10n : amount
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: input.name,
    description: input.description,
    image: input.image ? [input.image] : undefined,
    brand: input.brand ? { '@type': 'Brand', name: input.brand } : undefined,
    aggregateRating: input.reviewCount && input.rating ? { '@type': 'AggregateRating', ratingValue: input.rating.toFixed(1), reviewCount: input.reviewCount, bestRating: 5, worstRating: 1 } : undefined,
    offers: {
      '@type': 'Offer',
      price: minorToDecimal(offerAmount, offerCurrency),
      priceCurrency: offerCurrency,
      availability: input.inStock === false ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
      url: input.url,
    },
  }
}

export function faqJsonLd(items: { q: string; a: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((i) => ({
      '@type': 'Question',
      name: i.q,
      acceptedAnswer: { '@type': 'Answer', text: i.a },
    })),
  }
}

export function breadcrumbJsonLd(base: string, trail: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((t, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: t.name,
      // Search engines get the address visitors see (/magazine/… when the journal is published there), not the internal route.
      item: `${base}${toPublicPath(t.path)}`,
    })),
  }
}

/** Small helper for sitemap/robots and any place that needs the public origin. */
export async function siteBase() {
  const seo = await getSiteSeo()
  return seo.base
}

/** Plans from the DB as a JSON-LD ItemList (used on /plans and the landing page). */
export async function plansJsonLd(base: string) {
  const plans = await db.plan.findMany({ where: { active: true }, orderBy: { sort: 'asc' }, take: 20 }).catch(() => [])
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: plans.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Product',
        name: `MoboComCMS ${p.name}`,
        description: `${p.trafficGB} GB · ${p.days} days · up to ${p.deviceLimit} devices`,
        offers: { '@type': 'Offer', price: minorToDecimal(p.priceMinor || toMinor(String(p.price), p.currency), p.currency), priceCurrency: normalizeCurrency(p.currency), availability: 'https://schema.org/InStock' },
      },
    })),
  }
}
