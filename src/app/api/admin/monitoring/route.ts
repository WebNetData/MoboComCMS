import { NextRequest } from 'next/server'
import { requirePerm } from '@/modules/identity/server/access'
import { err, ok } from '@/platform/http/response'
import { getExtensionState } from '@/extensions/server/state'
import { getMonitoringLastRun, runOperationsMonitor, sampleMonitoring } from '@/modules/notifications/server/operations-monitor'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!await requirePerm(req, 'settings.manage')) return err('forbidden', 403)
  const extension = await getExtensionState('operations-monitor')
  if (!extension.enabled) return err('monitoring plugin is disabled', 409)
  try {
    const [report, lastRun] = await Promise.all([sampleMonitoring(extension.settings), getMonitoringLastRun()])
    return ok({ report, lastRun })
  }
  catch { return err('monitoring unavailable', 503) }
}

export async function POST(req: NextRequest) {
  if (!await requirePerm(req, 'settings.manage')) return err('forbidden', 403)
  try {
    const result = await runOperationsMonitor()
    if ('skipped' in result) return err('monitoring plugin is disabled', 409)
    return ok(result)
  } catch { return err('monitoring check failed', 503) }
}
