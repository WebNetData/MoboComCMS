import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { requireUser } from '@/modules/identity/server/access'
import { isModuleEnabled } from '@/extensions/server/modules'
import { getActiveMembership } from '@/modules/membership/server/membership'
import { daysLeft } from '@/modules/membership/domain/membership'

/** GET /api/me/membership — the signed-in user's VIP status. */
export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return err('unauthorized', 401)
  if (!await isModuleEnabled('membership')) return ok({ enabled: false, member: false, endsAt: null, daysLeft: 0 })
  const membership = await getActiveMembership(user.id)
  return ok({ enabled: true, member: !!membership, endsAt: membership?.endsAt ?? null, daysLeft: daysLeft(membership?.endsAt) })
}
