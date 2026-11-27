import type { Prisma } from '@prisma/client'
import type { NextRequest } from 'next/server'
import { isModuleEnabled } from '@/extensions/server/modules'
import { requirePerm } from '@/modules/identity/server/access'
import type { AuthedUser } from '@/modules/identity/server/access'
import { mayHandle } from '@/modules/forms/server/advanced'
import { parseForm } from '@/modules/forms/domain/forms'
import { canHandleDepartment } from '@/modules/support/domain/department-config'
import { heldByAnother } from '@/modules/support/server/department-access'
import type { OpportunitySource } from '@/modules/livechat/domain/crm-opportunities'
import { ChatError } from '@/modules/livechat/domain/livechat'

/**
 * Read the source through its owning module's permissions. A conversion takes
 * a row lock before the authority check so a concurrent handoff cannot change
 * who may turn that source into a sales opportunity.
 */
export async function authorizeOpportunitySource(
  req: NextRequest,
  actor: AuthedUser,
  tx: Prisma.TransactionClient,
  source: OpportunitySource,
  purpose: 'read' | 'preview' | 'convert',
): Promise<{ userId: number | null; href: string }> {
  if (!Number.isSafeInteger(source.id) || source.id <= 0 || source.id > 2147483647) throw new ChatError('منبع پیدا نشد', 404)
  if (source.type !== 'FORM' && source.type !== 'TICKET') throw new ChatError('منبع معتبر نیست')
  const moduleId = source.type === 'FORM' ? 'forms' : 'support'
  if (!await isModuleEnabled(moduleId, tx)) throw new ChatError('منبع در دسترس نیست', 404)

  if (source.type === 'FORM') {
    const builder = await requirePerm(req, 'cms.pages', tx)
    const staff = builder || await requirePerm(req, 'forms.handle', tx)
    if (!staff || staff.id !== actor.id) throw new ChatError('دسترسی به منبع مجاز نیست', 403)
    if (purpose === 'convert' && !process.env.DATABASE_URL?.startsWith('file:')) {
      await tx.$queryRaw`SELECT id FROM "FormSubmission" WHERE id = ${source.id} FOR UPDATE`
    }
    const row = await tx.formSubmission.findUnique({
      where: { id: source.id },
      select: { id: true, formId: true, userId: true, status: true, payStatus: true, assigneeId: true, form: true },
    })
    if (!row) throw new ChatError('منبع پیدا نشد', 404)
    if (!mayHandle(parseForm(row.form), staff, Boolean(builder)) ||
      (!builder && row.assigneeId !== null && row.assigneeId !== staff.id)) {
      throw new ChatError('دسترسی به منبع مجاز نیست', 403)
    }
    if (purpose !== 'read' && (row.status === 'SPAM' || row.payStatus === 'UNPAID')) {
      throw new ChatError('این پاسخ در وضعیت فعلی قابل تبدیل نیست', 409)
    }
    return { userId: row.userId, href: `/admin/forms?form=${row.formId}&tab=inbox&entry=${row.id}` }
  }

  const staff = await requirePerm(req, 'tickets.handle', tx)
  if (!staff || staff.id !== actor.id) throw new ChatError('دسترسی به منبع مجاز نیست', 403)
  if (purpose === 'convert' && !process.env.DATABASE_URL?.startsWith('file:')) {
    await tx.$queryRaw`SELECT id FROM "Ticket" WHERE id = ${source.id} FOR UPDATE`
  }
  const row = await tx.ticket.findUnique({ where: { id: source.id }, select: { id: true, userId: true, department: true, assignedToId: true } })
  if (!row) throw new ChatError('منبع پیدا نشد', 404)
  const department = await tx.ticketDepartment.findUnique({ where: { slug: row.department }, select: { roleIds: true } })
  if (!canHandleDepartment(staff, department) || (purpose !== 'read' && heldByAnother(staff, row.assignedToId))) {
    throw new ChatError('دسترسی به منبع مجاز نیست', 403)
  }
  return { userId: row.userId, href: `/admin/tickets?ticket=${row.id}` }
}
