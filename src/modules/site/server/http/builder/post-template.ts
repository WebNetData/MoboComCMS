import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { auditAdmin } from '@/platform/audit/server'
import { getEntityTemplateId, setEntityTemplateId } from '@/modules/site/server/builder'
import { layoutDocById, listLayoutOptions } from '@/modules/site/server/theme-templates'
import { getJournalSettings } from '@/modules/journal/server/admin'
import { isStyleId, resolvePostStyle } from '@/modules/journal/domain/post-styles'

function readTarget(get: (key: string) => unknown): { entity: 'post' | 'product'; id: number } | null {
  for (const entity of ['post', 'product'] as const) {
    const raw = get(`${entity}Id`)
    if (raw === undefined || raw === null || raw === '') continue
    const id = Number(raw)
    return Number.isSafeInteger(id) && id > 0 ? { entity, id } : null
  }
  return null
}

const PERMISSION = { post: 'cms.posts', product: 'cms.products' } as const

/**
 * Per-post / per-product layout (WordPress-style): '' = automatic (theme builder
 * display rules), otherwise a single template, a built-in layout or a saved post template.
 */
export async function GET(req: NextRequest) {
  // The choices alone, for an article not saved yet and the magazine's style settings.
  if (req.nextUrl.searchParams.get('options') === 'post') {
    if (!await requirePerm(req, PERMISSION.post)) return err('forbidden', 403)
    return ok({ options: await listLayoutOptions('post') })
  }
  const target = readTarget((key) => req.nextUrl.searchParams.get(key))
  if (!target) return err('Invalid entry')
  if (!await requirePerm(req, PERMISSION[target.entity])) return err('forbidden', 403)
  const [templateId, options] = await Promise.all([getEntityTemplateId(target.entity, target.id), listLayoutOptions(target.entity)])
  return ok({
    ...target,
    templateId,
    options,
    // legacy shape used by older editor builds
    builtin: options.filter((entry) => entry.group === 'builtin'),
    mine: options.filter((entry) => entry.group !== 'builtin'),
  })
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const target = readTarget((key) => body?.[key])
  if (!target) return err('Invalid entry')
  const admin = await requirePerm(req, PERMISSION[target.entity])
  if (!admin) return err('forbidden', 403)
  const templateId = String(body?.templateId || '')
  const exists = target.entity === 'post' && isStyleId(templateId)
    ? !!resolvePostStyle(templateId, (await getJournalSettings(true)).postStyle)
    : !!await layoutDocById(target.entity, templateId)
  if (templateId && !exists) return err('Template not found', 404)
  try {
    await setEntityTemplateId(target.entity, target.id, templateId)
  } catch (e) {
    return err(e instanceof Error ? e.message : 'Invalid template')
  }
  await auditAdmin({ req, actor: admin, action: `${target.entity}.template.update`, targetType: target.entity === 'post' ? 'Post' : 'Product', targetId: target.id, metadata: { templateId } })
  return ok({ saved: true, ...target, templateId })
}
