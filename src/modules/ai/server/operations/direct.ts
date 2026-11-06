import type { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { moduleGuard } from '@/extensions/server/modules'
import { AiOperationError, operationText } from '../../domain/operations'
import { executeDirectProposal, operationsActor, operationsView, proposeOperations } from './service'
import { readOperationsPolicy } from './policy'

/** A direct request is explicit, bounded and replayable; it never upgrades an old review proposal. */
export async function runDirectOperations(req: NextRequest, input: Record<string, unknown>) {
  if (input.direct !== true || typeof input.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId)) throw new AiOperationError('اجرای مستقیم را برای همین درخواست انتخاب کنید؛ شناسهٔ درخواست معتبر لازم است')
  const instruction = operationText(input.instruction, 5, 4000), requestId = input.requestId.toLowerCase(), access = await operationsActor(req)
  if (!access) throw new AiOperationError('دسترسی ندارید', 403)
  const policy = await readOperationsPolicy()
  if (await moduleGuard('ai-assistant') || !policy.enabled || !access.tools.some(t => policy.allowed.includes(t) && policy.directAllowed.includes(t))) throw new AiOperationError('اجرای مستقیم برای ابزارهای شما فعال نیست', 403)
  const find = () => db.aiAssistantProposal.findMany({ where: { createdById: access.actor.id, batchId: requestId }, orderBy: { id: 'asc' } })
  let rows = await find()
  if (!rows.length) {
    try { await proposeOperations(req, instruction, requestId) }
    catch (e) { // The unique per-request action keys resolve concurrent persistence without planning a new batch.
      if (!['P2002', 'P2034'].includes(String((e as { code?: string }).code)) || !(await find()).length) throw e
    }
    rows = await find()
  }
  if (!rows.length || rows.some(row => row.instruction !== instruction || row.executionMode !== 'DIRECT')) throw new AiOperationError('شناسهٔ درخواست برای دستور دیگری استفاده شده است', 409)
  let stopped = false
  for (const row of rows) {
    if (row.status === 'APPLIED') continue
    try { await executeDirectProposal(req, row) }
    catch { stopped = true; break } // Keep exact persisted actions for review; never regenerate or silently replace them.
  }
  const current = await find(), applied = current.filter(row => row.status === 'APPLIED').length
  return { ...await operationsView(req), execution: { requestId, total: current.length, applied, stopped, message: stopped ? `${applied} اقدام انجام شد؛ اجرا متوقف شد. مجوز، سیاست یا نسخهٔ رکورد ممکن است تغییر کرده باشد؛ سوابق را بررسی و پیشنهاد باقی‌مانده را جداگانه بررسی کنید.` : `${applied} اقدام با انتخاب اجرای مستقیم شما ثبت شد.` } }
}
