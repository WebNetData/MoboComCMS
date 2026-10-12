import { whenModuleOn } from '@/extensions/server/modules'
import { GET as get, POST as post } from '@/modules/businesses/server/http'
export const GET = whenModuleOn('businesses', get)
export const POST = whenModuleOn('businesses', post)
