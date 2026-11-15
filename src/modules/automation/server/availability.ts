import { isModuleEnabled } from '@/extensions/server/modules'
import { db } from '@/platform/database/prisma'
import type { StateReader } from '@/extensions/server/state'
import { AutomationError } from '../domain/automation'

export const automationAvailable = (reader: StateReader = db) => isModuleEnabled('automation', reader)
export async function assertAutomationAvailable(reader: StateReader = db) {
  if (!await automationAvailable(reader)) throw new AutomationError('اتوماسیون غیرفعال است', 404)
}
