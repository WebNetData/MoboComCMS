import { whenModuleOn } from '@/extensions/server/modules'
import { GET_admin, POST_admin } from '@/modules/prompts/server/http'
export const GET = whenModuleOn('prompt-master', GET_admin)
export const POST = whenModuleOn('prompt-master', POST_admin)
