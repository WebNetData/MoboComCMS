import { whenModuleOn } from '@/extensions/server/modules'
import * as handlers from '@/modules/settings/server/http/admin/happ/route'

export const GET = whenModuleOn('vpn', handlers.GET)
export const dynamic = 'force-dynamic'
