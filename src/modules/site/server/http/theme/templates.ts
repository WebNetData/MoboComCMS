import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { auditAdmin, auditAdminStrict } from '@/platform/audit/server'
import { permFor } from '@/modules/site/server/builder'
import { moduleGuard } from '@/extensions/server/modules'
import {
  createThemeTemplate, deleteThemeTemplate, duplicateThemeTemplate, getPostCategoryOptions, getProductCategoryOptions,
  getThemeTemplate, listThemeTemplates, updateThemeTemplate, ThemeIndexError,
} from '@/modules/site/server/theme-templates'
import { THEME_TEMPLATE_TYPES, TYPE_CODE, validatePlacement, type ThemeTemplateType } from '@/modules/site/domain/theme-templates'
import { SURFACE_PRESETS } from '@/modules/site/domain/builder-surface-presets'
import { isBuilderSurface } from '@/modules/site/domain/builder-surfaces'
import { POST_TEMPLATES, PRODUCT_TEMPLATES, THEME_PRESETS, type BundledTemplate } from '@/modules/site/domain/builder-templates'

const TYPE_PERMISSION = (type: ThemeTemplateType) => permFor(`tpl-${TYPE_CODE[type]}-xxxx`)

/** Starting points for a new template of each type. */
function presetsFor(type: ThemeTemplateType): BundledTemplate[] {
  if (type === 'single-post') return POST_TEMPLATES
  if (type === 'surface') return SURFACE_PRESETS
  if (type === 'single-product') return PRODUCT_TEMPLATES
  return THEME_PRESETS[type]
}

const PLACEMENT_PERMISSION = { home: 'settings.manage', blog: 'cms.posts', shop: 'cms.products', section: 'cms.pages', none: 'cms.pages' } as const

async function anyBuilderUser(req: NextRequest) {
  for (const permission of ['cms.pages', 'cms.posts', 'cms.products', 'settings.manage']) {
    const user = await requirePerm(req, permission)
    if (user) return user
  }
  return null
}

export async function GET(req: NextRequest) {
  const off = await moduleGuard('page-builder')
  if (off) return off
  if (!await anyBuilderUser(req)) return err('forbidden', 403)
  const [templates, postCategories, productCategories] = await Promise.all([listThemeTemplates(), getPostCategoryOptions(), getProductCategoryOptions()])
  const canEdit = await Promise.all(THEME_TEMPLATE_TYPES.map(type => requirePerm(req, TYPE_PERMISSION(type))))
  const editableTypes = THEME_TEMPLATE_TYPES.filter((_type, index) => !!canEdit[index])
  const presets = Object.fromEntries(THEME_TEMPLATE_TYPES.map((type) => [type, presetsFor(type).map((entry) => ({
    id: entry.id, fa: entry.fa, en: entry.en, descFa: entry.descFa, descEn: entry.descEn, sections: entry.doc.sections.length,
  }))]))
  return ok({ editableTypes, templates: templates.filter(meta => meta.type !== 'single-post' || meta.generation === 1), postCategories, productCategories, presets })
}

export async function POST(req: NextRequest) {
  const off = await moduleGuard('page-builder')
  if (off) return off
  const body = await req.json().catch(() => null)
  if (body?.action === 'duplicate') {
    const source = await getThemeTemplate(String(body?.id || ''))
    if (!source) return err('Template not found', 404)
    const admin = await requirePerm(req, TYPE_PERMISSION(source.type))
    if (!admin) return err('forbidden', 403)
    if (source.type === 'single-post' && source.generation !== 1) return err('قالب نوشته بازنشسته شده است؛ از استایل صفحه استفاده کنید', 410)
    try {
      const meta = await duplicateThemeTemplate(source.id, { id: admin.id, email: admin.email })
      await auditAdmin({ req, actor: admin, action: 'theme.template.duplicate', targetType: 'Setting', targetId: meta.id, metadata: { from: source.id } })
      return ok({ template: meta })
    } catch (e) {
      return err(e instanceof Error ? e.message : 'Could not duplicate')
    }
  }
  const type = THEME_TEMPLATE_TYPES.find((entry) => entry === body?.type)
  if (!type) return err('Invalid template type')
  const admin = await requirePerm(req, TYPE_PERMISSION(type))
  if (!admin) return err('forbidden', 403)
  if (type === 'surface' && !isBuilderSurface(body?.surface)) return err('نوع بخش را انتخاب کنید')
  const presetId = String(body?.preset || (type === 'surface' ? body?.surface === 'dashboard' ? 'surface-dashboard' : 'surface-entry' : ''))
  const preset = presetId ? presetsFor(type).find((entry) => entry.id === presetId) : null
  if (presetId && !preset) return err('Preset not found', 404)
  try {
    const meta = await createThemeTemplate({ type, name: String(body?.name || ''), nameEn: String(body?.nameEn || ''), doc: preset?.doc || null, solution: preset?.module, surface: isBuilderSurface(body?.surface) ? body.surface : undefined }, { id: admin.id, email: admin.email }, async (tx, created) => { await auditAdminStrict({ req, actor: admin, action: 'theme.template.create', targetType: 'Setting', targetId: created.id, metadata: { type, preset: presetId || 'blank' } }, tx) })
    return ok({ template: meta })
  } catch (e) {
    return err(e instanceof Error ? e.message : 'Could not create the template')
  }
}

export async function PATCH(req: NextRequest) {
  const off = await moduleGuard('page-builder')
  if (off) return off
  const body = await req.json().catch(() => null)
  const existing = await getThemeTemplate(String(body?.id || ''))
  if (!existing) return err('Template not found', 404)
  const admin = await requirePerm(req, TYPE_PERMISSION(existing.type))
  if (!admin) return err('forbidden', 403)
  const patch: Record<string, unknown> = {}
  for (const key of ['name', 'nameEn', 'status', 'conditions', 'placement', 'priority', 'sticky', 'expectedUpdatedAt']) if (body && key in body) patch[key] = body[key]
  if (existing.type === 'page' && 'placement' in patch) {
    let placement
    try { placement = validatePlacement(patch.placement) } catch (e) { return err(e instanceof Error ? e.message : 'Invalid placement') }
    if (!await requirePerm(req, PLACEMENT_PERMISSION[placement.kind])) return err('forbidden', 403)
  }
  try {
    const meta = await updateThemeTemplate(existing.id, patch, async (tx, updated) => { await auditAdminStrict({ req, actor: admin, action: 'theme.template.update', targetType: 'Setting', targetId: updated.id, metadata: { status: updated.status, conditions: updated.conditions.length, placement: updated.placement.kind } }, tx) })
    return ok({ template: meta })
  } catch (e) {
    return err(e instanceof Error ? e.message : 'Could not update the template', e instanceof ThemeIndexError ? 409 : 400)
  }
}

export async function DELETE(req: NextRequest) {
  const off = await moduleGuard('page-builder')
  if (off) return off
  const id = String(req.nextUrl.searchParams.get('id') || '')
  const existing = await getThemeTemplate(id)
  if (!existing) return err('Template not found', 404)
  const admin = await requirePerm(req, TYPE_PERMISSION(existing.type))
  if (!admin) return err('forbidden', 403)
  await deleteThemeTemplate(id)
  await auditAdmin({ req, actor: admin, action: 'theme.template.delete', targetType: 'Setting', targetId: id, metadata: { type: existing.type, name: existing.name } })
  return ok({ deleted: true })
}
