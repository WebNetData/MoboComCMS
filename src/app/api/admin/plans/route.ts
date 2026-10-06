import { whenModuleOn } from '@/extensions/server/modules'
import * as handlers from '@/modules/catalog/server/http/admin/plans/route'

export const GET = whenModuleOn('vpn', handlers.GET)
export const POST = whenModuleOn('vpn', handlers.POST)
export const PATCH = whenModuleOn('vpn', handlers.PATCH)
export const DELETE = whenModuleOn('vpn', handlers.DELETE)
