import { db } from '@/platform/database/prisma'
import { templateRows } from '@/modules/catalog/domain/category-template'

export type TemplateResult = { created: number; kept: number; elsewhere: string[] }

/**
 * Builds the ready category tree: every category of the template whose address is free is created under its parent
 * (a child in its parent's half of the shop, a root in its own). An address already in use is kept as it is, wherever
 * it stands; its slug is reported in `elsewhere` when the template would have put it under another parent.
 */
export async function buildCategoryTemplate(): Promise<TemplateResult> {
  return db.$transaction(async (tx) => {
    const existing = await tx.productCategory.findMany({ select: { id: true, slug: true, parentId: true, kind: true } })
    const bySlug = new Map(existing.map((row) => [row.slug, row]))
    let created = 0, kept = 0
    const elsewhere: string[] = []
    for (const row of templateRows()) {
      const parent = row.parent ? bySlug.get(row.parent) ?? null : null
      const found = bySlug.get(row.slug)
      if (found) {
        kept++
        if ((parent?.id ?? null) !== found.parentId) elsewhere.push(row.slug)
        continue
      }
      const made = await tx.productCategory.create({
        data: { slug: row.slug, name: row.name, nameEn: row.nameEn, description: row.description, parentId: parent?.id ?? null, kind: parent ? parent.kind : row.kind, sortOrder: row.order },
        select: { id: true, slug: true, parentId: true, kind: true },
      })
      bySlug.set(made.slug, made)
      created++
    }
    return { created, kept, elsewhere }
  }, { isolationLevel: 'Serializable' })
}
