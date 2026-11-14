import { db } from '@/platform/database/prisma'
import type { AuthedUser } from '@/modules/identity/server/access'
import { hasPermission } from '@/modules/identity/rbac'
import { normalizeSettings, stepLabel } from '@/modules/forms/domain/forms'
import { mayHandle } from '@/modules/forms/server/advanced'

/** Minimal queue projection includes custom workflow stages; never reads customer answers or device secrets. */
export async function formWorkdesk(actor: AuthedUser) {
  const builder = actor.permissions === null || hasPermission(actor.permissions, 'cms.pages')
  if (actor.role !== 'ADMIN' || (!builder && !hasPermission(actor.permissions || [], 'forms.handle'))) throw new Error('Form access denied')
  const forms = await db.siteForm.findMany({ select: { id: true, title: true, settings: true } })
  const allowed = forms.flatMap(form => {
    try {
      const settings = normalizeSettings(JSON.parse(form.settings || '{}'))
      return mayHandle({ settings }, actor, builder) ? [{ ...form, settings }] : []
    } catch { return [] }
  })
  const where = { formId: { in: allowed.map(form => form.id) }, status: { not: 'SPAM' }, payStatus: { not: 'UNPAID' }, stage: { notIn: ['', 'DONE', 'REJECTED'] }, ...(!builder ? { OR: [{ assigneeId: null }, { assigneeId: actor.id }] } : {}) }
  const [rows, count] = await Promise.all([
    db.formSubmission.findMany({ where, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 5, select: { id: true, formId: true, stage: true, createdAt: true, receivedAt: true, assigneeId: true } }),
    db.formSubmission.count({ where }),
  ])
  const byId = new Map(allowed.map(form => [form.id, form]))
  return { count, items: rows.map(row => ({ id: String(row.id), title: byId.get(row.formId)!.title, href: `/admin/forms?form=${row.formId}&tab=inbox`, updatedAt: (row.receivedAt || row.createdAt).toISOString(), assigneeId: row.assigneeId, detail: stepLabel(byId.get(row.formId)!.settings, row.stage) })) }
}
