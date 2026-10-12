import { whenModuleOn } from '@/extensions/server/modules'
import { GET_admin, POST_admin } from '@/modules/businesses/server/http'
export const GET = whenModuleOn('businesses', GET_admin)
export const POST = whenModuleOn('businesses', POST_admin)
