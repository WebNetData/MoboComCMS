import { db } from '@/platform/database/prisma'
import { readJsonSetting, writeJsonSetting } from '@/modules/settings/server'
import { isModuleEnabled } from '@/extensions/server/modules'
import { isStoreEnabled } from '@/modules/catalog/server/storefront'
import { publicProductWhere } from '@/modules/catalog/domain/product-publication'
import { listTerms } from '@/modules/taxonomy/server/taxonomy'
import { descendants, termPath, type Taxonomy } from '@/modules/taxonomy/domain/taxonomy'
import {
  MEGA_SECTIONS, SECTION_LABEL, SECTION_ROOT, defaultMegaConfig, facetCounts, normalizeMegaConfig, subtreeColumns,
  type MegaFeature, type MegaLink, type MegaMenuConfig, type MegaSection, type SectionBar, type SectionBarItem, type SectionMenuConfig,
  arrangeItems,
} from '@/modules/navigation/domain/megamenu'

/**
 * Each broad section has its own menu bar (under the site header, inside the
 * section) whose top-level entries are the section's main categories; every
 * entry opens a mega panel of that category's sub-categories and featured items.
 */

const SETTINGS_KEY = 'site.megamenu.v1'
const CACHE_MS = 60_000

const live = () => ({ status: 'PUBLISHED', publishedAt: { lte: new Date() } })
const q = (params: Record<string, string>) => `?${new URLSearchParams(params)}`
/** One failing source must never take the page down. */
const safe = async <T,>(work: Promise<T>, fallback: T): Promise<T> => work.catch(() => fallback)

type Node = { id: number; parentId: number | null; label: string; href: string; count?: number; slug: string }
type Built = { items: SectionBarItem[]; quick: MegaLink[]; searchCategories: { value: string; label: string }[] }

/** Top-level entries from a category forest (root → dropdown of its sub-tree). */
function itemsFromTree(nodes: Node[], cfg: SectionMenuConfig, features: (root: Node) => Promise<MegaFeature[]>): Promise<SectionBarItem[]> {
  const roots = nodes.filter((node) => node.parentId === null || !nodes.some((other) => other.id === node.parentId))
  return Promise.all(roots.slice(0, 12).map(async (root) => ({
    key: `c${root.id}`, label: root.label, href: root.href,
    columns: subtreeColumns(nodes, root.id, { columns: cfg.columns, perColumn: cfg.linksPerColumn, looseTitle: `دسته‌های ${root.label}` }),
    features: cfg.features ? (await features(root)).filter((feature) => feature.image).slice(0, cfg.features) : [],
  })))
}

async function taxonomyNodes(taxonomy: Taxonomy): Promise<{ nodes: Node[]; all: Awaited<ReturnType<typeof listTerms>> }> {
  const all = await safe(listTerms(taxonomy), [])
  const nodes = all.filter((term) => term.inMenu).map((term) => ({ id: term.id, parentId: term.parentId, label: term.name, href: termPath(taxonomy, all, term.id), count: term.count, slug: term.slug }))
  return { nodes, all }
}

/** Owner ids under a term (for the “featured in this category” strip). */
async function ownersUnder(taxonomy: Taxonomy, all: { id: number; parentId: number | null }[], rootId: number) {
  const rows = await safe(db.taxonomyAssignment.findMany({ where: { taxonomy, termId: { in: descendants(all, rootId) } }, select: { ownerId: true }, take: 2000 }), [])
  return [...new Set(rows.map((row) => row.ownerId))]
}

const SOURCES: Record<MegaSection, (cfg: SectionMenuConfig) => Promise<Built>> = {
  async software(cfg) {
    const { nodes, all } = await taxonomyNodes('software')
    const quick = [{ label: 'به‌روزشده‌ها', href: '/software/browse' }, { label: 'پردانلودها', href: '/software/browse?sort=popular' }, { label: 'رایگان‌ها', href: '/software/browse?license=FREE' }]
    if (nodes.length) {
      const items = await itemsFromTree(nodes, cfg, async (root) => {
        const ids = await ownersUnder('software', all, root.id)
        const rows = await safe(db.softwareTitle.findMany({ where: { ...live(), id: { in: ids } }, orderBy: [{ featured: 'desc' }, { downloads: 'desc' }], take: cfg.features, select: { title: true, slug: true, icon: true, cover: true, version: true } }), [])
        return rows.map((s) => ({ title: s.title, href: `/software/${s.slug}`, image: s.icon || s.cover, kicker: s.version ? `نسخهٔ ${s.version}` : root.label }))
      })
      return { items, quick, searchCategories: nodes.filter((n) => n.parentId === null).map((n) => ({ value: n.slug, label: n.label })) }
    }
    // No categories yet: platform → category facets from the free-text fields.
    const rows = await safe(db.softwareTitle.findMany({ where: live(), select: { platforms: true, category: true }, take: 5000 }), [])
    const items = facetCounts(rows.map((r) => r.platforms), 8).map((platform): SectionBarItem => ({
      key: platform.name, label: platform.name, href: `/software/browse${q({ platform: platform.name })}`, features: [],
      columns: [{ title: `دسته‌های ${platform.name}`, links: facetCounts(rows.filter((r) => r.platforms.includes(platform.name)).map((r) => r.category), cfg.linksPerColumn).map((c) => ({ label: c.name, href: `/software/browse${q({ platform: platform.name, category: c.name })}`, count: c.count })) }].filter((c) => c.links.length),
    }))
    return { items, quick, searchCategories: [] }
  },

  async games(cfg) {
    const { nodes, all } = await taxonomyNodes('games')
    const rows = await safe(db.gameTitle.findMany({ where: live(), select: { platforms: true }, take: 5000 }), [])
    const platformItem: SectionBarItem = { key: 'platforms', label: 'پلتفرم‌ها', href: '/games/browse', features: [], columns: [{ title: 'بازی برای', links: facetCounts(rows.map((r) => r.platforms), cfg.linksPerColumn).map((p) => ({ label: p.name, href: `/games/browse${q({ platform: p.name })}`, count: p.count })) }].filter((c) => c.links.length) }
    const items = nodes.length ? await itemsFromTree(nodes, cfg, async (root) => {
      const ids = await ownersUnder('games', all, root.id)
      const games = await safe(db.gameTitle.findMany({ where: { ...live(), id: { in: ids }, cover: { not: '' } }, orderBy: [{ featured: 'desc' }, { publishedAt: 'desc' }], take: cfg.features, select: { title: true, slug: true, cover: true } }), [])
      return games.map((g) => ({ title: g.title, href: `/games/${g.slug}`, image: g.cover, kicker: root.label }))
    }) : []
    return { items: [...items, ...(platformItem.columns.length ? [platformItem] : [])], quick: [{ label: 'تازه‌ترین‌ها', href: '/games/browse' }, { label: 'تقویم انتشار', href: '/games/calendar' }, { label: 'برترین‌ها', href: '/games/top' }, { label: 'مجموعه‌ها', href: '/games/franchises' }], searchCategories: nodes.filter((n) => n.parentId === null).map((n) => ({ value: n.slug, label: n.label })) }
  },

  async music(cfg) {
    const [{ nodes }, languages] = await Promise.all([taxonomyNodes('music'), taxonomyNodes('music-language')])
    const items = nodes.length ? await itemsFromTree(nodes, cfg, async () => []) : []
    // Music is filed a second way, by the language or dialect of a song: one entry that opens the list of them.
    const languageLinks = languages.nodes.filter((node) => node.parentId === null).slice(0, Math.max(6, cfg.linksPerColumn * 2)).map((node) => ({ label: node.label, href: node.href, count: node.count }))
    if (languageLinks.length) items.push({ key: 'languages', label: 'زبان و گویش', href: '/music/language', features: [], columns: [{ title: 'آهنگ‌ها به زبان', href: '/music/language', links: languageLinks }] })
    return { items, quick: [{ label: 'تازه‌ترین آهنگ‌ها', href: '/music/browse' }, { label: 'پربازدیدها', href: '/music/browse?sort=popular' }, { label: 'آلبوم‌ها', href: '/music/albums' }, { label: 'هنرمندان', href: '/music/artists' }, { label: 'پلی‌لیست‌ها', href: '/music/playlists' }, { label: 'پلی‌لیست‌های من', href: '/music/my-playlists' }, { label: 'آهنگ‌های دلخواه', href: '/favorites?type=track' }], searchCategories: [] }
  },

  async cinema(cfg) {
    const { nodes, all } = await taxonomyNodes('cinema')
    const items = nodes.length ? await itemsFromTree(nodes, cfg, async (root) => {
      const ids = await ownersUnder('cinema', all, root.id)
      const titles = await safe(db.cinemaTitle.findMany({ where: { ...live(), id: { in: ids }, poster: { not: '' } }, orderBy: [{ featured: 'desc' }, { publishedAt: 'desc' }], take: cfg.features, select: { title: true, slug: true, poster: true } }), [])
      return titles.map((t) => ({ title: t.title, href: `/cinema/${t.slug}`, image: t.poster, kicker: root.label }))
    }) : [
      { key: 'movies', label: 'فیلم‌ها', href: '/cinema/browse?kind=MOVIE', columns: [], features: [] },
      { key: 'series', label: 'سریال‌ها', href: '/cinema/browse?kind=SERIES', columns: [], features: [] },
    ]
    return { items, quick: [{ label: 'دوبله فارسی', href: '/cinema/browse?dubbed=1' }, { label: 'برترین‌های IMDb', href: '/cinema/browse?sort=imdb' }, { label: 'تقویم پخش', href: '/cinema/calendar' }], searchCategories: [] }
  },

  async forum(cfg) {
    const categories = await safe(db.forumCategory.findMany({ select: { id: true, parentId: true, title: true, slug: true, threadCount: true }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }), [])
    const nodes = categories.map((c) => ({ id: c.id, parentId: c.parentId, label: c.title, href: `/forum/c/${c.slug}`, count: c.threadCount, slug: c.slug }))
    return { items: await itemsFromTree(nodes, cfg, async () => []), quick: [{ label: 'تازه‌ترین‌ها', href: '/forum/latest' }, { label: 'برترین‌ها', href: '/forum/top' }, { label: 'بی‌پاسخ‌ها', href: '/forum/unanswered' }, { label: 'موضوع جدید', href: '/forum/new' }], searchCategories: [] }
  },

  async shop(cfg) {
    const categories = await safe(db.productCategory.findMany({ select: { id: true, parentId: true, name: true, slug: true, _count: { select: { products: { where: publicProductWhere } } } }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }), [])
    const nodes = categories.map((c) => ({ id: c.id, parentId: c.parentId, label: c.name, href: `/products${q({ category: c.slug })}`, count: c._count.products, slug: c.slug }))
    const items = await itemsFromTree(nodes, cfg, async (root) => {
      const ids = descendants(categories, root.id)
      const rows = await safe(db.product.findMany({ where: { ...publicProductWhere, categoryId: { in: ids }, image: { not: '' } }, orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }], take: cfg.features, select: { name: true, slug: true, image: true } }), [])
      return rows.map((p) => ({ title: p.name, href: `/products/${p.slug}`, image: p.image, kicker: root.label }))
    })
    return {
      items,
      quick: [{ label: 'شگفت‌انگیزها', href: '/products?discounted=1&sort=discount' }, { label: 'پرفروش‌ترین‌ها', href: '/products?sort=bestselling' }, { label: 'مقایسهٔ کالا', href: '/compare' }],
      searchCategories: categories.filter((c) => !c.parentId).map((c) => ({ value: c.slug, label: c.name })),
    }
  },

  async blog(cfg) {
    const categories = await safe(db.postCategory.findMany({ select: { id: true, parentId: true, name: true, slug: true } }), [])
    const nodes = categories.map((c) => ({ id: c.id, parentId: c.parentId, label: c.name, href: `/blog${q({ category: c.slug })}`, slug: c.slug }))
    return { items: await itemsFromTree(nodes, cfg, async () => []), quick: [{ label: 'تازه‌ترین مطالب', href: '/blog' }], searchCategories: [] }
  },
}

const ENABLED: Record<MegaSection, () => Promise<boolean>> = {
  shop: () => isStoreEnabled().catch(() => false),
  blog: () => isModuleEnabled('journal'),
  music: () => isModuleEnabled('music'),
  cinema: () => isModuleEnabled('cinema'),
  games: () => isModuleEnabled('games'),
  software: () => isModuleEnabled('software'),
  forum: () => isModuleEnabled('forum'),
}

const SEARCH: Partial<Record<MegaSection, { action: string; placeholder: string; param: string }>> = {
  software: { action: '/software/browse', placeholder: 'نام نرم‌افزار را بنویسید…', param: 'term' },
  games: { action: '/games/browse', placeholder: 'جست‌وجوی بازی…', param: 'term' },
  music: { action: '/music/browse', placeholder: 'جست‌وجوی آهنگ یا هنرمند…', param: 'term' },
  cinema: { action: '/cinema/browse', placeholder: 'جست‌وجوی فیلم و سریال…', param: 'term' },
  blog: { action: '/blog', placeholder: 'جست‌وجو در مجله…', param: 'category' },
  shop: { action: '/products', placeholder: 'جست‌وجو در فروشگاه…', param: 'category' },
}

export async function getMegaConfig(): Promise<MegaMenuConfig> {
  const stored = await readJsonSetting(SETTINGS_KEY).catch(() => undefined)
  return stored ? normalizeMegaConfig(stored, defaultMegaConfig()) : defaultMegaConfig()
}

const cache = new Map<MegaSection, { at: number; bar: SectionBar | null }>()
/** Drop cached bars (after menu settings or category changes). */
export function invalidateSectionBars() { cache.clear() }

export async function saveMegaConfig(input: unknown): Promise<MegaMenuConfig> {
  const next = normalizeMegaConfig(input, await getMegaConfig())
  await writeJsonSetting(SETTINGS_KEY, next)
  invalidateSectionBars()
  return next
}

/** Builds one section's bar with the given settings (also used by the admin preview). */
export async function buildSectionBar(section: MegaSection, cfg: SectionMenuConfig): Promise<SectionBar> {
  const built = await SOURCES[section](cfg).catch((): Built => ({ items: [], quick: [], searchCategories: [] }))
  const search = SEARCH[section]
  return {
    section, title: SECTION_LABEL[section], home: SECTION_ROOT[section],
    items: arrangeItems(built.items, cfg),
    quick: cfg.showQuick === false ? [] : [...cfg.links, ...(cfg.hideAutoLinks ? [] : built.quick)].slice(0, 10),
    maxItems: cfg.maxItems || 0,
    catalog: arrangeItems(built.items, { ...cfg, hiddenItems: [] }).map((item) => ({ key: item.key, label: item.label, hidden: (cfg.hiddenItems || []).includes(item.key) })),
    promo: cfg.promo.enabled ? { title: cfg.promo.title, text: cfg.promo.text, href: cfg.promo.href, image: cfg.promo.image, cta: cfg.promo.cta } : null,
    search: search && cfg.showSearch !== false ? { ...search, categories: built.searchCategories } : null,
  }
}

/** The menu bar shown inside a section, or null when the section or its bar is off. Cached briefly. */
export async function getSectionBar(section: MegaSection): Promise<SectionBar | null> {
  const hit = cache.get(section)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.bar
  const config = await getMegaConfig()
  const on = config.enabled && config.sections[section].enabled && await isModuleEnabled('mega-menu') && await ENABLED[section]().catch(() => false)
  const bar = on ? await buildSectionBar(section, config.sections[section]) : null
  cache.set(section, { at: Date.now(), bar })
  return bar
}

/** Admin view: every section with its settings and a live preview. */
export async function megaMenuAdminState() {
  const config = await getMegaConfig()
  const sections = await Promise.all(MEGA_SECTIONS.map(async (section) => ({
    section,
    label: SECTION_LABEL[section],
    available: await ENABLED[section]().catch(() => false),
    preview: await buildSectionBar(section, { ...config.sections[section], enabled: true }),
  })))
  return { config, sections, moduleEnabled: await isModuleEnabled('mega-menu') }
}
