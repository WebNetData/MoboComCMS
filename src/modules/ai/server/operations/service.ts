import { randomUUID } from 'node:crypto'
import type { NextRequest } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { requirePerm } from '@/modules/identity/server/access'
import { moduleGuard } from '@/extensions/server/modules'
import { auditAdminStrict } from '@/platform/audit/server'
import { richTextToPlain } from '@/shared/content/sanitize'
import { AI_TOOLS, AiOperationError, operationModule, operationPrompt, operationText, parseOperation, parseOperationPlan, toolById } from '../../domain/operations'
import { readOperationsPolicy } from './policy'
import { operationPreview, operationsContext } from './context'
import { generate } from '../client'
import { withPersonalAi } from '../admin-context'
import { executeOperation } from './execute'

export async function operationsActor(req: NextRequest) {
  const tools: string[] = []; let actor: Awaited<ReturnType<typeof requirePerm>> = null
  for (const def of AI_TOOLS) { const found = await requirePerm(req, def.permission); if (found) { actor = found; const module = operationModule(def.id); if (!module || !await moduleGuard(module)) tools.push(def.id) } }
  const configure = await requirePerm(req, 'settings.manage')
  if (!actor && configure) actor = configure
  return actor ? { actor, tools, configure: !!configure } : null
}
const dto = (p: { id: number; batchId: string; tool: string; reason: string; preview: string; status: string; result: string; expiresAt: Date; updatedAt: Date; createdAt: Date }) => ({ id: p.id, batchId: p.batchId, tool: p.tool, reason: p.reason, preview: JSON.parse(p.preview), status: p.status, result: JSON.parse(p.result), expiresAt: p.expiresAt.toISOString(), updatedAt: p.updatedAt.toISOString(), createdAt: p.createdAt.toISOString() })
export async function operationsView(req: NextRequest) {
  const access = await operationsActor(req); if (!access) throw new AiOperationError('دسترسی به دستیار عملیاتی ندارید', 403)
  const policy = await readOperationsPolicy(), proposals = await db.aiAssistantProposal.findMany({ where: { createdById: access.actor.id, tool: { in: access.tools } }, orderBy: { id: 'desc' }, take: 30 })
  return { tools: AI_TOOLS.filter(t => access.tools.includes(t.id) && policy.allowed.includes(t.id)), proposals: proposals.map(dto), canConfigure: access.configure, policy: access.configure ? policy : { enabled: policy.enabled, maxProposals: policy.maxProposals }, approvalRequired: true }
}
export async function proposeOperations(req: NextRequest, raw: unknown) {
  const instruction = operationText(raw, 5, 4000), access = await operationsActor(req)
  if (!access) throw new AiOperationError('دسترسی ندارید', 403)
  const policy = await readOperationsPolicy(), allowed = access.tools.filter(t => policy.allowed.includes(t))
  if (!policy.enabled || !allowed.length) throw new AiOperationError('دستیار عملیاتی یا ابزارهای مجاز فعال نیستند', 409)
  const context = await operationsContext(allowed), result = await withPersonalAi(access.actor.id, () => generate(operationPrompt(instruction, allowed, context, policy.maxProposals)), 'operations')
  const actions = parseOperationPlan(result.text, allowed, policy.maxProposals)
  for (const op of actions) if (op.tool === 'post.create') op.args.excerpt = richTextToPlain(String(op.args.excerpt), 300)
  const previews = await Promise.all(actions.map(op => operationPreview(op)))
  const batchId = randomUUID(), expiresAt = new Date(Date.now() + 24 * 60 * 60_000)
  await db.$transaction(async tx => {
    const current = await readOperationsPolicy(tx)
    if (await moduleGuard('ai-assistant', tx) || !current.enabled || actions.some(op => !current.allowed.includes(op.tool))) throw new AiOperationError('سیاست دستیار تغییر کرده است؛ دوباره بررسی کنید', 409)
    for (let index = 0; index < actions.length; index++) {
      const op = actions[index]
      const module = operationModule(op.tool); if (module && await moduleGuard(module, tx)) throw new AiOperationError('بخش مربوط به پیشنهاد غیرفعال شده است', 409)
      if (!await requirePerm(req, toolById(op.tool)!.permission)) throw new AiOperationError('مجوز شما تغییر کرده است', 403)
      const row = await tx.aiAssistantProposal.create({ data: { createdById: access.actor.id, batchId, instruction, tool: op.tool, reason: op.reason, arguments: JSON.stringify(op.args), preview: JSON.stringify(previews[index].preview), snapshot: JSON.stringify(previews[index].snapshot), expiresAt, model: result.model } })
      await auditAdminStrict({ req, actor: access.actor, action: 'ai.operation.proposed', targetType: 'ai-proposal', targetId: row.id, metadata: { tool: op.tool } }, tx)
    }
  }, { isolationLevel: 'Serializable', timeout: 30_000 })
  return operationsView(req)
}
export async function decideOperation(req: NextRequest, input: Record<string, unknown>) {
  if (!Number.isSafeInteger(input.id) || Number(input.id) < 1 || typeof input.updatedAt !== 'string' || typeof input.action !== 'string' || !['approve', 'reject'].includes(input.action)) throw new AiOperationError('درخواست بررسی معتبر نیست')
  if (input.action === 'approve' && input.approved !== true) throw new AiOperationError('پیشنهاد را بررسی و اجرای همین موارد را تأیید کنید')
  const row = await db.aiAssistantProposal.findUnique({ where: { id: Number(input.id) } })
  if (!row || !toolById(row.tool)) throw new AiOperationError('پیشنهاد پیدا نشد', 404)
  const actor = await requirePerm(req, toolById(row.tool)!.permission)
  if (!actor || row.createdById !== actor.id) throw new AiOperationError('این پیشنهاد یا ابزار در دسترس شما نیست', 403)
  if (row.status === 'APPLIED' && input.action === 'approve') return operationsView(req)
  if (row.status !== 'PROPOSED' || row.updatedAt.toISOString() !== input.updatedAt || row.expiresAt.getTime() <= Date.now()) throw new AiOperationError('پیشنهاد منقضی، بررسی‌شده یا تغییرکرده است', 409)
  const op = parseOperation({ tool: row.tool, reason: row.reason, args: JSON.parse(row.arguments) })
  const guard = async (tx: Prisma.TransactionClient) => {
    const policy = await readOperationsPolicy(tx)
    if (await moduleGuard('ai-assistant', tx) || !policy.enabled || !policy.allowed.includes(op.tool)) throw new AiOperationError('اجرای این ابزار غیرفعال شده است', 409)
    const module = operationModule(op.tool); if (module && await moduleGuard(module, tx)) throw new AiOperationError('بخش مربوط به این ابزار غیرفعال شده است', 409)
    if (!await requirePerm(req, toolById(op.tool)!.permission)) throw new AiOperationError('مجوز اجرای این ابزار تغییر کرده است', 403)
    const claimed = await tx.aiAssistantProposal.updateMany({ where: { id: row.id, createdById: actor.id, status: 'PROPOSED', updatedAt: row.updatedAt, expiresAt: { gt: new Date() } }, data: { status: input.action === 'reject' ? 'REJECTED' : 'APPLIED', decidedAt: new Date() } })
    if (claimed.count !== 1) throw new AiOperationError('پیشنهاد هم‌زمان بررسی شد؛ نتیجهٔ ثبت‌شده را ببینید', 409)
  }
  const commit = async (tx: Prisma.TransactionClient, result: Record<string, unknown>) => {
    await tx.aiAssistantProposal.update({ where: { id: row.id }, data: { result: JSON.stringify(result) } })
    await auditAdminStrict({ req, actor, action: 'ai.operation.applied', targetType: 'ai-proposal', targetId: row.id, metadata: { tool: op.tool, entityId: result.id } }, tx)
  }
  try {
    if (input.action === 'reject') await db.$transaction(async tx => { await guard(tx); await auditAdminStrict({ req, actor, action: 'ai.operation.rejected', targetType: 'ai-proposal', targetId: row.id }, tx) }, { isolationLevel: 'Serializable' })
    else await executeOperation(req, actor, op, row.snapshot, guard, commit)
  } catch (e) {
    const applied = await db.aiAssistantProposal.findFirst({ where: { id: row.id, createdById: actor.id, status: 'APPLIED' } })
    if (input.action !== 'approve' || !applied) throw e
  }
  return operationsView(req)
}
