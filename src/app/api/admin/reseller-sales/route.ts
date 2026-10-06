import { whenModuleOn } from '@/extensions/server/modules'
import * as handlers from '@/modules/reseller/server/http/admin/reseller-sales/route'

export const GET = whenModuleOn('reseller', handlers.GET)
