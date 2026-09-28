import type { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { moduleGuard } from '@/extensions/server/modules'
import { membershipDashboard, vipPerksOverview } from '@/modules/membership/server/admin'

async function allowed(req: NextRequest) {
  return (await requirePerm(req, 'membership.manage')) || (await requirePerm(req, 'users.manage'))
}

/** GET /api/admin/membership/dashboard */
export async function GET_dashboard(req: NextRequest) {
  const off = await moduleGuard('membership')
  if (off) return off
  if (!await allowed(req)) return err('forbidden', 403)
  return ok(await membershipDashboard())
}

/** GET /api/admin/membership/perks */
export async function GET_perks(req: NextRequest) {
  const off = await moduleGuard('membership')
  if (off) return off
  if (!await allowed(req)) return err('forbidden', 403)
  return ok({ perks: await vipPerksOverview() })
}
