import { db } from '@/platform/database/prisma'
import { inheritedAttributeGroup, validateFields, type AttributeField } from '@/modules/catalog/server/product-config'
import { slugify } from '@/modules/taxonomy/domain/taxonomy'
import { latinSlug, normalizeName, normalizeValue } from '@/modules/imports/domain/values'
import { type ImportContext } from '@/modules/imports/server/registry'
import { type Existing } from '@/modules/imports/server/adapters/store/per-slice-lookups'
import { type Opt } from '@/modules/imports/server/adapters/store/core'

export type Cat = { id: number; slug: string; name: string; nameEn: string; parentId: number | null; attributeGroupId: number | null }

export type Group = { id: number; name: string; nameEn: string; appliesTo: string; fields: AttributeField[] }

export type Brand = { id: number; slug: string; name: string; nameEn: string }

export type Caches = { cats: Map<number, Cat>; groups: Map<number, Group>; brands: Map<number, Brand>; catSlugs: Set<string>; brandSlugs: Set<string> }

export async function caches(ctx: ImportContext): Promise<Caches> {
  const hit = ctx.cache.get('store') as Caches | undefined
  if (hit) return hit
  const [cats, groups, brands] = await Promise.all([
    db.productCategory.findMany({ select: { id: true, slug: true, name: true, nameEn: true, parentId: true, attributeGroupId: true } }),
    db.productAttributeGroup.findMany({ select: { id: true, name: true, nameEn: true, appliesTo: true, fields: true } }),
    db.productBrand.findMany({ select: { id: true, slug: true, name: true, nameEn: true } }),
  ])
  const value: Caches = {
    cats: new Map(cats.map((c) => [c.id, c])),
    groups: new Map(groups.map((g) => { let fields: AttributeField[] = []; try { fields = validateFields(g.fields) } catch { fields = [] } return [g.id, { ...g, fields }] })),
    brands: new Map(brands.map((b) => [b.id, b])),
    catSlugs: new Set(cats.map((c) => c.slug)),
    brandSlugs: new Set(brands.map((b) => b.slug)),
  }
  ctx.cache.set('store', value)
  return value
}

/** Existing category for a path, or how far the path already exists. */
export function walkPath(c: Caches, path: string[], selectedId?: number): { found: Cat | null; existing: Cat[]; missing: string[] } {
  if (selectedId) { const found = c.cats.get(selectedId); if (!found) throw new Error('دستهٔ انتخاب‌شده دیگر وجود ندارد'); return { found, existing: [found], missing: [] } }
  const existing: Cat[] = []
  let parent: number | null = null
  for (let i = 0; i < path.length; i++) {
    const n = normalizeName(path[i]), s = latinSlug(path[i]) || slugify(path[i])
    const hit = [...c.cats.values()].find((cat) => cat.parentId === parent && (normalizeName(cat.name) === n || (cat.nameEn && normalizeName(cat.nameEn) === n) || cat.slug === s))
    if (!hit) return { found: null, existing, missing: path.slice(i) }
    existing.push(hit)
    parent = hit.id
  }
  return { found: existing[existing.length - 1] || null, existing, missing: [] }
}

/** The group a category uses — the store's own inheritance walk, over the run's category cache. */
export async function groupOfCategory(c: Caches, id: number | null): Promise<{ group: Group | null; via: Cat | null }> {
  const found = await inheritedAttributeGroup(id, (catId) => {
    const cat = c.cats.get(catId)
    return cat ? { parentId: cat.parentId, group: cat.attributeGroupId ? c.groups.get(cat.attributeGroupId) || null : null } : null
  })
  return { group: found.group, via: found.categoryId ? c.cats.get(found.categoryId) || null : null }
}

/** Specifications after this import: the product's current ones (unless replacing) plus the file's, only the group's keys. */
export function mergedSpecs(existing: Existing | null, specs: Record<string, string>, replace: boolean, fields: AttributeField[]): Record<string, string> {
  const keys = new Set(fields.filter((f) => !f.variant).map((f) => f.key))
  let current: Record<string, string> = {}
  try { current = existing && !replace ? JSON.parse(existing.specifications || '{}') : {} } catch { current = {} }
  const merged: Record<string, string> = {}
  for (const [key, value] of Object.entries({ ...current, ...specs })) if (keys.has(key)) merged[key] = value
  return merged
}

/**
 * File prices are in the import's currency. An existing product priced in
 * another currency keeps its prices (its currency is never switched by an
 * import, since its other amounts — variants, VIP price — would change meaning).
 */
export function currencyConflict(existing: Existing | null, o: Opt): string {
  if (!existing || existing.currency === o.currency) return ''
  return `قیمت‌های فایل به ${o.currency} است ولی این محصول به ${existing.currency} قیمت‌گذاری شده؛ قیمت محصول و تنوع‌هایش تغییر نمی‌کند`
}

/** Key of a manual value mapping: attribute key and the normalized source value. */
export const optionMapKey = (key: string, value: string) => `${key}=${normalizeValue(value)}`

export const findBrand = (c: Caches, name: string, selectedId?: number) => {
  if (selectedId) return c.brands.get(selectedId) || null
  const n = normalizeName(name), s = latinSlug(name)
  return [...c.brands.values()].find((b) => normalizeName(b.name) === n || (b.nameEn && normalizeName(b.nameEn) === n) || (s && b.slug === s)) || null
}

export const findGroup = (c: Caches, name: string) => {
  const n = normalizeName(name)
  return [...c.groups.values()].find((g) => normalizeName(g.name) === n || (g.nameEn && normalizeName(g.nameEn) === n)) || null
}
