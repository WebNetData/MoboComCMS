import { db } from '@/platform/database/prisma'
import { FormsError, parseForm } from '../../domain/forms'
import type { RepairWorkView } from '../../domain/repair-work'
import { mayHandle } from '../advanced'
import { eligibleRepair, publicRepairText, REPAIR_SELECT, repairHash, repairPhone, type RepairClient, type RepairRow } from '../repair-access'

export type RepairActor = { id: number; builder: boolean; handler: boolean }
export const currentEstimate = (row: RepairRow, client: RepairClient = db) => row.estimateRevision ? client.repairEstimate.findUnique({ where: { submissionId_version: { submissionId: row.id, version: row.estimateRevision } } }) : Promise.resolve(null)
export async function requireRepair(id: number, actor: RepairActor, client: RepairClient = db) {
  const row = await client.formSubmission.findUnique({ where: { id }, select: REPAIR_SELECT })
  if (!eligibleRepair(row)) throw new FormsError('پروندهٔ تعمیر قابل پیگیری پیدا نشد', 404)
  if (!actor.builder && (!actor.handler || !mayHandle(parseForm(row.form), actor, false))) throw new FormsError('دسترسی این فرم را ندارید', 403)
  const canEdit = actor.builder || !row.assigneeId || row.assigneeId === actor.id
  if (!canEdit) throw new FormsError('این درخواست در دست همکار دیگری است', 403)
  return { row, canEdit: canEdit && !!row.receivedAt && row.payStatus !== 'UNPAID' && !['DONE', 'REJECTED'].includes(row.stage) }
}
export async function repairWorkView(row: RepairRow, client: RepairClient = db): Promise<RepairWorkView> {
  const [estimate, events] = await Promise.all([currentEstimate(row, client), client.repairEvent.findMany({ where: { submissionId: row.id }, orderBy: { id: 'desc' }, take: 101 })])
  const current = estimate && !estimate.supersededAt && estimate.contactHash === repairHash('contact', repairPhone(row.data)) && estimate.receiptHash === repairHash('receipt', row.receiptToken) ? estimate : null
  return { revision: row.repairVersion, dueAt: row.repairDueAt?.toISOString() || null, overdue: !!row.repairDueAt && row.repairDueAt.getTime() < Date.now() && !['DONE', 'REJECTED'].includes(row.stage),
    estimate: current ? { id: current.id, version: current.version, amountMinor: current.amountMinor.toString(), currency: 'IRT', description: publicRepairText(row, current.description), status: current.status as 'PENDING' | 'APPROVED' | 'REJECTED', createdAt: current.createdAt.toISOString(), expiresAt: current.expiresAt.toISOString(), decidedAt: current.decidedAt?.toISOString() || null, supersededAt: current.supersededAt?.toISOString() || null } : null,
    history: events.slice(0, 100).reverse().map(event => ({ id: event.id, kind: event.kind, label: publicRepairText(row, event.label, 120), detail: publicRepairText(row, event.detail, 2000), createdAt: event.createdAt.toISOString() })), historyTruncated: events.length > 100 }
}
export async function getRepairWork(id: number, actor: RepairActor) { const { row, canEdit } = await requireRepair(id, actor); return { ...await repairWorkView(row), canEdit } }
