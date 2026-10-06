import { whenModuleOn } from '@/extensions/server/modules'
import * as handlers from '@/modules/support/server/http/admin/incidents/route'

// Incidents are announced on subscription cards per server panel: part of the VPN service.
export const GET = whenModuleOn('vpn', handlers.GET)
export const POST = whenModuleOn('vpn', handlers.POST)
export const PATCH = whenModuleOn('vpn', handlers.PATCH)
export const dynamic = 'force-dynamic'
