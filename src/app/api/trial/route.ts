import { whenModuleOn } from '@/extensions/server/modules'
import * as handlers from '@/modules/trials/server/http/trial/route'

export const GET = whenModuleOn('vpn', handlers.GET)
export const POST = whenModuleOn('vpn', handlers.POST)
