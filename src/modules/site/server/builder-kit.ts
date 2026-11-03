import { db } from '@/platform/database/prisma'
import { readJsonSetting } from '@/modules/settings/server'
import { KIT_KEY, validateKit } from '@/modules/site/domain/builder-kit'

/**
 * The kit as stored, with defaults for anything missing; read by every built page. Public pages use the settings
 * cache (a change shows within its 30 seconds); the editor's preview reads it fresh, so a saved kit shows at once.
 */
export async function getBuilderKit(fresh = false) {
  return validateKit(await readJsonSetting(KIT_KEY, fresh ? db : undefined))
}
