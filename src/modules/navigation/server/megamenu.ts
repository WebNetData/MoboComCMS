import { db } from '@/platform/database/prisma'
import type { Prisma } from '@prisma/client'
import { createHash } from 'node:crypto'
import { readJsonSetting, updateJsonSetting } from '@/modules/settings/server'
import { localizeMenu } from '@/modules/site/config/menus'
import { getPublicExtensionRuntime } from '@/extensions/server/state'
import { siteLinkDisabled } from '@/modules/site/config/visibility'
import { visibleCategories } from '@/modules/forum/server/forum'
import { viewerFor } from '@/modules/forum/server/community'
import { isPublicApiEnabled } from '@/modules/public-api/server/availability'
import { menuNodes } from '@/modules/navigation/domain/presentation'
import { additionalSectionSources } from './section-sources'
import { isModuleEnabled } from '@/extensions/server/modules'
import { isStoreEnabled } from '@/modules/catalog/server/storefront'
import { publicProductWhere } from '@/modules/catalog/domain/product-publication'
import { listTerms } from '@/modules/taxonomy/server/taxonomy'
import { descendants, termPath, type Taxonomy } from '@/modules/taxonomy/domain/taxonomy'
import {
  MEGA_SECTIONS, SECTION_LABEL, SECTION_ROOT, defaultMegaConfig, facetCounts, normalizeMegaConfig, subtreeColumns,
  type MegaFeature, type MegaLink, type MegaMenuConfig, type MegaSection, type SectionBar, type SectionBarItem, type SectionMenuConfig,
  arrangeItems, MegaMenuError,
} from '@/modules/navigation/domain/megamenu'

/**
 * Each broad section has its own menu bar (under the site header, inside the
 * section) whose top-level entries are the section's main categories; every
 * entry opens a mega panel of that category's sub-categories and featured items.
 */

const SETTINGS_KEY = 'site.megamenu.v1'
const CACHE_MS = 60_000

const live = () => ({ status: 'PUBLISHED', publishedAt: { lte: new Date() }, audienceGroups: '' })
const q = (params: Record<string, string>) => `?${new URLSearchParams(params)}`
/** One failing source must never take the page down. */
const safe = async <T,>(work: Promise<T>, fallback: T): Promise<T> => work.catch(() => fallback)

type Node = { id: number; parentId: number | null; label: string; href: string; count?: number; slug: string; icon?: string; inMenu?: boolean }
type Built = { nodes?: Node[]; items: SectionBarItem[]; quick: MegaLink[]; searchCategories: { value: string; label: string }[] }

/** Top-level entries from a category forest (root → dropdown of its sub-tree). */
function itemsFromTree(nodes: Node[], cfg: SectionMenuConfig, features: (root: Node) => Promise<MegaFeature[]>): Promise<SectionBarItem[]> {
  nodes = menuNodes(nodes, cfg)
  const ids = new Set(nodes.map(node => node.id))
  const roots = nodes.filter((node) => node.parentId === null || !ids.has(node.parentId))
  return Promise.all(roots.map(async (root, index) => ({
    key: `c${root.id}`, label: root.label, href: root.href, icon: root.icon,
    columns: subtreeColumns(nodes, root.id, { columns: cfg.columns, perColumn: cfg.linksPerColumn, looseTitle: `دسته‌های ${root.label}` }),
    // Keep the previous twelve-root teaser query budget while making every
    // category reachable through the bar/More panel.
    features: cfg.features && index < 12 ? (await features(root)).filter((feature) => feature.image).slice(0, cfg.features) : [],
  })))
}

async function taxonomyNodes(taxonomy: Taxonomy): Promise<{ nodes: Node[]; all: Awaited<ReturnType<typeof listTerms>> }> {
  const all = await safe(listTerms(taxonomy), [])
  const nodes = all.map((term) => ({ id: term.id, parentId: term.parentId, label: term.name, href: termPath(taxonomy, all, term.id), count: term.count, slug: term.slug, icon: term.icon, inMenu: term.inMenu }))
  return { nodes, all }
}

/** Owner ids under a term (for the “featured in this category” strip). */
async function ownersUnder(taxonomy: Taxonomy, all: { id: number; parentId: number | null }[], rootId: number) {
  const rows = await safe(db.taxonomyAssignment.findMany({ where: { taxonomy, termId: { in: descendants(all, rootId) } }, select: { ownerId: true }, take: 2000 }), [])
  return [...new Set(rows.map((row) => row.ownerId))]
}

const SOURCES: Record<MegaSection, (cfg: SectionMenuConfig) => Promise<Built>> = {
  ...additionalSectionSources,
  async software(cfg) {
    const { nodes, all } = await taxonomyNodes('software')
    const quick = [{ label: 'به‌روزشده‌ها', href: '/software/browse' }, { label: 'پردانلودها', href: '/software/browse?sort=popular' }, { label: 'رایگان‌ها', href: '/software/browse?license=FREE' }]
    if (nodes.length) {
      const items = await itemsFromTree(nodes, cfg, async (root) => {
        const ids = await ownersUnder('software', all, root.id)
        const rows = await safe(db.softwareTitle.findMany({ where: { ...live(), id: { in: ids } }, orderBy: [{ featured: 'desc' }, { downloads: 'desc' }], take: cfg.features, select: { title: true, slug: true, icon: true, cover: true, version: true } }), [])
        return rows.map((s) => ({ title: s.title, href: `/software/${s.slug}`, image: s.icon || s.cover, kicker: s.version ? `نسخهٔ ${s.version}` : root.label }))
      })
      return { nodes, items, quick, searchCategories: menuNodes(nodes, cfg).filter((n) => n.parentId === null).map((n) => ({ value: n.slug, label: n.label })) }
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
    return { nodes, items: [...items, ...(platformItem.columns.length ? [platformItem] : [])], quick: [{ label: 'تازه‌ترین‌ها', href: '/games/browse' }, { label: 'تقویم انتشار', href: '/games/calendar' }, { label: 'برترین‌ها', href: '/games/top' }, { label: 'مجموعه‌ها', href: '/games/franchises' }], searchCategories: nodes.filter((n) => n.parentId === null).map((n) => ({ value: n.slug, label: n.label })) }
  },

  async music(cfg) {
    const [{ nodes }, languages] = await Promise.all([taxonomyNodes('music'), taxonomyNodes('music-language')])
    const items = nodes.length ? await itemsFromTree(nodes, cfg, async () => []) : []
    // Music is filed a second way, by the language or dialect of a song: one entry that opens the list of them.
    const languageLinks = menuNodes(languages.nodes, cfg).filter((node) => node.parentId === null).slice(0, Math.max(6, cfg.linksPerColumn * 2)).map((node) => ({ label: node.label, href: node.href, count: node.count, icon: node.icon }))
    if (languageLinks.length) items.push({ key: 'languages', label: 'زبان و گویش', href: '/music/language', features: [], columns: [{ title: 'آهنگ‌ها به زبان', href: '/music/language', links: languageLinks }] })
    return { nodes: [...nodes, ...languages.nodes], items, quick: [{ label: 'تازه‌ترین آهنگ‌ها', href: '/music/browse' }, { label: 'پربازدیدها', href: '/music/browse?sort=popular' }, { label: 'آلبوم‌ها', href: '/music/albums' }, { label: 'هنرمندان', href: '/music/artists' }, { label: 'پلی‌لیست‌ها', href: '/music/playlists' }, { label: 'پلی‌لیست‌های من', href: '/music/my-playlists' }, { label: 'آهنگ‌های دلخواه', href: '/favorites?type=track' }], searchCategories: [] }
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
    // The advanced search (genre, country, year, actor, director) is reached from every cinema page.
    return { nodes, items, quick: [{ label: 'جست‌وجوی پیشرفته', href: '/cinema/browse' }, { label: 'دوبله فارسی', href: '/cinema/browse?dubbed=1' }, { label: 'برترین‌های IMDb', href: '/cinema/browse?sort=imdb' }, { label: 'تقویم پخش', href: '/cinema/calendar' }], searchCategories: [] }
  },

  async forum(cfg) {
    const categories = await visibleCategories(await viewerFor(null))
    const nodes = categories.map((c) => ({ id: c.id, parentId: c.parentId, label: c.title, href: `/forum/c/${c.slug}`, count: c.threadCount, slug: c.slug, icon: c.icon }))
    return { nodes, items: await itemsFromTree(nodes, cfg, async () => []), quick: [{ label: 'تازه‌ترین‌ها', href: '/forum/latest' }, { label: 'برترین‌ها', href: '/forum/top' }, { label: 'بی‌پاسخ‌ها', href: '/forum/unanswered' }, { label: 'موضوع جدید', href: '/forum/new' }], searchCategories: [] }
  },

  async shop(cfg) {
    const categories = await safe(db.productCategory.findMany({ select: { id: true, parentId: true, name: true, slug: true, icon: true, _count: { select: { products: { where: publicProductWhere } } } }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }), [])
    const nodes = categories.map((c) => ({ id: c.id, parentId: c.parentId, label: c.name, href: `/products${q({ category: c.slug })}`, count: c._count.products, slug: c.slug, icon: c.icon }))
    const items = await itemsFromTree(nodes, cfg, async (root) => {
      const ids = descendants(categories, root.id)
      const rows = await safe(db.product.findMany({ where: { ...publicProductWhere, categoryId: { in: ids }, image: { not: '' } }, orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }], take: cfg.features, select: { name: true, slug: true, image: true } }), [])
      return rows.map((p) => ({ title: p.name, href: `/products/${p.slug}`, image: p.image, kicker: root.label }))
    })
    return {
      nodes, items,
      quick: [{ label: 'شگفت‌انگیزها', href: '/products?discounted=1&sort=discount' }, { label: 'پرفروش‌ترین‌ها', href: '/products?sort=bestselling' }, { label: 'مقایسهٔ کالا', href: '/compare' }],
      searchCategories: categories.filter((c) => !c.parentId).map((c) => ({ value: c.slug, label: c.name })),
    }
  },

  async blog(cfg) {
    const categories = await safe(db.postCategory.findMany({ select: { id: true, parentId: true, name: true, slug: true } }), [])
    const nodes = categories.map((c) => ({ id: c.id, parentId: c.parentId, label: c.name, href: `/blog${q({ category: c.slug })}`, slug: c.slug }))
    return { nodes, items: await itemsFromTree(nodes, cfg, async () => []), quick: [{ label: 'تازه‌ترین مطالب', href: '/blog' }], searchCategories: [] }
  },
}

const ENABLED: Record<MegaSection, () => Promise<boolean>> = {
  home: async () => true,
  prompts: () => isModuleEnabled('prompt-master'),
  celebrities: async () => (await isModuleEnabled('music')) || (await isModuleEnabled('cinema')),
  businesses: () => isModuleEnabled('businesses'),
  shop: () => isStoreEnabled().catch(() => false),
  blog: () => isModuleEnabled('journal'),
  music: () => isModuleEnabled('music'),
  cinema: () => isModuleEnabled('cinema'),
  games: () => isModuleEnabled('games'),
  software: () => isModuleEnabled('software'),
  forum: () => isModuleEnabled('forum'),
}

const SEARCH: Partial<Record<MegaSection, { action: string; placeholder: string; param: string }>> = {
  prompts: { action: '/prompts/library', placeholder: 'جست‌وجو در الگوهای پرامپت…', param: 'q' },
  celebrities: { action: '/celebrities', placeholder: 'جست‌وجوی هنرمند…', param: 'q' },
  businesses: { action: '/businesses', placeholder: 'جست‌وجوی نام یا دامنهٔ کسب‌وکار…', param: 'q' },
  software: { action: '/software/browse', placeholder: 'نام نرم‌افزار را بنویسید…', param: 'term' },
  games: { action: '/games/browse', placeholder: 'جست‌وجوی بازی…', param: 'term' },
  music: { action: '/music/browse', placeholder: 'جست‌وجوی آهنگ یا هنرمند…', param: 'term' },
  cinema: { action: '/cinema/browse', placeholder: 'جست‌وجوی فیلم و سریال…', param: 'term' },
  blog: { action: '/blog', placeholder: 'جست‌وجو در مجله…', param: 'category' },
  shop: { action: '/products', placeholder: 'جست‌وجو در فروشگاه…', param: 'category' },
}

export async function getMegaConfig(fresh = false): Promise<MegaMenuConfig> {
  const stored = await readJsonSetting(SETTINGS_KEY, fresh ? db : undefined).catch(() => undefined)
  return stored ? normalizeMegaConfig(stored, defaultMegaConfig()) : defaultMegaConfig()
}

const cache = new Map<MegaSection, { at: number; revision: string; bar: SectionBar | null }>()
/** Drop cached bars (after menu settings or category changes). */
export function invalidateSectionBars() { cache.clear() }

export const megaConfigRevision = (config: MegaMenuConfig) => createHash('sha256').update(JSON.stringify(config)).digest('hex')
export async function saveMegaConfig(input: unknown, options: { revision?: string; beforeCommit?: (tx: Prisma.TransactionClient, config: MegaMenuConfig, previous: MegaMenuConfig) => Promise<void> } = {}): Promise<MegaMenuConfig> {
  const next = await updateJsonSetting(SETTINGS_KEY, async (stored, tx) => {
    const current = normalizeMegaConfig(stored)
    if (options.revision !== undefined && options.revision !== megaConfigRevision(current)) throw new MegaMenuError('تنظیمات توسط مدیر دیگری تغییر کرده؛ صفحه را تازه‌سازی کنید', 409)
    const next = normalizeMegaConfig(input, current)
    Object.keys(stored).forEach(key => delete stored[key])
    Object.assign(stored, next)
    await options.beforeCommit?.(tx, next, current)
    return next
  })
  invalidateSectionBars()
  return next
}

/** Builds one section's bar with the given settings (also used by the admin preview). */
export async function buildSectionBar(section: MegaSection, cfg: SectionMenuConfig): Promise<SectionBar> {
  const built = await SOURCES[section](cfg).catch((): Built => ({ items: [], quick: [], searchCategories: [] }))
  const [runtime, storeOn, apiOn] = await Promise.all([getPublicExtensionRuntime(), isStoreEnabled(), isPublicApiEnabled()])
  const allowed = (href: string) => !siteLinkDisabled(href, runtime) && (storeOn || !/^\/products(?:[/?#]|$)/.test(href)) && (apiOn || !href.startsWith('/dashboard/api'))
  const custom = localizeMenu(cfg.customItems || [], 'fa')
  let nextId = 0
  const customNodes: Node[] = []
  const visit = (items: typeof custom, parentId: number | null) => { for (const item of items) { if (!allowed(item.href)) continue; const id = ++nextId; customNodes.push({ ...item, id, parentId, slug: '' }); visit(item.children || [], id) } }
  visit(custom, null)
  const customRoots = custom.filter(item => allowed(item.href))
  const customItems = (await itemsFromTree(customNodes, { ...cfg, hiddenItems: [], nodeOverrides: {}, itemOrder: [], features: 0 }, async () => [])).map((item, index) => {
    const id = customRoots[index]?.id || String(index)
    return { ...item, key: `custom-${id.length > 73 ? createHash('sha256').update(id).digest('hex') : id}` }
  })
  const allItems = [...built.items, ...customItems].map(item => ({ ...item, ...cfg.nodeOverrides?.[item.key] })).filter(item => allowed(item.href))
  const items = allItems.filter(item => !cfg.nodeOverrides?.[item.key]?.hidden)
  const quick = [...cfg.links, ...(cfg.hideAutoLinks ? [] : built.quick.map((link, index) => ({ ...link, ...cfg.nodeOverrides?.[`quick-${index}`] })))].filter(link => link.enabled !== false && !('hidden' in link && link.hidden) && allowed(link.href))
  const search = SEARCH[section]
  return {
    section, title: SECTION_LABEL[section], home: SECTION_ROOT[section],
    showHome: cfg.showHome, homeIcon: cfg.homeIcon ?? undefined, homeLabel: cfg.homeLabel,
    items: arrangeItems(items, cfg),
    quick: cfg.showQuick === false ? [] : quick,
    maxItems: cfg.maxItems || 0,
    catalog: arrangeItems([...allItems, ...(built.nodes || []).filter(node => node.parentId === null || !(built.nodes || []).some(parent => parent.id === node.parentId)).filter(node => !allItems.some(item => item.key === `c${node.id}`)).map(node => ({ key: `c${node.id}`, label: node.label }))], { ...cfg, hiddenItems: [] }).map((item) => ({ key: item.key, label: item.label, hidden: cfg.hiddenItems.includes(item.key) || cfg.nodeOverrides?.[item.key]?.hidden === true })),
    categoryCatalog: (built.nodes || []).map(node => ({ key: `c${node.id}`, parentKey: node.parentId === null ? null : `c${node.parentId}`, label: node.label, href: node.href, icon: node.icon, inMenu: node.inMenu !== false })),
    quickCatalog: built.quick.map((link, index) => ({ ...link, key: `quick-${index}` })),
    promo: cfg.promo.enabled ? { title: cfg.promo.title, text: cfg.promo.text, href: cfg.promo.href, image: cfg.promo.image, cta: cfg.promo.cta } : null,
    search: search && cfg.showSearch !== false ? { ...search, categories: built.searchCategories } : null,
  }
}

/** The menu bar shown inside a section, or null when the section or its bar is off. Cached briefly. */
export async function getSectionBar(section: MegaSection): Promise<SectionBar | null> {
  // Rendering and route handlers may hold different module instances. Read the
  // setting revision so a saved edit cannot be hidden by another instance's tree.
  const [config, runtime, storeOn, apiOn] = await Promise.all([getMegaConfig(true), getPublicExtensionRuntime(), isStoreEnabled(), isPublicApiEnabled()])
  // Availability can change independently of menu edits (including mirrored storefront flags).
  const revision = createHash('sha256').update(JSON.stringify([megaConfigRevision(config), Object.entries(runtime).map(([id, state]) => [id, state.enabled]), storeOn, apiOn])).digest('hex')
  const hit = cache.get(section)
  if (hit && hit.revision === revision && Date.now() - hit.at < CACHE_MS) return hit.bar
  const on = config.enabled && config.sections[section].enabled && await isModuleEnabled('mega-menu') && await ENABLED[section]().catch(() => false)
  const bar = on ? await buildSectionBar(section, config.sections[section]) : null
  cache.set(section, { at: Date.now(), revision, bar })
  return bar
}

/** Admin view: every section with its settings and a live preview. */
export async function megaMenuAdminState() {
  const config = await getMegaConfig(true)
  const sections = await Promise.all(MEGA_SECTIONS.map(async (section) => ({
    section,
    label: SECTION_LABEL[section],
    available: await ENABLED[section]().catch(() => false),
    preview: await buildSectionBar(section, { ...config.sections[section], enabled: true }),
  })))
  return { config, revision: megaConfigRevision(config), sections, moduleEnabled: await isModuleEnabled('mega-menu') }
}
export { navigationSettingsState, restoreNavigationSettings } from './history'
