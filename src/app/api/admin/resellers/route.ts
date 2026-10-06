import { whenModuleOn } from '@/extensions/server/modules'
import * as handlers from '@/modules/reseller/server/http/admin/resellers/route'

export const GET = whenModuleOn('reseller', handlers.GET)
export const POST = whenModuleOn('reseller', handlers.POST)
export const PATCH = whenModuleOn('reseller', handlers.PATCH)
export const DELETE = whenModuleOn('reseller', handlers.DELETE)
export const dynamic = 'force-dynamic'
