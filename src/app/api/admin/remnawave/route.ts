import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { auditAdmin } from '@/platform/audit/server'
import { getExtensionState } from '@/extensions/server/state'
import { listRemnaPanels, remnaPanelOverview, remnaProvisioningQueue, repairRemnaSubscription, retryRemnaPaidOrder, runRemnaControl, scanRemnaPanel, syncRemnaSubscription } from '@/modules/providers/server/remnawave-control'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(req: NextRequest) {
  if (!await requirePerm(req, 'panels.manage')) return err('forbidden', 403)
  if (!(await getExtensionState('remnawave-control')).enabled) return err('control center is disabled', 409)
  const panels = await listRemnaPanels()
  const panelId = Number(req.nextUrl.searchParams.get('panelId'))
  if (!panelId) return ok({ panels })
  if (!panels.some(panel => panel.id === panelId)) return err('panel not found', 404)
  try {
    const [overview, queue] = await Promise.all([remnaPanelOverview(panelId), remnaProvisioningQueue(panelId)])
    const scan = req.nextUrl.searchParams.get('scan') === '1'
      ? await scanRemnaPanel(panelId, Number(req.nextUrl.searchParams.get('cursor')) || 0, Number(req.nextUrl.searchParams.get('limit')) || 10)
      : null
    return ok({ panels, overview, queue, scan })
  } catch { return err('panel diagnostics unavailable', 502) }
}

export async function POST(req: NextRequest) {
  const admin = await requirePerm(req, 'panels.manage')
  if (!admin) return err('forbidden', 403)
  if (!(await getExtensionState('remnawave-control')).enabled) return err('control center is disabled', 409)
  const body = await req.json().catch(() => null)
  const action = String(body?.action || '')
  const subscriptionId = Number(body?.subscriptionId)
  const orderId = Number(body?.orderId)
  try {
    if (action === 'run') {
      if (!await requirePerm(req, 'subs.manage')) return err('forbidden', 403)
      const result = await runRemnaControl()
      await auditAdmin({ req, actor: { id: admin.id, email: admin.email }, action: 'remnawave.run', targetType: 'Panel', targetId: 'all', metadata: { skipped: 'skipped' in result ? result.skipped : null } })
      return ok(result)
    }
    if (action === 'repair' || action === 'sync') {
      if (!await requirePerm(req, 'subs.manage')) return err('forbidden', 403)
      if (!Number.isInteger(subscriptionId) || subscriptionId <= 0) return err('invalid subscription', 400)
      const result = action === 'repair' ? await repairRemnaSubscription(subscriptionId) : await syncRemnaSubscription(subscriptionId)
      await auditAdmin({ req, actor: { id: admin.id, email: admin.email }, action: `remnawave.${action}`, targetType: 'Subscription', targetId: String(subscriptionId), metadata: action === 'repair' ? { repaired: 'repaired' in result ? result.repaired : [] } : {} })
      return ok(result)
    }
    if (action === 'retry') {
      if (!await requirePerm(req, 'orders.manage')) return err('forbidden', 403)
      if (!Number.isInteger(orderId) || orderId <= 0) return err('invalid order', 400)
      const result = await retryRemnaPaidOrder(orderId)
      await auditAdmin({ req, actor: { id: admin.id, email: admin.email }, action: 'remnawave.retry', targetType: 'Order', targetId: String(orderId), metadata: { ok: result.ok } })
      return result.ok ? ok(result) : err(result.message || 'retry failed', 409)
    }
    return err('unknown action', 400)
  } catch (error) { return err(error instanceof Error ? error.message : 'operation failed', 502) }
}
