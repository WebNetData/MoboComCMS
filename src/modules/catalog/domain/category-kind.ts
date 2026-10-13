// The shop has two halves — goods that are shipped (PHYSICAL) and products delivered online (VIRTUAL).
// A product category belongs to one of them: a root category decides, and every category under it
// carries the same value. '' means "not decided yet" (categories that existed before the halves and
// held both kinds, or none).

export const CATEGORY_KINDS = ['PHYSICAL', 'VIRTUAL'] as const
export type CategoryKind = '' | (typeof CATEGORY_KINDS)[number]

export const CATEGORY_KIND_LABEL: Record<CategoryKind, { fa: string; en: string }> = {
  '': { fa: 'تعیین‌نشده', en: 'Not decided' },
  PHYSICAL: { fa: 'کالاهای فیزیکی', en: 'Physical goods' },
  VIRTUAL: { fa: 'محصولات مجازی', en: 'Digital products' },
}

export class CategoryKindError extends Error {
  constructor(message: string, readonly status = 409) { super(message) }
}

/** What the admin sent, as a kind; anything else is refused rather than read as "not decided". */
export function parseCategoryKind(value: unknown): CategoryKind {
  const kind = String(value ?? '').trim().toUpperCase()
  if (kind === '') return ''
  if (kind === 'PHYSICAL' || kind === 'VIRTUAL') return kind
  throw new CategoryKindError('Invalid half of the shop for a category', 400)
}

export type KindNode = { id: number; parentId: number | null }

/** The category and everything under it (a loop in stored data cannot hang it). */
export function categorySubtree(nodes: KindNode[], id: number): number[] {
  const children = new Map<number, number[]>()
  for (const node of nodes) if (node.parentId != null) children.set(node.parentId, [...(children.get(node.parentId) || []), node.id])
  const seen = new Set<number>(), queue = [id]
  while (queue.length) {
    const next = queue.pop() as number
    if (seen.has(next)) continue
    seen.add(next)
    queue.push(...(children.get(next) || []))
  }
  return [...seen]
}

/**
 * Why a category (with everything under it) cannot take a kind, or null when it can: products of the
 * other kind are filed under it, or one of its attribute groups is made for the other kind.
 */
export function kindConflict(kind: CategoryKind, held: { otherProducts: number; groups: { name: string; appliesTo: string }[] }): string | null {
  if (kind === '') return null
  const here = CATEGORY_KIND_LABEL[kind].fa, other = CATEGORY_KIND_LABEL[kind === 'PHYSICAL' ? 'VIRTUAL' : 'PHYSICAL'].fa
  if (held.otherProducts > 0) return `${held.otherProducts.toLocaleString('fa-IR')} محصول از «${other}» در این دسته یا زیردسته‌هایش هست؛ اول آن‌ها را جابه‌جا کنید، بعد دسته را در «${here}» بگذارید.`
  const wrong = held.groups.filter((group) => group.appliesTo !== 'ANY' && group.appliesTo !== kind)
  if (wrong.length) return `گروه مشخصات «${wrong[0].name}» برای «${other}» ساخته شده و به این دسته یا زیردسته‌هایش وصل است؛ گروه دیگری انتخاب کنید.`
  return null
}

/** Whether a product of this kind may be filed under a category of that kind. */
export const productFitsCategory = (productKind: string, categoryKind: string) => categoryKind === '' || categoryKind === productKind
