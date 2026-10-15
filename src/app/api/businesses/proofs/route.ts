import { whenModuleOn } from '@/extensions/server/modules'
import { POST_proof } from '@/modules/businesses/server/proof-http'
export const runtime = 'nodejs'
export const POST = whenModuleOn('businesses', POST_proof)
