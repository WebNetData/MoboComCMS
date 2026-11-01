import { whenModuleOn } from '@/extensions/server/modules'
import { POST_generate } from '@/modules/prompts/server/http'
export const POST = whenModuleOn('prompt-master', POST_generate)
