/**
 * Section menus: every broad section (shop, journal, music, cinema, games,
 * software, forum) shows its own menu bar inside the section — its main
 * categories, each with a mega panel of sub-categories — plus editor-controlled
 * quick links and a promo card. The site's main menu stays simple.
 * Pure types and validation — data sources live in ../server.
 */

export const MEGA_SECTIONS = ['shop', 'blog', 'music', 'cinema', 'games', 'software', 'forum'] as const
export type MegaSection = typeof MEGA_SECTIONS[number]

/** Landing page of each section (the bar's home link). */
export const SECTION_ROOT: Record<MegaSection, string> = {
  shop: '/products', blog: '/blog', music: '/music', cinema: '/cinema', games: '/games', software: '/software', forum: '/forum',
}

export const SECTION_LABEL: Record<MegaSection, string> = {
  shop: 'فروشگاه', blog: 'مجله', music: 'موزیک', cinema: 'فیلم و سریال', games: 'بازی', software: 'نرم‌افزار', forum: 'تالار گفتمان',
}

export type MegaLink = { label: string; href: string; count?: number; hint?: string }
export type MegaColumn = { title: string; href?: string; links: MegaLink[] }
export type MegaFeature = { title: string; href: string; image: string; kicker?: string }
export type MegaPromo = { title: string; text: string; href: string; image: string; cta: string }

export type SectionMenuConfig = {
  enabled: boolean
  /** Category columns to show (the rest are reachable from “all categories”). */
  columns: number
  linksPerColumn: number
  /** Featured items with artwork (0 hides the strip). */
  features: number
  /** Editor links shown as the “quick links” rail, before the automatic ones. */
  links: MegaLink[]
  /** Hide the automatic quick links (newest, popular, …). */
  hideAutoLinks: boolean
  promo: MegaPromo & { enabled: boolean }
}

export type MegaMenuConfig = { enabled: boolean; sections: Record<MegaSection, SectionMenuConfig> }

export class MegaMenuError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

const EMPTY_PROMO = { enabled: false, title: '', text: '', href: '', image: '', cta: '' }

export function defaultSectionConfig(): SectionMenuConfig {
  return { enabled: true, columns: 4, linksPerColumn: 8, features: 2, links: [], hideAutoLinks: false, promo: { ...EMPTY_PROMO } }
}

export function defaultMegaConfig(): MegaMenuConfig {
  return { enabled: true, sections: Object.fromEntries(MEGA_SECTIONS.map((section) => [section, defaultSectionConfig()])) as Record<MegaSection, SectionMenuConfig> }
}

const text = (value: unknown, max: number) => String(value ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
const int = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(value))
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback
}

/** Site-relative paths or absolute https URLs only (no javascript:, data:, protocol-relative). */
export function safeHref(value: unknown): string {
  const href = String(value ?? '').trim().slice(0, 300)
  if (/^\/(?!\/)[^\s<>"'`\\]*$/.test(href)) return href
  if (/^https:\/\/[^\s<>"'`\\]+$/i.test(href)) return href
  return ''
}

/** Uploaded media paths or https images. */
export function safeImage(value: unknown): string {
  const src = String(value ?? '').trim().slice(0, 400)
  if (/^\/(?!\/)[^\s<>"'`\\]*$/.test(src) || /^https:\/\/[^\s<>"'`\\]+$/i.test(src)) return src
  return ''
}

function normalizeLinks(value: unknown, fallback: MegaLink[]): MegaLink[] {
  if (!Array.isArray(value)) return fallback
  const links: MegaLink[] = []
  for (const raw of value.slice(0, 12)) {
    const row = (raw || {}) as Record<string, unknown>
    const label = text(row.label, 60)
    const href = safeHref(row.href)
    if (!label && !href) continue
    if (!label || !href) throw new MegaMenuError(`لینک «${label || href}» باید هم عنوان و هم نشانی معتبر (شروع با / یا https://) داشته باشد`)
    links.push({ label, href })
  }
  return links
}

export function normalizeSectionConfig(input: unknown, previous: SectionMenuConfig = defaultSectionConfig()): SectionMenuConfig {
  const row = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const promoIn = (row.promo && typeof row.promo === 'object' ? row.promo : {}) as Record<string, unknown>
  const promo = row.promo === undefined ? previous.promo : {
    enabled: promoIn.enabled === true,
    title: text(promoIn.title, 80), text: text(promoIn.text, 160), cta: text(promoIn.cta, 30),
    href: safeHref(promoIn.href), image: safeImage(promoIn.image),
  }
  if (promo.enabled && (!promo.title || !promo.href)) throw new MegaMenuError('بنر تبلیغاتی به عنوان و نشانی معتبر نیاز دارد')
  return {
    enabled: typeof row.enabled === 'boolean' ? row.enabled : previous.enabled,
    columns: row.columns === undefined ? previous.columns : int(row.columns, 1, 6, 4),
    linksPerColumn: row.linksPerColumn === undefined ? previous.linksPerColumn : int(row.linksPerColumn, 3, 15, 8),
    features: row.features === undefined ? previous.features : int(row.features, 0, 3, 2),
    links: normalizeLinks(row.links, previous.links),
    hideAutoLinks: typeof row.hideAutoLinks === 'boolean' ? row.hideAutoLinks : previous.hideAutoLinks,
    promo,
  }
}

export function normalizeMegaConfig(input: unknown, previous: MegaMenuConfig = defaultMegaConfig()): MegaMenuConfig {
  const row = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const sections = (row.sections && typeof row.sections === 'object' ? row.sections : {}) as Record<string, unknown>
  return {
    enabled: typeof row.enabled === 'boolean' ? row.enabled : previous.enabled,
    sections: Object.fromEntries(MEGA_SECTIONS.map((section) => [section, sections[section] === undefined
      ? previous.sections[section] || defaultSectionConfig()
      : normalizeSectionConfig(sections[section], previous.sections[section])])) as Record<MegaSection, SectionMenuConfig>,
  }
}

/**
 * Turns a category forest into panel columns: every root with children is a
 * column of its children; childless roots are gathered into one leading column.
 */
export function treeColumns<T extends { id: number; parentId: number | null; label: string; href: string; count?: number }>(
  nodes: T[], options: { columns: number; perColumn: number; looseTitle: string },
): MegaColumn[] {
  const byParent = new Map<number | null, T[]>()
  const ids = new Set(nodes.map((node) => node.id))
  for (const node of nodes) {
    const parent = node.parentId !== null && ids.has(node.parentId) ? node.parentId : null
    byParent.set(parent, [...(byParent.get(parent) || []), node])
  }
  const link = (node: T): MegaLink => ({ label: node.label, href: node.href, ...(node.count !== undefined ? { count: node.count } : {}) })
  const roots = byParent.get(null) || []
  const loose = roots.filter((root) => !(byParent.get(root.id) || []).length)
  const branches = roots.filter((root) => (byParent.get(root.id) || []).length)
  const columns: MegaColumn[] = []
  if (loose.length) columns.push({ title: options.looseTitle, links: loose.slice(0, options.perColumn).map(link) })
  for (const root of branches) columns.push({ title: root.label, href: root.href, links: (byParent.get(root.id) || []).slice(0, options.perColumn).map(link) })
  return columns.slice(0, options.columns)
}

/** Facet values ("Action, RPG") → counted list, most common first. */
export function facetCounts(values: string[], limit: number): { name: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const value of values) {
    for (const part of value.split(/[,،|/]/).map((item) => item.trim()).filter(Boolean)) counts.set(part, (counts.get(part) || 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fa')).slice(0, limit).map(([name, count]) => ({ name, count }))
}

// ------------------------------------------------------------------ section menu bar

/** One top-level entry of a section's own menu bar, with its dropdown panel. */
export type SectionBarItem = { key: string; label: string; href: string; columns: MegaColumn[]; features: MegaFeature[] }

export type SectionBar = {
  section: MegaSection
  title: string
  home: string
  items: SectionBarItem[]
  /** Plain links after the category items (newest, most downloaded, …). */
  quick: MegaLink[]
  promo: MegaPromo | null
  search: { action: string; placeholder: string; param: string; categories: { value: string; label: string }[] } | null
}

/**
 * Dropdown columns for one top-level category: its children become columns
 * of their own children; childless children are gathered in a leading column.
 */
export function subtreeColumns<T extends { id: number; parentId: number | null; label: string; href: string; count?: number }>(
  nodes: T[], rootId: number, options: { columns: number; perColumn: number; looseTitle: string },
): MegaColumn[] {
  const inside = new Set<number>()
  for (let frontier = [rootId]; frontier.length;) {
    const next = nodes.filter((node) => node.parentId !== null && frontier.includes(node.parentId) && !inside.has(node.id))
    for (const node of next) inside.add(node.id)
    frontier = next.map((node) => node.id)
  }
  const subtree = nodes.filter((node) => inside.has(node.id)).map((node) => (node.parentId === rootId ? { ...node, parentId: null } : node))
  return treeColumns(subtree, options)
}
