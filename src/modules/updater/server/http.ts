import type { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { rateLimitHit } from '@/platform/http/rate-limit'
import { auditAdmin } from '@/platform/audit/server'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { UpdateError } from '@/modules/updater/domain/updater'
import { runBackupWorker } from '@/modules/notifications/server/backup-scheduler'
import { migrateNow, runProgress, startUpdate, status, triggerHook } from './service'
import { serverGate } from '@/modules/server-panel/server/gate'
import { deletePackage, startPackage } from './packages'
import { JsonBodyError, readJsonObject } from '@/platform/http/read-json'

const failure = (error: unknown) => { if (error instanceof UpdateError) return err(error.message, error.status); throw error }

/** GET → the update status; ?view=progress → only the running update's progress (polled while updating); ?refresh=1 asks the feed again. */
export async function GET(req: NextRequest) {
  const guard = await adminGuard(req, null, ['settings.manage'])
  if ('response' in guard) return guard.response
  try {
    if (req.nextUrl.searchParams.get('view') === 'progress') return ok(runProgress())
    return ok(await status(req.nextUrl.searchParams.get('refresh') === '1'))
  } catch (error) { return failure(error) }
}

/** POST { op: 'apply' | 'hook' | 'migrate' | 'backup' } */
export async function POST(req: NextRequest) {
  const panel = await serverGate(req)
  if ('response' in panel) return panel.response
  const guard = await adminGuard(req, null, ['settings.manage'])
  if ('response' in guard) return guard.response
  if (!rateLimitHit(`updates:${guard.admin.id}`, 20, 60_000).ok) return err('درخواست‌ها زیاد است', 429)
  let body: Record<string, unknown>
  try { body = await readJsonObject(req, 8192) } catch (error) { if (error instanceof JsonBodyError) return err(error.message, error.status); throw error }
  const op = String(body?.op || '')
  const audit = (action: string, metadata: Record<string, unknown> = {}) => auditAdmin({ req, actor: guard.admin, action: `updates.${action}`, targetType: 'system', targetId: 'updates', metadata })
  try {
    switch (op) {
      case 'package': { const id = String(body?.id || ''); const result = await startPackage(id, body?.backupConfirmed === true); await audit('package-apply', { id, version: result.version }); return ok(result) }
      case 'package-delete': { const id = String(body?.id || ''); const result = await deletePackage(id); await audit('package-delete', { id }); return ok(result) }
      case 'apply': { const ref = String(body?.ref || ''); const result = await startUpdate(ref, { backupConfirmed: body?.backupConfirmed === true }); await audit('apply', { ref }); return ok(result) }
      case 'hook': { const result = await triggerHook(); await audit('hook'); return ok(result) }
      case 'migrate': { const result = await migrateNow(); await audit('migrate'); return ok(result) }
      case 'backup': return ok({ started: runBackupWorker(true) })
      default: return err('عملیات نامعتبر است')
    }
  } catch (error) { return failure(error) }
}
