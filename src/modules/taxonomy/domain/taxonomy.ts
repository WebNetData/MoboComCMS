/**
 * Section taxonomies: one category tree (with unlimited sub-levels) per
 * content section, like WordPress custom taxonomies. Pure rules only.
 */

export const TAXONOMIES = ['software', 'games', 'music', 'music-language', 'cinema'] as const
export type Taxonomy = typeof TAXONOMIES[number]

export const TAXONOMY_INFO: Record<Taxonomy, { label: string; item: string; base: string; module: string }> = {
  software: { label: 'دسته‌بندی نرم‌افزار', item: 'نرم‌افزار', base: '/software/category', module: 'software' },
  games: { label: 'دسته‌بندی بازی', item: 'بازی', base: '/games/category', module: 'games' },
  music: { label: 'دسته‌بندی موزیک', item: 'آلبوم', base: '/music/category', module: 'music' },
  // A second way to file music, beside its categories: the language or dialect of a song. Its items are songs.
  'music-language': { label: 'زبان و گویش موزیک', item: 'آهنگ', base: '/music/language', module: 'music' },
  cinema: { label: 'دسته‌بندی فیلم و سریال', item: 'فیلم و سریال', base: '/cinema/category', module: 'cinema' },
}

/** Taxonomies that replaced an old free-text field and can be filled from it once. The language of music has none. */
export const LEGACY_SOURCES: readonly Taxonomy[] = ['software', 'games', 'music', 'cinema']

export const MAX_DEPTH = 4
export const MAX_TERMS = 1000

export class TaxonomyError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

export const isTaxonomy = (value: unknown): value is Taxonomy => (TAXONOMIES as readonly string[]).includes(String(value))

export type TermNode = { id: number; parentId: number | null; slug: string; name: string; sortOrder: number }

const clean = (value: unknown, max: number) => String(value ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)

/**
 * URL slug that keeps Persian words readable: letters (Latin or Persian),
 * digits and dashes. Arabic ي/ك become Persian ی/ک; ZWNJ becomes a dash.
 */
export function slugify(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/ي/g, 'ی').replace(/ك/g, 'ک')
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[‌\s_]+/g, '-')
    .replace(/[^a-z0-9؀-ۿ-]/g, '')
    .replace(/[ً-ٰٟ]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
}

export type TermInput = {
  name: string; slug: string; parentId: number | null; description: string; icon: string; image: string; color: string
  inMenu: boolean; seoTitle: string; seoDescription: string; sortOrder: number
}

const safeImage = (value: unknown) => {
  const src = String(value ?? '').trim().slice(0, 400)
  return /^\/(?!\/)[^\s<>"'`\\]*$/.test(src) || /^https:\/\/[^\s<>"'`\\]+$/i.test(src) ? src : ''
}

export function validateTerm(input: Record<string, unknown>): TermInput {
  const name = clean(input.name, 80)
  if (name.length < 2) throw new TaxonomyError('نام دسته حداقل دو حرف باشد')
  const slug = slugify(input.slug || name)
  if (!slug) throw new TaxonomyError('نامک (آدرس) دسته معتبر نیست')
  const parentId = input.parentId === null || input.parentId === '' || input.parentId === undefined ? null : Number(input.parentId)
  if (parentId !== null && (!Number.isSafeInteger(parentId) || parentId <= 0)) throw new TaxonomyError('دستهٔ والد معتبر نیست')
  const color = String(input.color ?? '').trim()
  return {
    name, slug, parentId,
    description: clean(input.description, 1000),
    icon: clean(input.icon, 40),
    image: safeImage(input.image),
    color: /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : '',
    inMenu: input.inMenu !== false,
    seoTitle: clean(input.seoTitle, 90),
    seoDescription: clean(input.seoDescription, 200),
    sortOrder: Number.isSafeInteger(Number(input.sortOrder)) ? Math.max(0, Math.min(100_000, Number(input.sortOrder))) : 0,
  }
}

/** Ids of a term and everything under it. */
export function descendants(nodes: Pick<TermNode, 'id' | 'parentId'>[], id: number): number[] {
  const out = [id]
  for (let i = 0; i < out.length; i++) for (const node of nodes) if (node.parentId === out[i] && !out.includes(node.id)) out.push(node.id)
  return out
}

/** Root-first chain from the top level down to the term. */
export function ancestry<T extends Pick<TermNode, 'id' | 'parentId'>>(nodes: T[], id: number): T[] {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const chain: T[] = []
  for (let current = byId.get(id); current && chain.length <= MAX_DEPTH + 1; current = current.parentId ? byId.get(current.parentId) : undefined) {
    if (chain.includes(current)) break
    chain.unshift(current)
  }
  return chain
}

/** Rejects moves that would create a loop or exceed the depth limit. */
export function assertParent(nodes: Pick<TermNode, 'id' | 'parentId'>[], id: number | null, parentId: number | null) {
  if (parentId === null) return
  if (!nodes.some((node) => node.id === parentId)) throw new TaxonomyError('دستهٔ والد پیدا نشد', 404)
  if (id !== null && descendants(nodes, id).includes(parentId)) throw new TaxonomyError('یک دسته نمی‌تواند زیرمجموعهٔ خودش یا فرزندانش شود')
  const parentDepth = ancestry(nodes, parentId).length
  const subtreeDepth = id === null ? 1 : Math.max(...descendants(nodes, id).map((d) => ancestry(nodes, d).length - ancestry(nodes, id).length + 1))
  if (parentDepth + subtreeDepth > MAX_DEPTH) throw new TaxonomyError(`حداکثر ${MAX_DEPTH.toLocaleString('fa-IR')} سطح زیردسته مجاز است`)
}

export type TreeNode<T> = T & { children: TreeNode<T>[]; depth: number }

/** Nested tree ordered by sortOrder then name; orphans are lifted to the top level. */
export function buildTree<T extends TermNode>(nodes: T[]): TreeNode<T>[] {
  const ids = new Set(nodes.map((node) => node.id))
  const sorted = [...nodes].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'fa'))
  const build = (parentId: number | null, depth: number, seen: Set<number>): TreeNode<T>[] => sorted
    .filter((node) => (parentId === null ? node.parentId === null || !ids.has(node.parentId) : node.parentId === parentId) && !seen.has(node.id))
    .map((node) => {
      const next = new Set(seen).add(node.id)
      return { ...node, depth, children: depth >= MAX_DEPTH ? [] : build(node.id, depth + 1, next) }
    })
  return build(null, 1, new Set())
}

/** Depth-first flat list (for selects and indented tables). */
export function flatten<T extends TermNode>(tree: TreeNode<T>[]): TreeNode<T>[] {
  return tree.flatMap((node) => [node, ...flatten(node.children)])
}

/** Public URL of a term: nested slugs mirror the tree (/software/category/windows/security). */
export function termPath<T extends Pick<TermNode, 'id' | 'parentId' | 'slug'>>(taxonomy: Taxonomy, nodes: T[], id: number): string {
  return `${TAXONOMY_INFO[taxonomy].base}/${ancestry(nodes, id).map((node) => encodeURIComponent(node.slug)).join('/')}`
}

/** Resolves /a/b/c to the term whose chain matches exactly. */
export function termBySlugs<T extends Pick<TermNode, 'id' | 'parentId' | 'slug'>>(nodes: T[], slugs: string[]): T | null {
  const wanted = slugs.map((slug) => decodeURIComponent(slug))
  const leaf = nodes.filter((node) => node.slug === wanted[wanted.length - 1])
  return leaf.find((node) => ancestry(nodes, node.id).map((n) => n.slug).join('/') === wanted.join('/')) || null
}

/** Assignment input → unique valid ids with an optional primary term (defaults to the first). */
export function normalizeAssignment(input: unknown, validIds: Set<number>): { ids: number[]; primary: number | null } {
  const raw = (input && typeof input === 'object' && !Array.isArray(input) ? input : { ids: input }) as { ids?: unknown; primary?: unknown }
  const ids = [...new Set((Array.isArray(raw.ids) ? raw.ids : []).map(Number).filter((id) => validIds.has(id)))].slice(0, 20)
  const primary = ids.includes(Number(raw.primary)) ? Number(raw.primary) : ids[0] ?? null
  return { ids, primary }
}
