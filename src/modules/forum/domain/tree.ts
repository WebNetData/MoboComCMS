// The forum's structure is a tree of at most three levels: section, forum, subforum. Lists that show it
// (the composer's picker, the sidebar, the admin table) walk it the same way.

export const MAX_CATEGORY_DEPTH = 3
/** The section every club's forum sits under. */
export const CLUBS_SECTION = 'clubs'

type Node = { id: number; parentId: number | null }

/**
 * Categories in reading order, each with its depth (0 for the top). A category whose parent is not in the
 * list (hidden from this viewer) is shown at the top, so nothing visible is lost.
 */
export function categoryTree<T extends Node>(categories: T[]): { category: T; depth: number }[] {
  const ids = new Set(categories.map((row) => row.id))
  const out: { category: T; depth: number }[] = []
  const seen = new Set<number>()
  const walk = (parentId: number | null, depth: number) => {
    for (const row of categories) {
      const top = row.parentId === null || !ids.has(row.parentId)
      if (seen.has(row.id) || (parentId === null ? !top : row.parentId !== parentId)) continue
      seen.add(row.id)
      out.push({ category: row, depth })
      if (depth + 1 < MAX_CATEGORY_DEPTH) walk(row.id, depth + 1)
    }
  }
  walk(null, 0)
  // Anything deeper than the tree allows, or caught in a loop, still shows rather than vanishing.
  for (const row of categories) if (!seen.has(row.id)) out.push({ category: row, depth: MAX_CATEGORY_DEPTH - 1 })
  return out
}

/** The category and everything under it. */
export function categoryFamily<T extends Node>(categories: T[], id: number): number[] {
  const family = [id]
  for (let index = 0; index < family.length; index += 1) for (const row of categories) if (row.parentId === family[index] && !family.includes(row.id)) family.push(row.id)
  return family
}

/** The path from the top down to the category, itself last: the breadcrumb. */
export function categoryPath<T extends Node>(categories: T[], id: number): T[] {
  const byId = new Map(categories.map((row) => [row.id, row]))
  const path: T[] = []
  for (let row = byId.get(id); row && !path.includes(row) && path.length < MAX_CATEGORY_DEPTH + 1; row = row.parentId ? byId.get(row.parentId) : undefined) path.unshift(row)
  return path
}
