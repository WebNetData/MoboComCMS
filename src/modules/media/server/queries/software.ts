import { db } from '@/platform/database/prisma'
import { parseJsonList, splitList } from '@/modules/media/domain/media'
import { plainText } from '@/shared/text/plain'
import { currentSoftwareVersions, projectSoftwareVersion, type VersionProjection } from '@/modules/software/server/current-version'
import { relatedSoftware } from '@/modules/recommendations/server/contextual'
import type { Prisma } from '@prisma/client'
import { publicLinks } from '@/modules/media/server/queries/cinema'
import { PAGE_SIZE, live } from '@/modules/media/server/queries/core'
import { allOrEmpty } from '@/modules/media/server/queries/music'
import { countList } from '@/modules/media/server/queries/shared'

export type SoftwareCard = {
  id: number; slug: string; title: string; titleEn: string; icon: string; cover: string; version: string; developer: string
  license: string; platforms: string[]; category: string; size: string; access: string; summary: string; downloads: number; views: number; publishedAt: Date; updatedAt: Date
  recommendationReason?: string
}

function toSoftware(source: any, versions: VersionProjection): SoftwareCard {
  const row = projectSoftwareVersion(source, versions)
  return {
    id: row.id, slug: row.slug, title: row.title, titleEn: row.titleEn, icon: row.icon, cover: row.cover || row.icon, version: row.version, developer: row.developer,
    license: row.license, platforms: splitList(row.platforms, 6), category: row.category, size: row.size, access: row.access, summary: plainText(row.summary), downloads: row.downloads,
    views: row.views ?? 0, publishedAt: row.publishedAt, updatedAt: row.updatedAt ?? row.publishedAt,
  }
}

const FEED_SIZE = 12

/** Paginated release archive. Only due versions of live parent titles qualify. */
export async function softwareReleaseFeed(input: { software?: string; channel?: string; platform?: string; architecture?: string; q?: string; page?: number }) {
  const now = new Date()
  const page = Math.max(1, Math.min(500, Number(input.page) || 1))
  const channel = ['STABLE', 'BETA', 'NIGHTLY'].includes(String(input.channel)) ? String(input.channel) : ''
  const platform = String(input.platform || '').trim().slice(0, 60)
  const architecture = String(input.architecture || '').trim().slice(0, 40)
  const q = String(input.q || '').trim().slice(0, 80)
  const where: Prisma.SoftwareReleaseWhereInput = {
    status: 'PUBLISHED', releasedAt: { lte: now },
    software: { status: 'PUBLISHED', publishedAt: { lte: now }, ...(input.software ? { slug: String(input.software).slice(0, 120) } : {}) },
    ...(channel ? { channel } : {}),
    ...(platform || architecture ? { targets: { some: { ...(platform ? { platform } : {}), ...(architecture ? { architecture } : {}) } } } : {}),
    ...(q ? { OR: [{ version: { contains: q } }, { software: { title: { contains: q } } }, { software: { titleEn: { contains: q } } }, { software: { developer: { contains: q } } }] } : {}),
  }
  const total = await db.softwareRelease.count({ where })
  const pages = Math.max(1, Math.ceil(total / 20))
  const currentPage = Math.min(page, pages)
  const rows = await db.softwareRelease.findMany({ where, include: { software: { select: { slug: true, title: true, titleEn: true, icon: true, summary: true, developer: true } }, targets: { orderBy: { id: 'asc' } } }, orderBy: [{ releasedAt: 'desc' }, { id: 'desc' }], skip: (currentPage - 1) * 20, take: 20 })
  return { items: rows.map((row) => ({ id: row.id, version: row.version, channel: row.channel, releasedAt: row.releasedAt, changelog: plainText(row.changelog).slice(0, 220), size: row.size, targets: row.targets.map(({ platform, architecture, minVersion }) => ({ platform, architecture, minVersion })), software: { ...row.software, summary: plainText(row.software.summary).slice(0, 160) } })), total, page: currentPage, pages }
}

/** One historical version, including protected file handles but never raw URLs. */
export async function getSoftwareRelease(slug: string, releaseId: number) {
  if (!Number.isSafeInteger(releaseId) || releaseId < 1) return null
  const now = new Date()
  const release = await db.softwareRelease.findFirst({
    where: { id: releaseId, status: 'PUBLISHED', releasedAt: { lte: now }, software: { slug, status: 'PUBLISHED', publishedAt: { lte: now } } },
    include: { software: { select: { id: true, slug: true, title: true, titleEn: true, icon: true, access: true, developer: true, developerStudioId: true, summary: true } }, targets: { orderBy: { id: 'asc' } } },
  })
  if (!release) return null
  const links = await publicLinks('softwarerelease', [release.id])
  return { id: release.id, version: release.version, channel: release.channel, changelog: release.changelog, requirements: release.requirements, screenshots: parseJsonList<{ src: string }>(release.screenshots).map((shot) => shot.src).filter(Boolean), size: release.size, checksum: release.checksum, releasedAt: release.releasedAt, targets: release.targets, software: { ...release.software, summary: plainText(release.software.summary) }, links: links.get(release.id) || [] }
}

/** Softgozar-style feed: newest updates first, filterable by platform, category, license and search. */
export async function softwareFeed(input: { platform?: string; category?: string; license?: string; developer?: string; publisher?: string; developerStudioId?: number; publisherStudioId?: number; sort?: string; q?: string; page?: number; ids?: number[] }) {
  const page = Math.max(1, Math.min(500, Number(input.page) || 1))
  const where: any = { ...live() }
  /** Items filed under a taxonomy term (and its sub-terms). */
  if (input.ids) where.id = { in: input.ids.slice(0, 5000) }
  if (input.platform) where.platforms = { contains: String(input.platform).slice(0, 40) }
  if (input.category) where.category = String(input.category).slice(0, 60)
  if (input.license) where.license = String(input.license).slice(0, 20)
  if (input.developerStudioId && Number.isSafeInteger(input.developerStudioId) && input.developerStudioId > 0) where.developerStudioId = input.developerStudioId
  else if (input.developer) where.developer = String(input.developer).slice(0, 160)
  if (input.publisherStudioId && Number.isSafeInteger(input.publisherStudioId) && input.publisherStudioId > 0) where.publisherStudioId = input.publisherStudioId
  else if (input.publisher) where.publisher = String(input.publisher).slice(0, 160)
  const q = String(input.q || '').trim().slice(0, 80)
  if (q) where.OR = [{ title: { contains: q } }, { titleEn: { contains: q } }, { developer: { contains: q } }, { category: { contains: q } }, { summary: { contains: q } }]
  const orderBy = input.sort === 'popular' ? [{ downloads: 'desc' as const }] : input.sort === 'views' ? [{ views: 'desc' as const }] : input.sort === 'name' ? [{ title: 'asc' as const }] : [{ updatedAt: 'desc' as const }]
  const [rows, total] = await Promise.all([
    db.softwareTitle.findMany({ where, orderBy, skip: (page - 1) * FEED_SIZE, take: FEED_SIZE }),
    db.softwareTitle.count({ where }),
  ]).catch(() => [[], 0] as [any[], number])
  const versions = await currentSoftwareVersions(rows.map((row) => row.id))
  return { items: rows.map((row) => toSoftware(row, versions)), total, page, pages: Math.max(1, Math.ceil(total / FEED_SIZE)) }
}

export type SoftwareTree = { platform: string; count: number; categories: { name: string; count: number }[] }[]

/** Sidebar: platform → category tree with counts, most viewed, most downloaded and today's updates. */
export async function softwareSidebar() {
  const since = new Date(Date.now() - 24 * 3600_000)
  const [facets, viewed, downloaded, today, total] = await allOrEmpty([
    db.softwareTitle.findMany({ where: live(), select: { platforms: true, category: true }, take: 5000 }),
    db.softwareTitle.findMany({ where: live(), orderBy: [{ views: 'desc' }], take: 8 }),
    db.softwareTitle.findMany({ where: live(), orderBy: [{ downloads: 'desc' }], take: 8 }),
    db.softwareTitle.findMany({ where: { ...live(), updatedAt: { gt: since } }, orderBy: [{ updatedAt: 'desc' }], take: 8 }),
    db.softwareTitle.count({ where: live() }),
  ])
  const tree = new Map<string, { count: number; categories: Map<string, number> }>()
  for (const row of facets as { platforms: string; category: string }[]) {
    for (const platform of splitList(row.platforms, 8)) {
      const node = tree.get(platform) || { count: 0, categories: new Map<string, number>() }
      node.count++
      if (row.category) node.categories.set(row.category, (node.categories.get(row.category) || 0) + 1)
      tree.set(platform, node)
    }
  }
  const order = ['Windows', 'macOS', 'Linux', 'Android', 'iOS']
  const platforms: SoftwareTree = [...tree.entries()]
    .sort((a, b) => (order.indexOf(a[0]) + 1 || 99) - (order.indexOf(b[0]) + 1 || 99) || b[1].count - a[1].count)
    .map(([platform, node]) => ({ platform, count: node.count, categories: [...node.categories.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })) }))
  const versions = await currentSoftwareVersions([...viewed, ...downloaded, ...today].map((row) => row.id))
  return { tree: platforms, viewed: viewed.map((row) => toSoftware(row, versions)), downloaded: downloaded.map((row) => toSoftware(row, versions)), today: today.map((row) => toSoftware(row, versions)), total: Number(total) || 0 }
}

export async function getSoftwareHome() {
  const [featured, latest, popular, facetRows] = await allOrEmpty([
    db.softwareTitle.findMany({ where: { ...live(), featured: true }, orderBy: { publishedAt: 'desc' }, take: 6 }),
    db.softwareTitle.findMany({ where: live(), orderBy: [{ updatedAt: 'desc' }], take: 18 }),
    db.softwareTitle.findMany({ where: live(), orderBy: [{ downloads: 'desc' }, { publishedAt: 'desc' }], take: 10 }),
    db.softwareTitle.findMany({ where: live(), select: { platforms: true, category: true }, take: 1000 }),
  ])
  const versions = await currentSoftwareVersions([...featured, ...latest, ...popular].map((row) => row.id))
  return {
    featured: featured.map((row) => toSoftware(row, versions)), latest: latest.map((row) => toSoftware(row, versions)), popular: popular.map((row) => toSoftware(row, versions)),
    platforms: countList(facetRows.map((row: { platforms: string }) => row.platforms)).slice(0, 8),
    categories: countList(facetRows.map((row: { category: string }) => row.category)).slice(0, 16),
  }
}

export async function browseSoftware(input: { platform?: string; category?: string; license?: string; sort?: string; q?: string; page?: number }) {
  const page = Math.max(1, Math.min(500, Number(input.page) || 1))
  const where: any = { ...live() }
  if (input.platform) where.platforms = { contains: String(input.platform).slice(0, 40) }
  if (input.category) where.category = String(input.category).slice(0, 60)
  if (input.license) where.license = String(input.license).slice(0, 20)
  const q = String(input.q || '').trim().slice(0, 80)
  if (q) where.OR = [{ title: { contains: q } }, { titleEn: { contains: q } }, { developer: { contains: q } }, { category: { contains: q } }]
  const orderBy = input.sort === 'popular' ? [{ downloads: 'desc' as const }] : input.sort === 'name' ? [{ title: 'asc' as const }] : [{ updatedAt: 'desc' as const }]
  const [rows, total] = await Promise.all([
    db.softwareTitle.findMany({ where, orderBy, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    db.softwareTitle.count({ where }),
  ]).catch(() => [[], 0] as [any[], number])
  const versions = await currentSoftwareVersions(rows.map((row) => row.id))
  return { items: rows.map((row) => toSoftware(row, versions)), total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) }
}

/** Header strip of the software portal: catalogue size, traffic, freshness and community. */
export async function softwareStats() {
  const [count, sums, last, reviews] = await allOrEmpty([
    db.softwareTitle.count({ where: live() }),
    db.softwareTitle.aggregate({ where: live(), _sum: { views: true, downloads: true } }),
    db.softwareTitle.findFirst({ where: live(), orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } }),
    db.itemReview.count({ where: { itemType: 'software', status: 'APPROVED' } }),
  ])
  const sum = (sums as { _sum?: { views: number | null; downloads: number | null } } | null)?._sum
  return {
    count: Number(count) || 0,
    traffic: (sum?.views || 0) + (sum?.downloads || 0),
    downloads: sum?.downloads || 0,
    updatedAt: (last as { updatedAt: Date } | null)?.updatedAt || null,
    reviews: Number(reviews) || 0,
  }
}

/** Editor picks for the “suggested” sidebar list (featured first, then most downloaded). */
export async function softwareSuggestions(take = 10, pickedIds: number[] = []) {
  if (pickedIds.length) {
    // Editor-picked list, in the admin's order; unpublished picks drop out.
    const picked = await db.softwareTitle.findMany({ where: { ...live(), id: { in: pickedIds.slice(0, take) } } }).catch(() => [])
    const byId = new Map(picked.map((row) => [row.id, row]))
    const ordered = pickedIds.map((id) => byId.get(id)).filter((row): row is NonNullable<typeof row> => !!row)
    if (ordered.length) { const versions = await currentSoftwareVersions(ordered.map((row) => row.id)); return ordered.map((row) => toSoftware(row, versions)) }
  }
  const rows = await db.softwareTitle.findMany({ where: live(), orderBy: [{ featured: 'desc' }, { downloads: 'desc' }], take }).catch(() => [])
  const versions = await currentSoftwareVersions(rows.map((row) => row.id))
  return rows.map((row) => toSoftware(row, versions))
}

/** Latest journal posts with a cover (the portal's “tech news” box). */
export async function techNews(take = 5) {
  return db.post.findMany({ where: { status: 'PUBLISHED', publishedAt: { lte: new Date() }, cover: { not: '' } }, orderBy: { publishedAt: 'desc' }, take, select: { slug: true, title: true, excerpt: true, cover: true, publishedAt: true, category: { select: { name: true } } } }).catch(() => [])
}

/** Newest software filed under the given ids (one home-page shelf per main category). */
export async function softwareShelf(ids: number[] | null, take = 8) {
  const rows = await db.softwareTitle.findMany({ where: { ...live(), ...(ids ? { id: { in: ids.slice(0, 5000) } } : {}) }, orderBy: { updatedAt: 'desc' }, take }).catch(() => [])
  const versions = await currentSoftwareVersions(rows.map((row) => row.id))
  return rows.map((row) => toSoftware(row, versions))
}

export async function getSoftware(slug: string) {
  const now = new Date()
  const row = await db.softwareTitle.findFirst({ where: { slug, ...live() } }).catch(() => null)
  if (!row) return null
  await db.softwareTitle.update({ where: { id: row.id }, data: { views: { increment: 1 } } }).catch(() => undefined)
  const [links, recommendations, releases] = await Promise.all([
    publicLinks('software', [row.id]),
    relatedSoftware(row),
    db.softwareRelease.findMany({ where: { softwareId: row.id, status: 'PUBLISHED', releasedAt: { lte: now } }, include: { targets: { orderBy: { id: 'asc' } } }, orderBy: [{ releasedAt: 'desc' }, { id: 'desc' }], take: 30 }).catch(() => []),
  ])
  const related = recommendations.length ? await db.softwareTitle.findMany({ where: { ...live(), id: { in: recommendations.map((result) => result.item.id) } } }) : []
  const versions = await currentSoftwareVersions([row.id, ...related.map((item) => item.id)], now)
  const relatedById = new Map(related.map((item) => [item.id, item]))
  const projected = projectSoftwareVersion(row, versions)
  const releaseLinks = await publicLinks('softwarerelease', releases.map((release) => release.id))
  return {
    software: {
      ...toSoftware(row, versions), publisher: row.publisher, developerStudioId: row.developerStudioId, publisherStudioId: row.publisherStudioId, website: row.website, requirements: row.requirements, content: row.content,
      changelog: projected.changelog, views: row.views,
      releasedAt: projected.releasedAt, updatedAt: projected.updatedAt,
      features: row.features || '', installGuide: row.installGuide || '', archivePassword: row.archivePassword || '',
      screenshots: parseJsonList<{ src: string }>(row.screenshots).map((shot) => shot.src).filter(Boolean),
    },
    links: links.get(row.id) || [],
    releases: releases.map((release) => ({ id: release.id, version: release.version, channel: release.channel, changelog: release.changelog, size: release.size, checksum: release.checksum, requirements: release.requirements, screenshots: parseJsonList<{ src: string }>(release.screenshots).map((shot) => shot.src).filter(Boolean), targets: release.targets, releasedAt: release.releasedAt, links: releaseLinks.get(release.id) || [] })),
    related: recommendations.flatMap((result) => { const item = relatedById.get(result.item.id); return item ? [{ ...toSoftware(item, versions), recommendationReason: result.reason }] : [] }),
  }
}
