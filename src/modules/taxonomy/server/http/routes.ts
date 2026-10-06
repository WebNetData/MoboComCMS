import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { auditAdmin } from '@/platform/audit/server'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { TAXONOMY_INFO, TaxonomyError, isTaxonomy, type Taxonomy } from '@/modules/taxonomy/domain/taxonomy'
import { invalidateSectionBars } from '@/modules/navigation/server/megamenu'
import { deleteTerm, importLegacy, recount, reorderTerms, saveTerm, termOptions, termTree } from '@/modules/taxonomy/server/taxonomy'

function failure(error: unknown) {
  if (error instanceof TaxonomyError) return err(error.message, error.status)
  console.error('[taxonomy]', error)
  return err('خطای داخلی؛ دوباره تلاش کنید', 500)
}

type Admin = Extract<Awaited<ReturnType<typeof adminGuard>>, { admin: unknown }>['admin']

async function guard(req: NextRequest): Promise<{ taxonomy: Taxonomy; admin: Admin } | { response: Response }> {
  const taxonomy = req.nextUrl.searchParams.get('tax')
  if (!isTaxonomy(taxonomy)) return { response: err('invalid taxonomy') }
  const module = TAXONOMY_INFO[taxonomy].module
  const g = await adminGuard(req, module, [`${module}.manage`])
  return 'response' in g ? g : { taxonomy, admin: g.admin }
}

const idOf = (value: unknown) => {
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : 0
}

/** GET /api/admin/taxonomy?tax=software[&options=1] — the tree (or flat picker options). */
export async function GET(req: NextRequest) {
  const g = await guard(req)
  if ('response' in g) return g.response
  if (req.nextUrl.searchParams.get('options')) return ok({ options: await termOptions(g.taxonomy) })
  return ok({ taxonomy: g.taxonomy, info: TAXONOMY_INFO[g.taxonomy], tree: await termTree(g.taxonomy) })
}

/** POST { ...term } creates; { action: 'reorder', moves } | { action: 'import' } | { action: 'recount' }. */
export async function POST(req: NextRequest) {
  const g = await guard(req)
  if ('response' in g) return g.response
  invalidateSectionBars()
  const body = (await req.json().catch(() => null)) || {}
  try {
    if (body.action === 'reorder') { await reorderTerms(g.taxonomy, body.moves); return ok({ tree: await termTree(g.taxonomy) }) }
    if (body.action === 'recount') { await recount(g.taxonomy); return ok({ tree: await termTree(g.taxonomy) }) }
    if (body.action === 'import') {
      const result = await importLegacy(g.taxonomy)
      await auditAdmin({ req, actor: g.admin, action: 'taxonomy.import', targetType: 'taxonomy', targetId: g.taxonomy, metadata: result })
      return ok({ ...result, tree: await termTree(g.taxonomy) })
    }
    const term = await saveTerm(g.taxonomy, body)
    await auditAdmin({ req, actor: g.admin, action: 'taxonomy.create', targetType: 'taxonomy-term', targetId: term.id, metadata: { taxonomy: g.taxonomy, name: term.name } })
    return ok({ term, tree: await termTree(g.taxonomy) }, 201)
  } catch (error) { return failure(error) }
}

/** PATCH { id, ...term } */
export async function PATCH(req: NextRequest) {
  const g = await guard(req)
  if ('response' in g) return g.response
  invalidateSectionBars()
  const body = (await req.json().catch(() => null)) || {}
  const id = idOf(body.id)
  if (!id) return err('invalid id')
  try {
    const term = await saveTerm(g.taxonomy, body, id)
    await auditAdmin({ req, actor: g.admin, action: 'taxonomy.update', targetType: 'taxonomy-term', targetId: id, metadata: { taxonomy: g.taxonomy } })
    return ok({ term, tree: await termTree(g.taxonomy) })
  } catch (error) { return failure(error) }
}

/** DELETE ?tax=software&id=12 — children move up one level. */
export async function DELETE(req: NextRequest) {
  const g = await guard(req)
  if ('response' in g) return g.response
  invalidateSectionBars()
  const id = idOf(req.nextUrl.searchParams.get('id'))
  if (!id) return err('invalid id')
  try {
    await deleteTerm(g.taxonomy, id)
    await auditAdmin({ req, actor: g.admin, action: 'taxonomy.delete', targetType: 'taxonomy-term', targetId: id, metadata: { taxonomy: g.taxonomy } })
    return ok({ tree: await termTree(g.taxonomy) })
  } catch (error) { return failure(error) }
}
