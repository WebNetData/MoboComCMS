import type { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { auditAdmin } from '@/platform/audit/server'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { optimizationOverview, probePage, purgeAll, purgePrefix, resetPageCacheStats, savePageCacheConfig, warmPages } from '@/modules/performance/server/optimization'

const PERMS = ['performance.manage', 'settings.manage']

/** GET /api/admin/optimization — settings, presets and live cache numbers. */
export async function GET(req: NextRequest) {
  const guard = await adminGuard(req, 'performance', PERMS)
  if ('response' in guard) return guard.response
  return ok(await optimizationOverview())
}

/** POST /api/admin/optimization — { op: config | purge | warm | probe | reset } */
export async function POST(req: NextRequest) {
  const guard = await adminGuard(req, 'performance', PERMS)
  if ('response' in guard) return guard.response
  const body = (await req.json().catch(() => null)) || {}
  const audit = (action: string, metadata: Record<string, unknown> = {}) => auditAdmin({ req, actor: guard.admin, action: `optimization.${action}`, targetType: 'settings', targetId: 'pagecache', metadata })
  try {
    if (body.op === 'config') {
      const config = await savePageCacheConfig(body.config || {})
      await audit('config', { mode: config.mode, ttl: config.ttl, include: config.include.length, exclude: config.exclude.length })
      return ok({ config })
    }
    if (body.op === 'purge') {
      const prefix = typeof body.prefix === 'string' && body.prefix.startsWith('/') ? body.prefix.slice(0, 120) : ''
      const removed = prefix ? purgePrefix(prefix) : await purgeAll('admin')
      await audit('purge', { prefix, removed })
      return ok({ removed })
    }
    if (body.op === 'warm') {
      const result = await warmPages({ force: true })
      await audit('warm', { pages: result.pages })
      return ok(result)
    }
    if (body.op === 'probe') {
      const host = req.headers.get('host') || req.nextUrl.host
      return ok(await probePage(String(body.path || '/'), host))
    }
    if (body.op === 'reset') { resetPageCacheStats(); return ok({ reset: true }) }
    return err('عملیات نامعتبر است', 400)
  } catch (error) {
    return err(error instanceof Error ? error.message : 'انجام نشد', 400)
  }
}
