import { whenModuleOn } from '@/extensions/server/modules'
import * as handlers from '@/modules/trials/server/http/admin/trial/route'

export const GET = whenModuleOn('vpn', handlers.GET)
export const PATCH = whenModuleOn('vpn', handlers.PATCH)
