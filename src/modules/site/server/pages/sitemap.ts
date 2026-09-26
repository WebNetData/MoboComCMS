import type { MetadataRoute } from 'next'
import { db } from '@/platform/database/prisma'
import { getSettings } from '@/modules/settings/server'
import { listPublishedSections } from '@/modules/site/server/theme-templates'
import { getPublicExtensionRuntime } from '@/extensions/server/state'
import { pathDisabled } from '@/platform/extensions/contracts'


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
      db.post.findMany({ where: { status: 'PUBLISHED' }, select: { slug: true, updatedAt: true } }),
      db.product.findMany({ where: { active: true }, select: { slug: true, updatedAt: true } }),
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
      { url: `${base}/vip`, lastModified: now, changeFrequency: 'weekly', priority: 0.6 },
    )
    for (const row of tracks) entries.push({ url: `${base}/music/track/${row.slug}`, lastModified: row.updatedAt, changeFrequency: 'monthly', priority: 0.6 })
    for (const row of albums) entries.push({ url: `${base}/music/album/${row.slug}`, lastModified: row.updatedAt, changeFrequency: 'monthly', priority: 0.6 })
    for (const row of artists) entries.push({ url: `${base}/music/artist/${row.slug}`, lastModified: row.updatedAt, changeFrequency: 'weekly', priority: 0.5 })
    for (const row of titles) entries.push({ url: `${base}/cinema/${row.slug}`, lastModified: row.updatedAt, changeFrequency: 'weekly', priority: 0.7 })
    for (const row of games) entries.push({ url: `${base}/games/${row.slug}`, lastModified: row.updatedAt, changeFrequency: 'weekly', priority: 0.7 })
  } catch {
    // media tables may not be migrated yet
  }

  // Software downloads and public forum boards/threads (VIP boards stay out).
  try {
    const [software, boards, threads] = await Promise.all([
      db.softwareTitle.findMany({ where: { status: 'PUBLISHED', publishedAt: { lte: now } }, select: { slug: true, updatedAt: true }, take: 5000 }),
      db.forumCategory.findMany({ where: { access: 'PUBLIC' }, select: { slug: true, updatedAt: true } }),
      db.forumThread.findMany({ where: { status: 'VISIBLE', category: { access: 'PUBLIC' } }, select: { id: true, lastPostAt: true }, orderBy: { lastPostAt: 'desc' }, take: 5000 }),
    ])
    entries.push({ url: `${base}/software`, lastModified: now, changeFrequency: 'daily', priority: 0.8 }, { url: `${base}/forum`, lastModified: now, changeFrequency: 'hourly', priority: 0.7 })
    for (const row of software) entries.push({ url: `${base}/software/${row.slug}`, lastModified: row.updatedAt, changeFrequency: 'weekly', priority: 0.7 })
    for (const row of boards) entries.push({ url: `${base}/forum/c/${row.slug}`, lastModified: row.updatedAt, changeFrequency: 'daily', priority: 0.5 })
    for (const row of threads) entries.push({ url: `${base}/forum/t/${row.id}`, lastModified: row.lastPostAt, changeFrequency: 'weekly', priority: 0.4 })
  } catch {
    // tables may not be migrated yet
  }

  // Disabled feature modules (journal, VPN plans, store …) leave the sitemap.
  const runtime = await getPublicExtensionRuntime().catch(() => null)
  if (!runtime) return entries
  return entries.filter((entry) => { try { return !pathDisabled(new URL(entry.url).pathname, runtime) } catch { return true } })
}
