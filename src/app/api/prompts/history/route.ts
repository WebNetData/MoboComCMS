import { whenModuleOn } from '@/extensions/server/modules'
import { GET_history, POST_history } from '@/modules/prompts/server/http'
export const GET = whenModuleOn('prompt-master', GET_history)
export const POST = whenModuleOn('prompt-master', POST_history)
