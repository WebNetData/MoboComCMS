import { whenModuleOn } from '@/extensions/server/modules'
import { GET_proof } from '@/modules/businesses/server/proof-http'
export const runtime = 'nodejs'
export const GET = whenModuleOn('businesses', GET_proof)
