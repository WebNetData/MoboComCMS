import { db } from '@/platform/database/prisma'
import { readJsonSetting, writeJsonSetting } from '@/modules/settings/server'
import { isModuleEnabled } from '@/extensions/server/modules'
import { isStoreEnabled } from '@/modules/catalog/server/storefront'
import { listTerms } from '@/modules/taxonomy/server/taxonomy'
import { termPath, type Taxonomy } from '@/modules/taxonomy/domain/taxonomy'
import {
  MEGA_SECTIONS, SECTION_LABEL, defaultMegaConfig, facetCounts, normalizeMegaConfig, sectionForHref, treeColumns,
  type MegaColumn, type MegaFeature, type MegaLink, type MegaMenu, type MegaMenuConfig, type MegaSection, type SectionMenuConfig,
} from '@/modules/navigation/domain/megamenu'

const SETTINGS_KEY = 'site.megamenu.v1'
const CACHE_MS = 60_000

type Built = { columns: MegaColumn[]; quick: MegaLink[]; features: MegaFeature[] }
type Source = (cfg: SectionMenuConfig) => Promise<Built>

const live = () => ({ status: 'PUBLISHED', publishedAt: { lte: new Date() } })
const q = (params: Record<string, string>) => `?${new URLSearchParams(params)}`
/** One failing source must never take the site header down. */
const safe = async <T,>(work: Promise<T>, fallback: T): Promise<T> => work.catch(() => fallback)

/** Columns from the section's own category tree, or null when it has no categories yet. */
async function termColumns(taxonomy: Taxonomy, cfg: SectionMenuConfig, columns = cfg.columns): Promise<MegaColumn[] | null> {
  const terms = await safe(listTerms(taxonomy), [])
  const shown = terms.filter((term) => term.inMenu)
  if (!shown.length) return null
  return treeColumns(shown.map((term) => ({ id: term.id, parentId: term.parentId, label: term.name, href: termPath(taxonomy, terms, term.id), count: term.count })), { columns, perColumn: cfg.linksPerColumn, looseTitle: 'دسته‌بندی‌ها' })
}

/**
 * Data source per section. Each reads that section's own taxonomy, so the
 * panel grows with the catalogue without any menu editing.
 */
const SOURCES: Record<MegaSection, Source> = {
  async shop(cfg) {
    const [categories, featured] = await Promise.all([
      safe(db.productCategory.findMany({ select: { id: true, parentId: true, name: true, slug: true, _count: { select: { products: { where: { active: true } } } } }, orderBy: [{ name: 'asc' }] }), []),
      cfg.features ? safe(db.product.findMany({ where: { active: true, featured: true, image: { not: '' } }, orderBy: [{ sortOrder: 'asc' }, { id: 'desc' }], take: cfg.features, select: { name: true, slug: true, image: true, kind: true } }), []) : [],
    ])
    return {
      columns: treeColumns(categories.map((c) => ({ id: c.id, parentId: c.parentId, label: c.name, href: `/products${q({ category: c.slug })}`, count: c._count.products })), { columns: cfg.columns, perColumn: cfg.linksPerColumn, looseTitle: 'دسته‌بندی‌ها' }),
      quick: [{ label: 'همهٔ محصولات', href: '/products' }, { label: 'پیشنهادهای ویژه', href: '/products#featured' }, { label: 'مقایسهٔ کالا', href: '/compare' }],
      features: featured.map((p) => ({ title: p.name, href: `/products/${p.slug}`, image: p.image, kicker: p.kind === 'PHYSICAL' ? 'کالای فیزیکی' : 'محصول دیجیتال' })),
    }
  },

  async blog(cfg) {
    const [categories, featured] = await Promise.all([
      safe(db.postCategory.findMany({ select: { id: true, parentId: true, name: true, slug: true } }), []),
      cfg.features ? safe(db.post.findMany({ where: { status: 'PUBLISHED', cover: { not: '' }, publishedAt: { lte: new Date() } }, orderBy: [{ featured: 'desc' }, { publishedAt: 'desc' }], take: cfg.features, select: { title: true, slug: true, cover: true, category: { select: { name: true } } } }), []) : [],
    ])
    return {
      columns: treeColumns(categories.map((c) => ({ id: c.id, parentId: c.parentId, label: c.name, href: `/blog${q({ category: c.slug })}` })), { columns: cfg.columns, perColumn: cfg.linksPerColumn, looseTitle: 'موضوع‌ها' }),
      quick: [{ label: 'تازه‌ترین مطالب', href: '/blog' }, { label: 'خوراک RSS', href: '/feed.xml' }],
      features: featured.map((p) => ({ title: p.title, href: `/blog/${p.slug}`, image: p.cover, kicker: p.category?.name || 'مجله' })),
    }
  },

  async software(cfg) {
    const [rows, featured] = await Promise.all([
      safe(db.softwareTitle.findMany({ where: live(), select: { platforms: true, category: true }, take: 5000 }), []),
      cfg.features ? safe(db.softwareTitle.findMany({ where: { ...live(), featured: true }, orderBy: { publishedAt: 'desc' }, take: cfg.features, select: { title: true, slug: true, cover: true, icon: true, version: true } }), []) : [],
    ])
    const fromTerms = await termColumns('software', cfg)
    const order = ['Windows', 'macOS', 'Android', 'iOS', 'Linux']
    const platforms = facetCounts(rows.map((r) => r.platforms), 8).sort((a, b) => (order.indexOf(a.name) + 1 || 99) - (order.indexOf(b.name) + 1 || 99))
    const columns = platforms.slice(0, cfg.columns).map((platform): MegaColumn => ({
      title: platform.name, href: `/software/browse${q({ platform: platform.name })}`,
      links: facetCounts(rows.filter((r) => r.platforms.includes(platform.name)).map((r) => r.category), cfg.linksPerColumn)
        .map((category) => ({ label: category.name, href: `/software/browse${q({ platform: platform.name, category: category.name })}`, count: category.count })),
    }))
    return {
      columns: fromTerms || columns,
      quick: [{ label: 'به‌روزشده‌های امروز', href: '/software/browse' }, { label: 'پردانلودترین‌ها', href: '/software/browse?sort=popular' }, { label: 'نرم‌افزارهای رایگان', href: '/software/browse?license=FREE' }, { label: 'متن‌باز', href: '/software/browse?license=OPEN_SOURCE' }],
      features: featured.map((s) => ({ title: s.title, href: `/software/${s.slug}`, image: s.cover || s.icon, kicker: s.version ? `نسخهٔ ${s.version}` : 'نرم‌افزار ویژه' })),
    }
  },

  async games(cfg) {
    const [rows, featured] = await Promise.all([
      safe(db.gameTitle.findMany({ where: live(), select: { platforms: true, genres: true }, take: 5000 }), []),
      cfg.features ? safe(db.gameTitle.findMany({ where: { ...live(), featured: true, cover: { not: '' } }, orderBy: { publishedAt: 'desc' }, take: cfg.features, select: { title: true, slug: true, cover: true, genres: true } }), []) : [],
    ])
    const columns: MegaColumn[] = [
      { title: 'پلتفرم', links: facetCounts(rows.map((r) => r.platforms), cfg.linksPerColumn).map((p) => ({ label: p.name, href: `/games/browse${q({ platform: p.name })}`, count: p.count })) },
      { title: 'سبک بازی', links: facetCounts(rows.map((r) => r.genres), cfg.linksPerColumn * 2).map((g) => ({ label: g.name, href: `/games/browse${q({ genre: g.name })}`, count: g.count })) },
    ]
    // Long genre lists continue in a second column instead of one tall list.
    const genres = columns[1].links
    if (genres.length > cfg.linksPerColumn) columns.splice(1, 1, { title: 'سبک بازی', links: genres.slice(0, cfg.linksPerColumn) }, { title: 'سبک‌های بیشتر', links: genres.slice(cfg.linksPerColumn) })
    const fromTerms = await termColumns('games', cfg, Math.max(1, cfg.columns - 1))
    return {
      columns: fromTerms ? [...fromTerms, columns[0]].filter((c) => c.links.length).slice(0, cfg.columns) : columns.filter((c) => c.links.length).slice(0, cfg.columns),
      quick: [{ label: 'تازه‌ترین بازی‌ها', href: '/games/browse' }, { label: 'برترین نمره‌ها', href: '/games/browse?sort=score' }],
      features: featured.map((g) => ({ title: g.title, href: `/games/${g.slug}`, image: g.cover, kicker: g.genres.split(/[,،]/)[0]?.trim() || 'بازی ویژه' })),
    }
  },

  async music(cfg) {
    const [albums, tracks, featured] = await Promise.all([
      safe(db.musicAlbum.findMany({ where: live(), select: { genre: true }, take: 5000 }), []),
      safe(db.musicTrack.findMany({ where: live(), select: { genre: true }, take: 5000 }), []),
      cfg.features ? safe(db.musicAlbum.findMany({ where: { ...live(), cover: { not: '' } }, orderBy: [{ featured: 'desc' }, { publishedAt: 'desc' }], take: cfg.features, select: { title: true, slug: true, cover: true } }), []) : [],
    ])
    const genres = facetCounts([...albums, ...tracks].map((r) => r.genre), cfg.linksPerColumn * 2)
    const columns: MegaColumn[] = [
      { title: 'سبک موسیقی', links: genres.slice(0, cfg.linksPerColumn).map((g) => ({ label: g.name, href: `/music/browse${q({ genre: g.name })}`, count: g.count })) },
      { title: 'مرور', links: [{ label: 'آلبوم‌ها', href: '/music#albums' }, { label: 'هنرمندان', href: '/music#artists' }, { label: 'پلی‌لیست‌ها', href: '/music#playlists' }] },
    ]
    if (genres.length > cfg.linksPerColumn) columns.splice(1, 0, { title: 'سبک‌های بیشتر', links: genres.slice(cfg.linksPerColumn).map((g) => ({ label: g.name, href: `/music/browse${q({ genre: g.name })}`, count: g.count })) })
    const fromTerms = await termColumns('music', cfg, Math.max(1, cfg.columns - 1))
    return {
      columns: (fromTerms ? [...fromTerms, columns[columns.length - 1]] : columns).filter((c) => c.links.length).slice(0, cfg.columns),
      quick: [{ label: 'تازه‌ترین آهنگ‌ها', href: '/music/browse' }, { label: 'پربازدیدترین‌ها', href: '/music/browse?sort=popular' }],
      features: featured.map((a) => ({ title: a.title, href: `/music/album/${a.slug}`, image: a.cover, kicker: 'آلبوم' })),
    }
  },

  async cinema(cfg) {
    const [rows, featured] = await Promise.all([
      safe(db.cinemaTitle.findMany({ where: live(), select: { kind: true, genres: true }, take: 5000 }), []),
      cfg.features ? safe(db.cinemaTitle.findMany({ where: { ...live(), poster: { not: '' } }, orderBy: [{ featured: 'desc' }, { publishedAt: 'desc' }], take: cfg.features, select: { title: true, slug: true, poster: true, kind: true } }), []) : [],
    ])
    const genreColumn = (kind: 'MOVIE' | 'SERIES', title: string): MegaColumn => ({
      title, href: `/cinema/browse${q({ kind })}`,
      links: facetCounts(rows.filter((r) => r.kind === kind).map((r) => r.genres), cfg.linksPerColumn).map((g) => ({ label: g.name, href: `/cinema/browse${q({ kind, genre: g.name })}`, count: g.count })),
    })
    const fromTerms = await termColumns('cinema', cfg)
    if (fromTerms) return {
      columns: fromTerms,
      quick: [{ label: 'دوبله فارسی', href: '/cinema/browse?dubbed=1' }, { label: 'برترین‌های IMDb', href: '/cinema/browse?sort=imdb' }],
      features: featured.map((t) => ({ title: t.title, href: `/cinema/${t.slug}`, image: t.poster, kicker: t.kind === 'SERIES' ? 'سریال' : 'فیلم' })),
    }
    return {
      columns: [genreColumn('MOVIE', 'فیلم'), genreColumn('SERIES', 'سریال'), { title: 'ویژه', links: [{ label: 'دوبله فارسی', href: '/cinema/browse?dubbed=1' }, { label: 'برترین‌های IMDb', href: '/cinema/browse?sort=imdb' }] }].filter((c) => c.links.length).slice(0, cfg.columns),
      quick: [{ label: 'تازه‌ترین فیلم‌ها', href: '/cinema/browse?kind=MOVIE' }, { label: 'تازه‌ترین سریال‌ها', href: '/cinema/browse?kind=SERIES' }],
      features: featured.map((t) => ({ title: t.title, href: `/cinema/${t.slug}`, image: t.poster, kicker: t.kind === 'SERIES' ? 'سریال' : 'فیلم' })),
    }
  },

  async forum(cfg) {
    const [categories, hot] = await Promise.all([
      safe(db.forumCategory.findMany({ select: { id: true, parentId: true, title: true, slug: true, threadCount: true }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }), []),
      safe(db.forumThread.findMany({ where: { status: 'VISIBLE', category: { access: 'PUBLIC' } }, orderBy: [{ lastPostAt: 'desc' }], take: 5, select: { id: true, title: true } }), []),
    ])
    const columns = treeColumns(categories.map((c) => ({ id: c.id, parentId: c.parentId, label: c.title, href: `/forum/c/${c.slug}`, count: c.threadCount })), { columns: Math.max(1, cfg.columns - (hot.length ? 1 : 0)), perColumn: cfg.linksPerColumn, looseTitle: 'انجمن‌ها' })
    if (hot.length) columns.push({ title: 'گفت‌وگوهای فعال', links: hot.map((t) => ({ label: t.title, href: `/forum/t/${t.id}` })) })
    return {
      columns,
      quick: [{ label: 'موضوع جدید', href: '/forum/new' }, { label: 'برترین موضوع‌ها', href: '/forum/top' }, { label: 'بی‌پاسخ‌ها', href: '/forum/unanswered' }, { label: 'همهٔ دسته‌ها', href: '/forum/categories' }],
      features: [],
    }
  },
}

const ENABLED: Record<MegaSection, () => Promise<boolean>> = {
  shop: () => isStoreEnabled().catch(() => false),
  blog: async () => true,
  music: () => isModuleEnabled('music'),
  cinema: () => isModuleEnabled('cinema'),
  games: () => isModuleEnabled('games'),
  software: () => isModuleEnabled('software'),
  forum: () => isModuleEnabled('forum'),
}

export async function getMegaConfig(): Promise<MegaMenuConfig> {
  const stored = await readJsonSetting(SETTINGS_KEY).catch(() => undefined)
  return stored ? normalizeMegaConfig(stored, defaultMegaConfig()) : defaultMegaConfig()
}

let cache: { at: number; menus: MegaMenu[]; key: string } | null = null

export async function saveMegaConfig(input: unknown): Promise<MegaMenuConfig> {
  const next = normalizeMegaConfig(input, await getMegaConfig())
  await writeJsonSetting(SETTINGS_KEY, next)
  cache = null
  return next
}

/** Builds one section's panel with the given settings (also used by the admin preview). */
export async function buildMegaMenu(section: MegaSection, href: string, title: string, cfg: SectionMenuConfig): Promise<MegaMenu> {
  const built = await SOURCES[section](cfg).catch((): Built => ({ columns: [], quick: [], features: [] }))
  return {
    section, href, title,
    columns: built.columns.filter((column) => column.links.length),
    quick: [...cfg.links, ...(cfg.hideAutoLinks ? [] : built.quick)].slice(0, 10),
    features: built.features.filter((feature) => feature.image).slice(0, cfg.features),
    promo: cfg.promo.enabled ? { title: cfg.promo.title, text: cfg.promo.text, href: cfg.promo.href, image: cfg.promo.image, cta: cfg.promo.cta } : null,
  }
}

/**
 * Panels for the site's main menu (only for links that open an enabled section).
 * Cached briefly: the header renders on every page.
 */
export async function getMegaMenus(navigation: { href: string; label: string }[]): Promise<MegaMenu[]> {
  const key = navigation.map((link) => `${link.href}|${link.label}`).join('\n')
  if (cache && cache.key === key && Date.now() - cache.at < CACHE_MS) return cache.menus
  const config = await getMegaConfig()
  if (!await isModuleEnabled('mega-menu') || !config.enabled) { cache = { at: Date.now(), menus: [], key }; return [] }
  const wanted = navigation.map((link) => ({ link, section: sectionForHref(link.href) })).filter((entry): entry is { link: { href: string; label: string }; section: MegaSection } => !!entry.section && config.sections[entry.section].enabled)
  const menus = (await Promise.all(wanted.map(async ({ link, section }) => (await ENABLED[section]().catch(() => false)) ? buildMegaMenu(section, link.href, link.label, config.sections[section]) : null)))
    .filter((menu): menu is MegaMenu => !!menu && (menu.columns.length > 0 || menu.quick.length > 0 || menu.features.length > 0 || !!menu.promo))
  cache = { at: Date.now(), menus, key }
  return menus
}

/** Admin view: every section with its settings and a live preview. */
export async function megaMenuAdminState() {
  const config = await getMegaConfig()
  const sections = await Promise.all(MEGA_SECTIONS.map(async (section) => ({
    section,
    label: SECTION_LABEL[section],
    available: await ENABLED[section]().catch(() => false),
    preview: await buildMegaMenu(section, '#', SECTION_LABEL[section], { ...config.sections[section], enabled: true }),
  })))
  return { config, sections, moduleEnabled: await isModuleEnabled('mega-menu') }
}
