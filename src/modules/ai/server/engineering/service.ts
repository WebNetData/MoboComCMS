import { randomUUID } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { requirePerm, getRawToken } from '@/modules/identity/server/access'
import { serverGate } from '@/modules/server-panel/server/gate'
import { moduleGuard } from '@/extensions/server/modules'
import { auditAdminStrict } from '@/platform/audit/server'
import { enqueue } from '@/modules/operations/server/enqueue'
import { ENGINEERING_ACTIVE, EngineeringError, engineeringText } from '../../domain/engineering'
import { readEngineeringPolicy } from './policy'
import { engineeringKnowledge } from './knowledge'
import { engineeringHost } from './host'
import { engineeringAuthority } from './authority'

export async function engineeringActor(req: NextRequest) {
  if (await moduleGuard('ai-assistant')) throw new EngineeringError('دستیار هوش مصنوعی غیرفعال است', 423)
  const gate = await serverGate(req)
  if ('response' in gate) { const value = await gate.response.json(); throw new EngineeringError(String(value.error || 'دسترسی پنل سرور لازم است'), gate.response.status, value.code) }
  const actor = await requirePerm(req, 'settings.manage')
  if (!actor || actor.id !== gate.user.id) throw new EngineeringError('مجوز تنظیمات و پنل سرور هر دو لازم‌اند', 403)
  return actor
}
export async function engineeringView(req: NextRequest) {
  const actor = await engineeringActor(req)
  const [policy, host, runs] = await Promise.all([readEngineeringPolicy(), engineeringHost('status'), db.aiEngineeringRun.findMany({ where: { createdById: actor.id }, orderBy: { createdAt: 'desc' }, take: 20 })])
  return { policy, host, approvalRequired: true, runs: runs.map(r => ({ id: r.id, instruction: r.instruction, mode: r.mode, status: r.status, revision: r.revision, report: r.report, result: JSON.parse(r.result), steps: r.steps, inputChars: r.inputChars, outputBudget: r.outputBudget, model: r.model, createdAt: r.createdAt.toISOString(), expiresAt: r.expiresAt.toISOString() })) }
}
export async function createEngineeringRun(req: NextRequest, input: Record<string, unknown>) {
  const actor = await engineeringActor(req), instruction = engineeringText(input.instruction, 8, 4000)
  if (typeof input.requestId !== 'string' || !/^[a-f\d-]{36}$/i.test(input.requestId) || input.requestId.length !== 36 || !['DEVELOP', 'DIAGNOSE', 'REPAIR'].includes(String(input.mode))) throw new EngineeringError('شناسه یا نوع درخواست معتبر نیست')
  const requestKey = `${actor.id}:${input.requestId}`, existing = await db.aiEngineeringRun.findUnique({ where: { requestKey } })
  if (existing) {
    const snapshot = JSON.parse(existing.snapshot)
    if (existing.instruction !== instruction || existing.mode !== input.mode || JSON.stringify(snapshot.skillIds) !== JSON.stringify(input.skillIds || [])) throw new EngineeringError('شناسهٔ درخواست قبلاً برای محتوای دیگری استفاده شده است', 409)
    return engineeringView(req)
  }
  const policy = await readEngineeringPolicy()
  if (!policy.enabled) throw new EngineeringError('ابتدا مهندسی هوشمند را از تنظیمات همین صفحه فعال کنید', 409)
  const host = await engineeringHost('status')
  if (!host.ready) throw new EngineeringError(host.diagnostics || 'محیط جدا هنوز آماده نشده است', 409)
  const knowledge = engineeringKnowledge(instruction, policy, input.skillIds || []), token = await getRawToken(req), authAt = typeof token?.authAt === 'number' ? token.authAt : null
  const grant = { createdById: actor.id, authAt, expiresAt: new Date(Date.now() + 24 * 3600000) }, id = randomUUID()
  await db.$transaction(async tx => {
    if (/^postgres(?:ql)?:/i.test(process.env.DATABASE_URL || '')) await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${actor.id} FOR UPDATE`
    await engineeringAuthority(grant, tx)
    if (await tx.aiEngineeringRun.count({ where: { createdById: actor.id, status: { in: ENGINEERING_ACTIVE } } })) throw new EngineeringError('ابتدا کار در حال اجرا را تمام یا متوقف کنید', 409)
    const row = await tx.aiEngineeringRun.create({ data: { id, ...grant, requestKey, instruction, mode: String(input.mode), snapshot: JSON.stringify({ policy, ...knowledge, skillIds: input.skillIds || [], files: [], history: '', manifest: [] }) } })
    await enqueue('ai.engineering', { runId: id }, { dedupeKey: `engineering:${id}:0` }, tx)
    await auditAdminStrict({ req, actor, action: 'ai.engineering.requested', targetType: 'ai-engineering', targetId: row.id, metadata: { mode: row.mode, bundleHash: knowledge.bundleHash, pins: knowledge.pins } }, tx)
  })
  return engineeringView(req)
}
export async function decideEngineeringRun(req: NextRequest, input: Record<string, unknown>) {
  const actor = await engineeringActor(req)
  if (typeof input.id !== 'string' || !Number.isInteger(input.revision)) throw new EngineeringError('نسخهٔ درخواست معتبر نیست')
  const row = await db.aiEngineeringRun.findUnique({ where: { id: input.id } })
  if (!row || row.createdById !== actor.id) throw new EngineeringError('این کار در حساب شما نیست', 404)
  const result = JSON.parse(row.result), cancel = input.action === 'cancel', rollback = input.action === 'rollback', repair = input.action === 'repair', operation = repair ? 'repair' : rollback ? 'rollback' : 'promote'
  if (cancel ? !['QUEUED', 'DEVELOPING', 'VALIDATING', 'PUBLISHING', 'PR_OPEN', 'REPAIR_READY', 'FAILED'].includes(row.status) : !(repair ? row.status === 'REPAIR_READY' : rollback ? row.status === 'DEPLOYED' : row.status === 'PR_OPEN')) throw new EngineeringError('این تصمیم با وضعیت فعلی کار سازگار نیست', 409)
  if (repair ? input.approved !== true || input.repairId !== result.repairId || input.diagnosticHash !== result.diagnosticHash || input.runtimeId !== result.runtimeId || !result.diagnosticHash : !cancel && (input.approved !== true || input.artifact !== result.artifact || input.headSha !== result.headSha || !result.artifact || !result.headSha)) throw new EngineeringError('گزارش و همین اقدام یا نسخه را بررسی و صریحاً تأیید کنید', 409)
  const status = cancel ? 'CANCELLED' : repair ? 'REPAIR_QUEUED' : rollback ? 'ROLLBACK_QUEUED' : 'DEPLOY_QUEUED'
  const token = await getRawToken(req), grant = { createdById: actor.id, authAt: typeof token?.authAt === 'number' ? token.authAt : null, expiresAt: new Date(Date.now() + 24 * 3600000) }
  await db.$transaction(async tx => {
    if (cancel) { if (!await requirePerm(req, 'server.manage', tx) || !await requirePerm(req, 'settings.manage', tx)) throw new EngineeringError('اختیار مدیر لغو شده است', 403) } else await engineeringAuthority(grant, tx)
    const changed = await tx.aiEngineeringRun.updateMany({ where: { id: row.id, createdById: actor.id, status: row.status, revision: Number(input.revision) }, data: { status, ...grant, revision: { increment: 1 }, leaseToken: null, leaseUntil: null, result: JSON.stringify(cancel ? result : { ...result, approval: { operation, artifact: result.artifact, headSha: result.headSha, repairId: result.repairId, diagnosticHash: result.diagnosticHash, runtimeId: result.runtimeId, at: Date.now() } }) } })
    if (!changed.count) throw new EngineeringError('کار هم‌زمان تغییر کرده است؛ ابتدا تازه کنید', 409)
    if (!cancel) await enqueue('ai.engineering', { runId: row.id }, { dedupeKey: `engineering:${row.id}:${row.revision + 1}` }, tx)
    await auditAdminStrict({ req, actor, action: `ai.engineering.${String(input.action)}`, targetType: 'ai-engineering', targetId: row.id, metadata: { headSha: result.headSha, artifact: result.artifact, status } }, tx)
  })
  if (cancel) await engineeringHost('cancel', { runId: row.id }).catch(() => undefined)
  return engineeringView(req)
}
