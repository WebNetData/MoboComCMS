import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import type { FieldDef } from '@/modules/imports/domain/types'

type Row = { id: number; [key: string]: unknown }
type Reader = { findMany(args: object): Promise<Row[]> }
type Lookup = { model: string; where: Record<string, unknown>; label: string; value?: string; tree?: boolean; multiple?: boolean }
const taxonomies: Record<string, string> = { movies: 'cinema', series: 'cinema', games: 'games', software: 'software', music: 'music' }

export function fieldLookup(adapter: string, key: string): Lookup | null {
  if (key === 'categories' && taxonomies[adapter]) return { model: 'taxonomyTerm', where: { taxonomy: taxonomies[adapter] }, label: 'name', tree: true, multiple: true }
  if (adapter === 'magazine' && key === 'categories') return { model: 'postCategory', where: {}, label: 'name', tree: true, multiple: true }
  if (adapter === 'store' && key === 'category') return { model: 'productCategory', where: {}, label: 'name', tree: true }
  if (adapter === 'store' && key === 'brand') return { model: 'productBrand', where: {}, label: 'name' }
  if (adapter === 'music' && key === 'artist') return { model: 'musicArtist', where: { mergedIntoId: null }, label: 'name' }
  if (adapter === 'music' && key === 'album') return { model: 'musicAlbum', where: { artist: { mergedIntoId: null } }, label: 'title' }
  if (adapter === 'magazine' && key === 'author') return { model: 'user', where: { status: 'ACTIVE' }, label: 'name', value: 'email' }
  if (adapter === 'businesses' && key === 'sellerId') return { model: 'seller', where: { status: 'ACTIVE' }, label: 'shopName', value: 'id' }
  if (adapter === 'vip-members' && key === 'plan') return { model: 'membershipPlan', where: { active: true }, label: 'name', value: 'slug' }
  if (adapter === 'vip-members' && key === 'user') return { model: 'user', where: { status: 'ACTIVE' }, label: 'name', value: 'id' }
  const section = adapter === 'movies' || adapter === 'series' ? 'cinema' : adapter
  const list = key === 'genres' || key === 'genre' ? 'GENRE' : key === 'platforms' ? 'PLATFORM' : key === 'countries' ? 'COUNTRY' : key === 'languages' ? 'LANGUAGE' : key === 'category' && ['prompts', 'businesses'].includes(adapter) ? 'CATEGORY' : ''
  if (list && ['cinema','games','software','music','prompts','businesses'].includes(section)) return { model: 'vocabulary', where: { section, list, active: true }, label: 'name', value: ['prompts','businesses'].includes(section) ? 'code' : 'name', multiple: ['genres','platforms','countries','languages'].includes(key) }
  if (['movies','series'].includes(adapter) && ['director','cast'].includes(key)) return { model: 'cinemaPerson', where: { mergedIntoId: null }, label: 'name', multiple: key === 'cast' }
  return null
}

const reader = (lookup: Lookup, client: Prisma.TransactionClient | typeof db) => (client as unknown as Record<string, Reader>)[lookup.model]
const selectOf = (lookup: Lookup) => ({ id: true, [lookup.label]: true, ...(lookup.value ? { [lookup.value]: true } : {}), ...(lookup.tree ? { parentId: true, slug: true } : {}), ...(lookup.model === 'musicAlbum' ? { artistId: true } : {}), ...(lookup.model === 'productBrand' ? { slug: true } : {}) })

export async function existingFieldChoices(adapter: string, key: string, query = '', page = 1, ids?: number[], client: Prisma.TransactionClient | typeof db = db) {
  const lookup = fieldLookup(adapter, key)
  if (!lookup) throw new Error('این فیلد فهرست موجود ندارد')
  const rows = await reader(lookup, client).findMany({ where: { ...lookup.where, ...(ids ? { id: { in: ids } } : query ? { [lookup.label]: { contains: query.slice(0, 100) } } : {}) }, select: selectOf(lookup), orderBy: { id: 'asc' }, ...(!ids ? { skip: (page - 1) * 50, take: 51 } : {}) })
  const selected = ids ? rows : rows.slice(0, 50)
  // Ancestry reads are bounded to each level, not an unbounded category download.
  const ancestors = new Map(selected.map(row => [row.id, row]))
  for (let depth = 0; lookup.tree && depth < 100; depth++) {
    const missing = [...new Set([...ancestors.values()].map(row => Number(row.parentId)).filter(id => id && !ancestors.has(id)))]
    if (!missing.length) break
    const parents = await reader(lookup, client).findMany({ where: { ...lookup.where, id: { in: missing } }, select: selectOf(lookup) })
    if (!parents.length) break
    for (const row of parents) ancestors.set(row.id, row)
  }
  return { choices: selected.map(row => {
    const labels: string[] = []; const slugs: string[] = []; const visited = new Set<number>(); let part: Row | undefined = row
    while (part && !visited.has(part.id)) { visited.add(part.id); if (part.slug) slugs.unshift(String(part.slug)); labels.unshift(String(part[lookup.label] || '#' + part.id)); part = ancestors.get(Number(part.parentId)) }
    return { id: String(row.id), label: labels.join(' › ') + ' (#' + row.id + ')', value: lookup.tree ? [slugs] : lookup.model === 'productBrand' ? row.slug : row[lookup.value || lookup.label], row }
  }), more: !ids && rows.length > 50 }
}

export function fieldSelection(adapter: string, field: FieldDef) {
  const lookup = fieldLookup(adapter, field.key)
  return lookup ? { multiple: lookup.multiple === true } : undefined
}
