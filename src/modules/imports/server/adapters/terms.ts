import { db } from '@/platform/database/prisma'
import { deleteTerm, saveTerm } from '@/modules/taxonomy/server/taxonomy'
import type { Taxonomy } from '@/modules/taxonomy/domain/taxonomy'
import type { Counters } from '@/modules/imports/domain/types'
import { normalizeName } from '@/modules/imports/domain/values'
import { planOnce } from '@/modules/imports/server/adapters/common'
import type { Change, ImportContext } from '@/modules/imports/server/registry'

/**
 * Section categories (software, games, music, cinema taxonomies) for imports:
 * a path "Action > Shooter" is matched level by level on the term's parent,
 * name or slug; missing levels are created with the taxonomy's own rules.
 */

type Term = { id: number; parentId: number | null; name: string; slug: string }

async function termsOf(ctx: ImportContext, taxonomy: Taxonomy): Promise<Map<number, Term>> {
  const key = `terms:${taxonomy}`
  const hit = ctx.cache.get(key) as Map<number, Term> | undefined
  if (hit) return hit
  const rows = await db.taxonomyTerm.findMany({ where: { taxonomy }, select: { id: true, parentId: true, name: true, slug: true } })
  const map = new Map(rows.map((row) => [row.id, row]))
  ctx.cache.set(key, map)
  return map
}

function walk(terms: Map<number, Term>, path: string[]) {
  const found: Term[] = []
  let parent: number | null = null
  for (let i = 0; i < path.length; i++) {
    const n = normalizeName(path[i])
    const hit = [...terms.values()].find((t) => t.parentId === parent && (normalizeName(t.name) === n || t.slug === n.replace(/\s+/g, '-')))
    if (!hit) return { found, missing: path.slice(i) }
    found.push(hit)
    parent = hit.id
  }
  return { found, missing: [] as string[] }
}

/** Dry run: which paths exist; counts terms to create once. Returns an error text when creation is off. */
export async function planTerms(ctx: ImportContext, taxonomy: Taxonomy, paths: string[][], create: boolean, counters: Counters): Promise<string | null> {
  const terms = await termsOf(ctx, taxonomy)
  for (const path of paths) {
    const { found, missing } = walk(terms, path)
    if (!missing.length) continue
    if (!create) return `دستهٔ «${path.join(' > ')}» وجود ندارد`
    for (let i = found.length; i < path.length; i++) planOnce(ctx, `term:${taxonomy}:${path.slice(0, i + 1).map(normalizeName).join('>')}`, counters, 'termsCreated')
  }
  return null
}

/** The leaf term ids of the paths, creating missing levels (recorded for rollback). */
export async function ensureTerms(ctx: ImportContext, taxonomy: Taxonomy, paths: string[][], changes: Change[], counters: Counters): Promise<number[]> {
  const terms = await termsOf(ctx, taxonomy)
  const ids: number[] = []
  for (const path of paths) {
    const { found, missing } = walk(terms, path)
    let parent = found[found.length - 1] || null
    for (const name of missing) {
      const created = await saveTerm(taxonomy, { name, parentId: parent?.id ?? null })
      const term: Term = { id: created.id, parentId: created.parentId, name: created.name, slug: created.slug }
      terms.set(term.id, term)
      changes.push({ kind: 'created', entity: `term:${taxonomy}`, id: term.id, stamp: created.updatedAt.toISOString() })
      counters.termsCreated = (counters.termsCreated || 0) + 1
      parent = term
    }
    if (parent && !ids.includes(parent.id)) ids.push(parent.id)
  }
  return ids
}

/** Removes a term the import created, if it is unchanged and nothing is filed under it. */
export async function undoTerm(change: Change): Promise<string | null> {
  if (change.kind !== 'created') return null
  const taxonomy = change.entity.slice('term:'.length) as Taxonomy
  const term = await db.taxonomyTerm.findUnique({ where: { id: change.id }, include: { _count: { select: { assignments: true, children: true } } } })
  if (!term) return null
  if (change.stamp && term.updatedAt.toISOString() !== change.stamp) return `دستهٔ «${term.name}» پس از ورود اطلاعات ویرایش شده؛ حذف نشد`
  if (term._count.assignments || term._count.children) return `دستهٔ «${term.name}» هنوز مورد یا زیردسته دارد؛ حذف نشد`
  await deleteTerm(taxonomy, term.id)
  return null
}
