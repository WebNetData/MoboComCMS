import { whenModuleOn } from '@/extensions/server/modules'
import * as handlers from '@/modules/subscriptions/server/http/admin/subscriptions/route'

export const GET = whenModuleOn('vpn', handlers.GET)
export const PATCH = whenModuleOn('vpn', handlers.PATCH)
