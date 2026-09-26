import type { Locale } from '@/i18n/dictionaries'
// Shared SEO helpers: canonical URLs, hreflang alternates, Open Graph/Twitter
// cards and the JSON-LD graphs that search engines read.
import type { Metadata } from 'next'
import { getSettings } from '@/modules/settings/server'
import { db } from '@/platform/database/prisma'
import { getSiteConfig } from '@/modules/site/config/store'
import { translate } from '@/modules/site/config/types'
import { minorToDecimal, normalizeCurrency, toMinor } from '@/shared/money'

export interface SiteSeo {
  base: string
  name: string
  tagline: string
  description: string
  locale: Locale
  ogImage: string
  themeColor: string
  verification: string
  twitter: string
}

/** Reads the branding/SEO settings once per render. */
export async function getSiteSeo(locale: Locale = 'en'): Promise<SiteSeo> {
  const s = await getSettings().catch(() => ({}) as Record<string, string>)
  const base = (s.siteUrl || process.env.NEXTAUTH_URL || 'http://localhost:3000').replace(/\/+$/, '')
  const site = await getSiteConfig()
  const name = site.brand
  const tagline = translate(site.tagline, locale)
  return {
    base,
    name,
    tagline,
    description:
      s.seoDescription ||
      (locale === 'fa'
        ? `${name} — خرید و مدیریت اشتراک VPN با پرداخت کریپتو، پنل مشتریان، کیف پول و اینترفیس جهانی.`
        : `${name} — buy and manage VPN subscriptions with crypto payments, a customer wallet and worldwide nodes.`),
    locale,
    ogImage: s.ogImage || `${base}/og.svg`,
    themeColor: s.themeColor || '#4b45ee',
    verification: s.googleVerification || '',
    twitter: s.supportTelegram || '',
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
  const url = input.path ? `${seo.base}${input.path.startsWith('/') ? input.path : '/' + input.path}` : seo.base
  const description = input.description || seo.description
  const image = input.image || seo.ogImage

  return {
    title: input.title,
    description,
    keywords: input.keywords,
    metadataBase: new URL(seo.base),
    alternates: { canonical: url, languages: { fa: url, en: url, 'x-default': url } },
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
export async function organizationJsonLd(locale: Locale = 'en') {
  const seo = await getSiteSeo(locale)
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${seo.base}/#organization`,
        name: seo.name,
        url: seo.base,
        description: seo.description,
        logo: { '@type': 'ImageObject', url: `${seo.base}/og.svg` },
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

export function productJsonLd(input: { name: string; description: string; price: number; currency?: string; image?: string; url: string; inStock?: boolean; rating?: number; reviewCount?: number }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: input.name,
    description: input.description,
    image: input.image ? [input.image] : undefined,
    brand: { '@type': 'Brand', name: 'MoboComCMS' },
    aggregateRating: input.reviewCount && input.rating ? { '@type': 'AggregateRating', ratingValue: input.rating.toFixed(1), reviewCount: input.reviewCount, bestRating: 5, worstRating: 1 } : undefined,
    offers: {
      '@type': 'Offer',
      price: minorToDecimal(toMinor(String(input.price), normalizeCurrency(input.currency || 'USD')), normalizeCurrency(input.currency || 'USD')),
      priceCurrency: normalizeCurrency(input.currency || 'USD'),
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
      item: `${base}${t.path}`,
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
