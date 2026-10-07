// SEO rules shared by metadata, robots, feeds, the audit and tests (pure).

export interface SeoConfig {
  /** `%s` is replaced by the page title. */
  titleTemplate: string
  homeTitle: string
  description: string
  keywords: string[]
  /** Latin brand name for share images and English crawlers. */
  brandLatin: string
  ogImage: string
  logo: string
  verification: { google: string; bing: string; yandex: string }
  /** Official profiles (Instagram, Telegram, X, LinkedIn…) for Organization.sameAs. */
  sameAs: string[]
  organization: { legalName: string; email: string; phone: string; address: string }
  indexNow: { enabled: boolean; key: string }
  /** Let AI assistants (ChatGPT, Claude, Perplexity, Gemini…) read public pages. */
  allowAiCrawlers: boolean
}

export const DEFAULT_SEO: SeoConfig = {
  titleTemplate: '%s | {brand}',
  homeTitle: '',
  description: '',
  keywords: [],
  brandLatin: 'MoboCom',
  ogImage: '',
  logo: '',
  verification: { google: '', bing: '', yandex: '' },
  sameAs: [],
  organization: { legalName: '', email: '', phone: '', address: '' },
  indexNow: { enabled: true, key: '' },
  allowAiCrawlers: true,
}

/** User agents of AI assistants and answer engines (robots.txt groups). */
export const AI_CRAWLERS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Applebot-Extended', 'Bytespider', 'CCBot', 'meta-externalagent', 'Amazonbot', 'DuckAssistBot', 'cohere-ai'] as const

/** Paths that must never be indexed. */
export const PRIVATE_PATHS = ['/admin', '/dashboard', '/api/', '/builder-preview/', '/invoice/', '/login', '/register', '/payment/', '/checkout', '/miniapp', '/reseller', '/forum/new']

const text = (value: unknown, max: number) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const httpsUrl = (value: unknown) => { const url = text(value, 500); try { return url && ['https:', 'http:'].includes(new URL(url).protocol) ? url : '' } catch { return '' } }
const siteOrHttps = (value: unknown) => { const url = text(value, 500); return /^\/(?!\/)[^\s<>]*$/.test(url) ? url : httpsUrl(url) }
// Verification tokens are opaque ids; accept a pasted <meta … content="…"> too.
const token = (value: unknown) => { const raw = String(value ?? ''); const inMeta = /content=["']([^"']+)["']/i.exec(raw); return text(inMeta ? inMeta[1] : raw, 120).replace(/[^A-Za-z0-9_\-.:=+/]/g, '') }

/** Normalizes untrusted admin input into a complete, safe config. */
export function normalizeSeoConfig(input: unknown, previous: SeoConfig = DEFAULT_SEO): SeoConfig {
  const v = isRecord(input) ? input : {}
  const pick = <K extends keyof SeoConfig>(key: K) => (key in v ? v[key] : previous[key])
  const verification = isRecord(pick('verification')) ? pick('verification') as Record<string, unknown> : {}
  const organization = isRecord(pick('organization')) ? pick('organization') as Record<string, unknown> : {}
  const indexNow = isRecord(pick('indexNow')) ? pick('indexNow') as Record<string, unknown> : {}
  const list = (value: unknown, max: number, each: (item: unknown) => string) => (Array.isArray(value) ? value : String(value ?? '').split(/[\n,،]/)).map(each).filter(Boolean).slice(0, max)
  const template = text(pick('titleTemplate'), 120)
  const key = text(indexNow.key, 64)
  return {
    titleTemplate: template.includes('%s') ? template : DEFAULT_SEO.titleTemplate,
    homeTitle: text(pick('homeTitle'), 120),
    description: text(pick('description'), 320),
    keywords: [...new Set(list(pick('keywords'), 30, (item) => text(item, 60)))],
    brandLatin: text(pick('brandLatin'), 40).replace(/[^A-Za-z0-9 .&-]/g, '') || DEFAULT_SEO.brandLatin,
    ogImage: siteOrHttps(pick('ogImage')),
    logo: siteOrHttps(pick('logo')),
    verification: { google: token(verification.google), bing: token(verification.bing), yandex: token(verification.yandex) },
    sameAs: [...new Set(list(pick('sameAs'), 12, httpsUrl))],
    organization: { legalName: text(organization.legalName, 120), email: text(organization.email, 120).replace(/[^\w.@+-]/g, ''), phone: text(organization.phone, 40).replace(/[^\d+\-() ]/g, ''), address: text(organization.address, 300) },
    indexNow: { enabled: indexNow.enabled !== false, key: /^[A-Za-z0-9-]{8,64}$/.test(key) ? key : '' },
    allowAiCrawlers: pick('allowAiCrawlers') !== false,
  }
}

export function applyTitleTemplate(template: string, brand: string) {
  return (template || DEFAULT_SEO.titleTemplate).replace('{brand}', brand)
}

/** A meta description of ~155 characters cut at a word boundary. */
export function metaDescription(source: string, max = 155): string {
  const flat = String(source || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
  if (flat.length <= max) return flat
  const cut = flat.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[،,.;:\s]+$/, '')}…`
}

// ------------------------------------------------------------------ audit

export type AuditItem = { kind: string; title: string; path: string; description: string; image: string; words: number }
export type AuditIssue = { severity: 'error' | 'warning'; code: string; kind: string; title: string; path: string }

/** Content-level checks: missing/short/long descriptions, images, thin pages and duplicate titles. */
export function auditContent(items: AuditItem[]): AuditIssue[] {
  const issues: AuditIssue[] = []
  const titles = new Map<string, AuditItem[]>()
  for (const item of items) {
    const push = (severity: AuditIssue['severity'], code: string) => issues.push({ severity, code, kind: item.kind, title: item.title, path: item.path })
    const length = item.description.trim().length
    if (!length) push('error', 'description-missing')
    else if (length < 50) push('warning', 'description-short')
    else if (length > 170) push('warning', 'description-long')
    if (!item.image) push('warning', 'image-missing')
    if (item.words > 0 && item.words < 120 && (item.kind === 'post' || item.kind === 'page')) push('warning', 'thin-content')
    if (item.title.length > 70) push('warning', 'title-long')
    const key = item.title.trim().toLowerCase()
    if (key) titles.set(key, [...(titles.get(key) || []), item])
  }
  for (const group of titles.values()) if (group.length > 1) for (const item of group) issues.push({ severity: 'warning', code: 'title-duplicate', kind: item.kind, title: item.title, path: item.path })
  return issues
}

export const wordCount = (html: string) => String(html || '').replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length

// ------------------------------------------------------------------ llms.txt

export type LlmsSection = { title: string; links: { title: string; url: string; note?: string }[] }

/** https://llmstxt.org — a Markdown map of the site for AI assistants. */
export function buildLlmsTxt(input: { name: string; summary: string; details: string[]; sections: LlmsSection[] }): string {
  const clean = (value: string) => String(value || '').replace(/[\r\n]+/g, ' ').replace(/[[\]]/g, '').trim()
  const lines = [`# ${clean(input.name)}`, '', `> ${clean(input.summary)}`, '']
  for (const detail of input.details) if (detail.trim()) lines.push(clean(detail))
  for (const section of input.sections) {
    if (!section.links.length) continue
    lines.push('', `## ${clean(section.title)}`, '')
    for (const link of section.links) lines.push(`- [${clean(link.title)}](${link.url})${link.note ? `: ${clean(link.note)}` : ''}`)
  }
  return lines.join('\n') + '\n'
}

// ------------------------------------------------------------------ RSS

const xml = (value: string) => String(value || '').replace(/[<>&'"]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[char]!))
export type FeedItem = { title: string; url: string; description: string; date: Date; category?: string; image?: string }

export function buildRss(input: { title: string; url: string; description: string; language: string; items: FeedItem[] }): string {
  const items = input.items.map((item) => `    <item>
      <title>${xml(item.title)}</title>
      <link>${xml(item.url)}</link>
      <guid isPermaLink="true">${xml(item.url)}</guid>
      <pubDate>${new Date(item.date).toUTCString()}</pubDate>
      <description>${xml(item.description)}</description>${item.category ? `\n      <category>${xml(item.category)}</category>` : ''}${item.image ? `\n      <enclosure url="${xml(item.image)}" type="image/jpeg" length="0"/>` : ''}
    </item>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xml(input.title)}</title>
    <link>${xml(input.url)}</link>
    <description>${xml(input.description)}</description>
    <language>${xml(input.language)}</language>
    <atom:link href="${xml(input.url.replace(/\/$/, ''))}/feed.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>
`
}

// ---- listing pages: one address per list worth indexing

/**
 * The canonical address and indexability of a listing page reached with filters. The filters in `keep`
 * make a list of its own (a genre, a page of it) and stay in the canonical address, in that order; those in
 * `same` only reorder the same list and are dropped from it; any other filter in use makes a one-off
 * combination that is not indexed.
 */
export function listingMeta(path: string, params: Record<string, string | string[] | undefined>, keep: readonly string[], same: readonly string[] = ['sort']): { canonical: string; index: boolean } {
  const value = (key: string) => { const raw = params[key]; const text = Array.isArray(raw) ? raw[0] : raw; return typeof text === 'string' ? text.trim() : '' }
  const used = Object.keys(params).filter((key) => value(key))
  const kept = keep.filter((key) => value(key) && !(key === 'page' && value(key) === '1'))
  const query = kept.map((key) => `${key}=${encodeURIComponent(value(key))}`).join('&')
  return { canonical: query ? `${path}?${query}` : path, index: used.every((key) => keep.includes(key) || same.includes(key)) }
}
