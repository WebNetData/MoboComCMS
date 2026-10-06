import { whenModuleOn } from '@/extensions/server/modules'
import * as handlers from '@/modules/offers/server/http/admin/service-offers/route'

export const GET = whenModuleOn('vpn', handlers.GET)
export const POST = whenModuleOn('vpn', handlers.POST)
export const PATCH = whenModuleOn('vpn', handlers.PATCH)
