import { toPublicPath } from '@/platform/routing/aliases'
import { loadRouteAliases } from '@/modules/site/server/routes'
import type { MetadataRoute } from 'next'
import { db } from '@/platform/database/prisma'
import { getSettings } from '@/modules/settings/server'
import { listPublishedSections } from '@/modules/site/server/theme-templates'
import { getPublicExtensionRuntime } from '@/extensions/server/state'
import { pathDisabled } from '@/platform/extensions/contracts'
import { loadMaintenance, maintenanceBases } from '@/modules/site/server/maintenance'
import { pathClosed } from '@/modules/site/domain/maintenance'
import { livePostWhere } from '@/modules/journal/domain/journal'
import { publicProductWhere } from '@/modules/catalog/domain/product-publication'
import { entitySitemap, forumSitemap } from '@/modules/seo/server/sitemap-entities'


/** Static storefront routes + every published CMS document. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const settings = await getSettings().catch(() => null)
  const base = (settings?.siteUrl || process.env.NEXTAUTH_URL || 'http://localhost:3000').replace(/\/+$/, '')
  const now = new Date()

  const entries: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/plans`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    ...(settings?.storeEnabled === 'true' ? [{ url: `${base}/products`, lastModified: now, changeFrequency: 'weekly' as const, priority: 0.8 }] : []),
    { url: `${base}/blog`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
  ]

  try {
    const [pages, posts, products, postCats, productCats] = await Promise.all([
      db.page.findMany({ where: { status: 'PUBLISHED' }, select: { slug: true, updatedAt: true } }),
      db.post.findMany({ where: livePostWhere(now), select: { slug: true, updatedAt: true } }),
      db.product.findMany({ where: publicProductWhere, select: { slug: true, updatedAt: true } }),
      db.postCategory.findMany({ select: { slug: true } }),
      db.productCategory.findMany({ select: { slug: true } }),
    ])

    for (const p of pages) entries.push({ url: `${base}/p/${p.slug}`, lastModified: p.updatedAt, changeFrequency: 'monthly', priority: 0.6 })
    for (const p of posts) entries.push({ url: `${base}/blog/${p.slug}`, lastModified: p.updatedAt, changeFrequency: 'weekly', priority: 0.7 })
    if (settings?.storeEnabled === 'true') for (const p of products) entries.push({ url: `${base}/products/${p.slug}`, lastModified: p.updatedAt, changeFrequency: 'weekly', priority: 0.6 })
    for (const c of postCats) entries.push({ url: `${base}/blog?category=${c.slug}`, changeFrequency: 'weekly', priority: 0.4 })
    for (const section of await listPublishedSections()) entries.push({ url: `${base}/${section.placement.slug}`, lastModified: new Date(section.updatedAt || now), changeFrequency: 'daily', priority: 0.7 })
    if (settings?.storeEnabled === 'true') for (const c of productCats) entries.push({ url: `${base}/products?category=${c.slug}`, changeFrequency: 'weekly', priority: 0.4 })
  } catch {
    // a sitemap must never fail the build/deploy — static routes are enough
  }

  // Music, film & series, games and VIP (filtered below when their module is off).
  try {
    const live = { status: 'PUBLISHED', publishedAt: { lte: now } }
    const [tracks, albums, artists, titles, games] = await Promise.all([
      db.musicTrack.findMany({ where: live, select: { slug: true, updatedAt: true }, orderBy: { publishedAt: 'desc' }, take: 5000 }),
      db.musicAlbum.findMany({ where: live, select: { slug: true, updatedAt: true }, take: 2000 }),
      db.musicArtist.findMany({ select: { slug: true, updatedAt: true }, take: 2000 }),
      db.cinemaTitle.findMany({ where: live, select: { slug: true, updatedAt: true }, take: 5000 }),
      db.gameTitle.findMany({ where: live, select: { slug: true, updatedAt: true }, take: 5000 }),
    ])
    entries.push(
      { url: `${base}/music`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
      { url: `${base}/cinema`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
      { url: `${base}/games`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
      { url: `${base}/games/calendar`, lastModified: now, changeFrequency: 'daily', priority: 0.6 },
      { url: `${base}/games/top`, lastModified: now, changeFrequency: 'weekly', priority: 0.6 },
      { url: `${base}/games/franchises`, lastModified: now, changeFrequency: 'weekly', priority: 0.5 },
      { url: `${base}/vip`, lastModified: now, changeFrequency: 'weekly', priority: 0.6 },
    )
    for (const row of tracks) entries.push({ url: `${base}/music/track/${row.slug}`, lastModified: row.updatedAt, changeFrequency: 'monthly', priority: 0.6 })
    for (const row of albums) entries.push({ url: `${base}/music/album/${row.slug}`, lastModified: row.updatedAt, changeFrequency: 'monthly', priority: 0.6 })
    for (const row of artists) entries.push({ url: `${base}/music/artist/${row.slug}`, lastModified: row.updatedAt, changeFrequency: 'weekly', priority: 0.5 })
    for (const row of titles) entries.push({ url: `${base}/cinema/${row.slug}`, lastModified: row.updatedAt, changeFrequency: 'weekly', priority: 0.7 })
    for (const row of games) entries.push({ url: `${base}/games/${row.slug}`, lastModified: row.updatedAt, changeFrequency: 'weekly', priority: 0.7 })
    const franchises = await db.gameFranchise.findMany({ where: { games: { some: live } }, select: { slug: true, updatedAt: true }, take: 2000 })
    for (const row of franchises) entries.push({ url: `${base}/games/franchise/${row.slug}`, lastModified: row.updatedAt, changeFrequency: 'monthly', priority: 0.5 })
  } catch {
    // media tables may not be migrated yet
  }

  // Software downloads and public forum boards/threads (VIP boards stay out).
  try {
    const [software, forum, entities] = await Promise.all([
      db.softwareTitle.findMany({ where: { status: 'PUBLISHED', publishedAt: { lte: now } }, select: { slug: true, updatedAt: true }, take: 5000 }),
      // Forums and topics come from the forum's own rule for what a visitor may read (a forum of one group, a club, a section are not public by a column).
      forumSitemap().catch(() => []),
      entitySitemap(now).catch(() => []),
    ])
    entries.push({ url: `${base}/software`, lastModified: now, changeFrequency: 'daily', priority: 0.8 }, { url: `${base}/forum`, lastModified: now, changeFrequency: 'hourly', priority: 0.7 })
    for (const row of software) entries.push({ url: `${base}/software/${row.slug}`, lastModified: row.updatedAt, changeFrequency: 'weekly', priority: 0.7 })
    for (const row of [...forum, ...entities]) entries.push({ url: `${base}${row.path}`, ...(row.lastModified ? { lastModified: row.lastModified } : {}), changeFrequency: row.changeFrequency, priority: row.priority })
    entries.push({ url: `${base}/cinema/calendar`, lastModified: now, changeFrequency: 'daily', priority: 0.5 })
  } catch {
    // tables may not be migrated yet
  }

  try {
    const templates = await db.promptTemplate.findMany({ where: { status: 'PUBLISHED', publishedAt: { lte: now } }, select: { slug: true, updatedAt: true }, take: 5000 })
    entries.push({ url: base + '/prompts', changeFrequency: 'weekly', priority: 0.7 }, { url: base + '/prompts/library', changeFrequency: 'weekly', priority: 0.6 })
    for (const template of templates) entries.push({ url: base + '/prompts/templates/' + template.slug, lastModified: template.updatedAt, changeFrequency: 'monthly', priority: 0.5 })
  } catch { /* new additive table may not be migrated yet */ }

  // Disabled feature modules (journal, VPN plans, store …) leave the sitemap.
  const runtime = await getPublicExtensionRuntime().catch(() => null)
  const aliases = await loadRouteAliases()
  const publish = (entry: MetadataRoute.Sitemap[number]) => {
    try { const url = new URL(entry.url); return { ...entry, url: `${url.origin}${toPublicPath(url.pathname + url.search, aliases)}` } } catch { return entry }
  }
  // A section in maintenance leaves the sitemap too: its pages answer 503 until it is opened again.
  const maintenance = await loadMaintenance().catch(() => null), bases = maintenanceBases()
  const open = (entry: MetadataRoute.Sitemap[number]) => { try { const path = new URL(entry.url).pathname; return !(runtime && pathDisabled(path, runtime)) && !(maintenance && pathClosed(path, maintenance, bases)) } catch { return true } }
  return entries.filter(open).map(publish)
}
