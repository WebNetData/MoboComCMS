import { isModuleEnabled } from '@/extensions/server/modules'
import { db } from '@/platform/database/prisma'
import type { StateReader } from '@/extensions/server/state'
import { FormsError } from '../domain/forms'

/** Explicit reader bypasses render caching at domain commands and effect boundaries. */
export const formsAvailable = (reader: StateReader = db) => isModuleEnabled('forms', reader)
export async function assertFormsAvailable(reader: StateReader = db) {
  if (!await formsAvailable(reader)) throw new FormsError('این قابلیت غیرفعال است', 404)
}
