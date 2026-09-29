import type { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { auditAdmin } from '@/platform/audit/server'
import { requirePerm } from '@/modules/identity/server/access'
import { clearImageCache, imageStats, optimizeImages } from '@/modules/site/server/images'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  if (!await requirePerm(req, 'settings.manage')) return err('forbidden', 403)
  return ok(await imageStats())
}

/** POST {op:'optimize', cursor} | {op:'clear-cache'} */
export async function POST(req: NextRequest) {
  const admin = await requirePerm(req, 'settings.manage')
  if (!admin) return err('forbidden', 403)
  const body = (await req.json().catch(() => null)) || {}
  if (body.op === 'clear-cache') { await clearImageCache(); return ok({ cleared: true }) }
  if (body.op !== 'optimize') return err('عملیات نامعتبر است')
  const result = await optimizeImages({ cursor: body.cursor })
  if (result.changed) await auditAdmin({ req, actor: admin, action: 'images.optimize', targetType: 'images', targetId: String(body.cursor || 0), metadata: { changed: result.changed, saved: result.saved } })
  return ok(result)
}
