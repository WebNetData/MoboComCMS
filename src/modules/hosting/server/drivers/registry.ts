import { driverMeta } from '@/modules/hosting/domain/catalog'
import type { DriverConnection, HostingDriver, HostingDriverFactory } from '@/modules/hosting/server/drivers/contract'
import { HetznerCloudDriver } from '@/modules/hosting/server/drivers/hetzner-cloud'

/** A system whose driver is not built yet: it can be saved, and its check says so plainly. */
class PendingDriver implements HostingDriver {
  readonly capabilities = [] as const
  constructor(readonly id: string) {}
  async testConnection() {
    return { ok: false, message: `اتصال ${driverMeta(this.id)?.label || this.id} در مرحله‌های بعدی ساخته می‌شود؛ اطلاعات ذخیره شد.` }
  }
}

const factories = new Map<string, HostingDriverFactory>([
  ['HETZNER_CLOUD', (connection) => new HetznerCloudDriver(connection)],
])

/** Tests and later slices register drivers here; the id must be a known driver or a test driver. */
export function registerHostingDriver(id: string, factory: HostingDriverFactory) {
  if (!driverMeta(id) && !id.startsWith('TEST_')) throw new Error(`unknown hosting driver ${id}`)
  factories.set(id, factory)
}

export function hostingDriver(connection: DriverConnection): HostingDriver {
  const factory = factories.get(connection.driver)
  return factory ? factory(connection) : new PendingDriver(connection.driver)
}

export const hasHostingDriver = (id: string) => factories.has(id)
