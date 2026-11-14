import { db } from '@/platform/database/prisma'
import type { AuthedUser } from '@/modules/identity/server/access'
import { hasPermission } from '@/modules/identity/rbac'
import { normalizeSettings, stepLabel } from '@/modules/forms/domain/forms'
import { mayHandle } from '@/modules/forms/server/advanced'
import type { CustomerServiceHistory } from '@/modules/forms/domain/customer-history'

/** Minimal service context for CRM. Canonical user link only; answers, locks and receipt/pickup tokens are never selected. */
export async function customerServiceHistory(userId: number, actor?: AuthedUser): Promise<CustomerServiceHistory> {
  const empty: CustomerServiceHistory = { status: 'restricted', rows: [], hasMore: false }
  if (!Number.isSafeInteger(userId) || userId <= 0 || actor?.role !== 'ADMIN') return empty
  const builder = actor.permissions === null || hasPermission(actor.permissions, 'cms.pages')
  if (!builder && !hasPermission(actor.permissions || [], 'forms.handle')) return empty
  try {
    const forms = await db.siteForm.findMany({ where: { submissions: { some: { userId, status: { not: 'SPAM' } } } }, orderBy: { id: 'desc' }, take: 201, select: { id: true, title: true, settings: true } })
    const allowed = forms.slice(0, 200).flatMap(form => {
      try {
        const settings = normalizeSettings(JSON.parse(form.settings || '{}'))
        return settings.service && mayHandle({ settings }, actor, builder) ? [{ ...form, settings }] : []
      } catch { return [] } // Invalid scope configuration never broadens access.
    })
    if (!allowed.length) return { ...empty, status: 'available', hasMore: forms.length > 200 }
    const rows = await db.formSubmission.findMany({
      where: { userId, status: { not: 'SPAM' }, formId: { in: allowed.map(form => form.id) }, ...(!builder ? { OR: [{ assigneeId: null }, { assigneeId: actor.id }] } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 31,
      select: { id: true, formId: true, stage: true, status: true, createdAt: true, assigneeId: true },
    })
    const byId = new Map(allowed.map(form => [form.id, form]))
    const staff = await db.user.findMany({ where: { id: { in: [...new Set(rows.flatMap(row => row.assigneeId ? [row.assigneeId] : []))] } }, select: { id: true, name: true } })
    const names = new Map(staff.map(person => [person.id, person.name]))
    return { status: 'available', hasMore: rows.length > 30 || forms.length > 200,
      rows: rows.slice(0, 30).map(row => {
        const form = byId.get(row.formId)!
        return { id: row.id, title: form.title, stage: stepLabel(form.settings, row.stage), status: row.status, createdAt: row.createdAt.toISOString(), assignee: row.assigneeId ? names.get(row.assigneeId) || '' : '', href: `/admin/forms?form=${row.formId}&tab=inbox` }
      }),
    }
  } catch { return { ...empty, status: 'unavailable' } }
}
