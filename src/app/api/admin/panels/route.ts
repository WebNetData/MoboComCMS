import { whenModuleOn } from '@/extensions/server/modules'
import * as handlers from '@/modules/providers/server/http/admin/panels/route'

export const GET = whenModuleOn('vpn', handlers.GET)
export const POST = whenModuleOn('vpn', handlers.POST)
export const PATCH = whenModuleOn('vpn', handlers.PATCH)
export const DELETE = whenModuleOn('vpn', handlers.DELETE)
export const PUT = whenModuleOn('vpn', handlers.PUT)
