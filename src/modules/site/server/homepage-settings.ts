import type { NextRequest } from 'next/server'
import type { Prisma } from '@prisma/client'
import { requirePerm } from '@/modules/identity/server/access'
import { isModuleEnabled, moduleGuard, getModuleStates } from '@/extensions/server/modules'
import { auditAdminStrict } from '@/platform/audit/server'
import { SPECIALIST_HOMES } from '../domain/specialist-homes'
import { createThemeTemplate, mutateThemeIndex, readThemeIndex, ThemeIndexError } from './theme-templates'
import { builderKey } from './builder'
import { parseBuilderDoc } from '../domain/builder'
import { closedSectionPlugins } from './maintenance'

async function manager(req: NextRequest, tx?: Prisma.TransactionClient) {
  const actor = await requirePerm(req, 'settings.manage', tx)
  if (!actor || !await requirePerm(req, 'cms.pages', tx)) throw new ThemeIndexError('مجوز تنظیمات و مدیریت صفحات لازم است', 403)
  if (await moduleGuard('page-builder', tx)) throw new ThemeIndexError('صفحه‌ساز غیرفعال است', 404)
  return actor
}
export async function homepageSettings(req: NextRequest) {
  await manager(req)
  const [{ list, revision }, modules, closed] = await Promise.all([readThemeIndex(), getModuleStates(), closedSectionPlugins()])
  return { revision, templates: list.filter(t => t.type === 'page'), selectedId: list.find(t => t.type === 'page' && t.status === 'published' && t.placement.kind === 'home')?.id || null, presets: SPECIALIST_HOMES.map(({ id, fa, descFa, module, doc }) => ({ id, name: fa, description: descFa, module, sections: doc.sections.length })), modules: Object.fromEntries(SPECIALIST_HOMES.map(p => [p.module, modules[p.module] !== false && !closed.has(p.module)])) }
}
export async function createHomepageDraft(req: NextRequest, presetId: unknown) {
  const actor = await manager(req), preset = SPECIALIST_HOMES.find(p => p.id === presetId)
  if (!preset) throw new ThemeIndexError('طرح پیدا نشد', 404)
  const template = await createThemeTemplate({ type: 'page', name: preset.fa, doc: preset.doc, solution: preset.module }, actor, async (tx, meta) => {
    await manager(req, tx)
    await auditAdminStrict({ req, actor, action: 'site.homepage.draft', targetType: 'theme-template', targetId: meta.id, metadata: { preset: preset.id } }, tx)
  })
  return { ...await homepageSettings(req), createdId: template.id }
}
export async function selectHomepage(req: NextRequest, input: Record<string, unknown>) {
  if (typeof input.revision !== 'string' || (input.templateId !== null && typeof input.templateId !== 'string')) throw new ThemeIndexError('درخواست انتخاب طرح معتبر نیست', 400)
  await manager(req)
  await mutateThemeIndex(async (list, tx, revision) => {
    const actor = await manager(req, tx)
    if (revision !== input.revision) throw new ThemeIndexError('قالب‌ها تغییر کرده‌اند؛ فهرست را تازه کنید')
    const chosen = input.templateId === null ? null : list.find(t => t.id === input.templateId && t.type === 'page')
    if (input.templateId !== null && !chosen) throw new ThemeIndexError('صفحه پیدا نشد', 404)
    if (chosen) {
      if (!['none', 'home'].includes(chosen.placement.kind)) throw new ThemeIndexError('برای حفظ جایگاه قبلی، ابتدا از این قالب نسخهٔ کپی بسازید')
      if (chosen.solution && (!await isModuleEnabled(chosen.solution, tx) || (await closedSectionPlugins()).has(chosen.solution))) throw new ThemeIndexError('بخش این طرح غیرفعال یا در حال نگهداری است')
      const row = await tx.setting.findUnique({ where: { key: builderKey(chosen.id) } })
      if (!row || !parseBuilderDoc(JSON.parse(row.value)).sections.length) throw new ThemeIndexError('طرح خالی یا نامعتبر را نمی‌توان صفحهٔ اول کرد')
    }
    const before = list.find(t => t.type === 'page' && t.status === 'published' && t.placement.kind === 'home')?.id || null
    for (const meta of list) {
      if (meta.type === 'page' && meta.placement.kind === 'home') { meta.placement = { ...meta.placement, kind: 'none', slug: '', postCategoryId: null, productCategoryId: null }; meta.updatedAt = new Date().toISOString() }
      if (meta === chosen) { meta.status = 'published'; meta.placement = { ...meta.placement, kind: 'home', slug: '', postCategoryId: null, productCategoryId: null }; meta.updatedAt = new Date().toISOString() }
    }
    await auditAdminStrict({ req, actor, action: 'site.homepage.select', targetType: 'theme-template', targetId: chosen?.id || 'default', metadata: { before, after: chosen?.id || null } }, tx)
  })
  return homepageSettings(req)
}
