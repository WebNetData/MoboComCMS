import { createHash } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import type { NextRequest } from 'next/server'
import { getExtensionState } from '@/extensions/server/state'
import { staffTemplate } from '@/modules/identity/domain/staff-roles'
import { ROLE_PRESETS } from '@/modules/identity/rbac'
import { requirePerm } from '@/modules/identity/server/access'
import { roleRefusal } from '@/modules/identity/server/role-policy'
import { auditAdminStrict } from '@/platform/audit/server'

export type SolutionRoleBinding = { template: string; roleId: number }
export type SolutionRoleItem = { template: string; title: string; roleId?: number; action: 'create' | 'preserve' | 'removed'; owned: boolean }
export type SolutionRolePlan = { revision: string; items: SolutionRoleItem[] }

export class SolutionRoleError extends Error {
  constructor(message: string, public readonly status: 400 | 403 = 400) { super(message); this.name = 'SolutionRoleError' }
}

/** Preview never grants permissions or changes a role; every read uses the caller's transaction. */
export async function planSolutionRoles(req: NextRequest, templates: string[], bindings: SolutionRoleBinding[], tx: Prisma.TransactionClient, plannedModules: ReadonlySet<string> = new Set()): Promise<SolutionRolePlan> {
  const actor = await requirePerm(req, 'roles.manage', tx)
  if (!actor) throw new SolutionRoleError('دسترسی مدیریت نقش‌ها لازم است.', 403)
  if (!Array.isArray(templates) || templates.length > 20 || new Set(templates).size !== templates.length || !Array.isArray(bindings)) throw new SolutionRoleError('فهرست نقش‌های بسته معتبر نیست.')
  if (bindings.some(binding => !binding || typeof binding.template !== 'string' || !Number.isSafeInteger(binding.roleId) || binding.roleId <= 0) || new Set(bindings.map(binding => binding.template)).size !== bindings.length || new Set(bindings.map(binding => binding.roleId)).size !== bindings.length) throw new SolutionRoleError('سابقهٔ نقش‌های بسته معتبر نیست.')
  const byTemplate = new Map(bindings.map(binding => [binding.template, binding.roleId]))
  const items: SolutionRoleItem[] = []
  const evidence: unknown[] = []
  for (const id of templates) {
    const template = typeof id === 'string' ? staffTemplate(id) : undefined
    if (!template || template.fullAccess || id === 'admin' || id === 'site-deputy' || !ROLE_PRESETS[id]) throw new SolutionRoleError(`الگوی نقش «${id}» مجاز نیست.`)
    let moduleEnabled: boolean | null = null
    if (template.module) {
      try { moduleEnabled = (await getExtensionState(template.module, [], tx, true)).enabled }
      catch { throw new SolutionRoleError(`وضعیت ماژول «${template.module}» خوانا نیست.`) }
      if (!moduleEnabled && !plannedModules.has(template.module)) throw new SolutionRoleError(`ابتدا ماژول «${template.module}» را فعال یا در بسته مشخص کنید.`)
    }
    const permissions = ROLE_PRESETS[id].join(',')
    const binding = byTemplate.get(id)
    const role = binding === undefined
      ? await tx.role.findUnique({ where: { name: id } })
      : await tx.role.findUnique({ where: { id: binding } })
    const action = role ? 'preserve' : binding !== undefined ? 'removed' : 'create'
    if (action === 'create') {
      const refusal = roleRefusal(actor, permissions)
      if (refusal) throw new SolutionRoleError(refusal, 403)
    }
    items.push({ template: id, title: template.title, ...(role ? { roleId: role.id } : binding !== undefined ? { roleId: binding } : {}), action, owned: binding !== undefined })
    evidence.push({ template, permissions, binding: binding ?? null, role, moduleEnabled })
  }
  const revision = createHash('sha256').update(JSON.stringify({ actor: { id: actor.id, role: actor.role, roleId: actor.roleId, permissions: actor.permissions }, evidence })).digest('hex')
  return { revision, items }
}

/** Create missing canonical templates only; the outer command owns serializable retries and receipt. */
export async function applySolutionRoles(req: NextRequest, templates: string[], bindings: SolutionRoleBinding[], tx: Prisma.TransactionClient): Promise<SolutionRolePlan> {
  const plan = await planSolutionRoles(req, templates, bindings, tx)
  const actor = await requirePerm(req, 'roles.manage', tx)
  if (!actor) throw new SolutionRoleError('دسترسی مدیریت نقش‌ها لازم است.', 403)
  for (const item of plan.items) {
    if (item.action !== 'create') continue
    const template = staffTemplate(item.template)!
    const permissions = ROLE_PRESETS[item.template].join(',')
    const refusal = roleRefusal(actor, permissions)
    if (refusal) throw new SolutionRoleError(refusal, 403)
    const role = await tx.role.create({ data: { name: template.id, nameFa: template.title, nameEn: template.id, permissions, isSystem: false } })
    await auditAdminStrict({ req, actor, action: 'role.create', targetType: 'role', targetId: role.id, metadata: { name: role.name, permissions: role.permissions, template: template.id, source: 'solution-pack' } }, tx)
    item.roleId = role.id; item.owned = true
  }
  return plan
}
