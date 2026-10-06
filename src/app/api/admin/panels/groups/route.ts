import { whenModuleOn } from '@/extensions/server/modules'
import * as handlers from '@/modules/providers/server/http/admin/panels/groups/route'

export const POST = whenModuleOn('vpn', handlers.POST)
