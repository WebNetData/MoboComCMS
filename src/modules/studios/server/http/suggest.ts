import type { NextRequest } from 'next/server'
import { requireContentScope } from '@/modules/identity/server/access'
import { isModuleEnabled } from '@/extensions/server/modules'
import { rateLimitHit } from '@/platform/http/rate-limit'
import { err, ok } from '@/platform/http/response'
import { suggestStudios } from '@/modules/studios/server/admin'

/**
 * Suggestions for the developer and publisher fields of a game or software form. Studios are nobody's own items: a
 * section author only reads names and logos, through the scope guard of a section that is on; changing a studio's
 * profile stays with /api/admin/studios.
 */
export async function GET_suggest(req: NextRequest) {
  let scope = null
  if (await isModuleEnabled('games')) scope = await requireContentScope(req, 'games.manage', 'games.author')
  if (!scope && await isModuleEnabled('software')) scope = await requireContentScope(req, 'software.manage', 'software.author')
  if (!scope) return err('forbidden', 403)
  if (!rateLimitHit(`studios.suggest:${scope.admin.id}`, 240, 60_000).ok) return err('تعداد درخواست زیاد است؛ کمی صبر کنید', 429)
  const response = ok(await suggestStudios(req.nextUrl.searchParams.get('q')))
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}
