import type { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { auditAdmin } from '@/platform/audit/server'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { FxError } from '@/modules/fx/domain/fx'
import {
  approvePending, fxOverview, previewFx, publicFxConfig, refreshRates, rejectPending, repriceProducts, saveFxConfig, setManualRate, setRateLock, testFxSource,
} from '@/modules/fx/server/fx'

/** Rates and foreign-currency pricing belong to the store managers. */
const PERMS = ['cms.products', 'orders.manage', 'settings.manage']

const failure = (error: unknown) => {
  if (error instanceof FxError) return err(error.message, 400)
  throw error
}

const bigintSafe = (value: unknown) => JSON.parse(JSON.stringify(value, (_key, item) => (typeof item === 'bigint' ? item.toString() : item)))

/** GET /api/admin/fx — rates, sources, history and FX-priced products. */
export async function GET(req: NextRequest) {
  const guard = await adminGuard(req, 'store', PERMS)
  if ('response' in guard) return guard.response
  return ok(bigintSafe(await fxOverview()))
}

/**
 * POST /api/admin/fx — { op }:
 *  config  → save source settings        refresh → fetch now
 *  test    → try a source without saving rate    → set by hand { code, rate, lock }
 *  lock    → { code, locked }            approve / reject → a held jump { code }
 *  reprice → recompute every FX product  preview → price breakdown for the editor
 */
export async function POST(req: NextRequest) {
  const guard = await adminGuard(req, 'store', PERMS)
  if ('response' in guard) return guard.response
  const body = (await req.json().catch(() => null)) || {}
  const op = String(body.op || '')
  const code = String(body.code || '').toUpperCase()
  const audit = (action: string, metadata: Record<string, unknown> = {}) => auditAdmin({ req, actor: guard.admin, action: `fx.${action}`, targetType: 'currency', targetId: code || '-', metadata })
  try {
    if (op === 'preview') return ok(await previewFx(body))
    if (op === 'config') {
      const config = await saveFxConfig(body.config || {})
      await audit('config', { provider: config.provider, currencies: config.currencies, intervalMinutes: config.intervalMinutes, maxJumpPercent: config.maxJumpPercent, roundToman: config.roundToman })
      return ok({ config: publicFxConfig(config) })
    }
    if (op === 'test') return ok(await testFxSource(body.config || {}))
    if (op === 'refresh') {
      const result = await refreshRates()
      await audit('refresh', { applied: result.applied, held: result.held, repriced: result.repriced })
      return ok(result)
    }
    if (op === 'rate') {
      const repriced = await setManualRate(code, Number(String(body.rate ?? '').replace(/[,٬\s]/g, '')), body.lock !== false)
      await audit('rate', { rate: body.rate, lock: body.lock !== false, repriced })
      return ok({ repriced })
    }
    if (op === 'lock') { await setRateLock(code, !!body.locked); await audit('lock', { locked: !!body.locked }); return ok({ locked: !!body.locked }) }
    if (op === 'approve') { const repriced = await approvePending(code); await audit('approve', { repriced }); return ok({ repriced }) }
    if (op === 'reject') { await rejectPending(code); await audit('reject'); return ok({ rejected: true }) }
    if (op === 'reprice') { const result = await repriceProducts(); await audit('reprice', { count: result.count }); return ok(result) }
    return err('عملیات نامعتبر است', 400)
  } catch (error) { return failure(error) }
}
