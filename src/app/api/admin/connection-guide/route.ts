import { whenModuleOn } from '@/extensions/server/modules'
import * as handlers from '@/modules/site/server/http/admin/connection-guide/route'

export const GET = whenModuleOn('vpn', handlers.GET)
export const PATCH = whenModuleOn('vpn', handlers.PATCH)
export const dynamic = 'force-dynamic'
