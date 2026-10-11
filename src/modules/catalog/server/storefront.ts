import { db } from '@/platform/database/prisma'
import { isModuleEnabled } from '@/extensions/server/modules'

/** The storefront is opt-in; plan subscriptions remain available independently. */
export async function isStoreEnabled() {
  const setting = await db.setting.findUnique({ where: { key: 'storeEnabled' } })
  return setting?.value === 'true' && await isModuleEnabled('store')
}
