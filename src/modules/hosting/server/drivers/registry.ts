import { driverMeta } from '@/modules/hosting/domain/catalog'
import type { DriverConnection, HostingDriver, HostingDriverFactory } from '@/modules/hosting/server/drivers/contract'
import { HetznerCloudDriver } from '@/modules/hosting/server/drivers/hetzner-cloud'
import { CpanelDriver } from '@/modules/hosting/server/drivers/cpanel'
import { JokerDriver } from '@/modules/hosting/server/drivers/joker'
import { ProxmoxDriver } from '@/modules/hosting/server/drivers/proxmox'

/** A system whose driver is not built yet: it can be saved, and its check says so plainly. */
class PendingDriver implements HostingDriver {
  readonly capabilities = [] as const
  constructor(readonly id: string) {}
  async testConnection() {
    if(this.id==='IRNIC')return {ok:false,message:'قرارداد و دسترسی API نمایندگی ایرنیک هنوز تنظیم نشده است؛ رمز ورود nic.ir به‌تنهایی اتصال API نیست. ثبت و تمدید فعلاً با کارشناس انجام می‌شود.'}
    return { ok: false, message: `اتصال ${driverMeta(this.id)?.label || this.id} در مرحله‌های بعدی ساخته می‌شود؛ اطلاعات ذخیره شد.` }
  }
}

const factories = new Map<string, HostingDriverFactory>([
  ['HETZNER_CLOUD', (connection) => new HetznerCloudDriver(connection)],
  ['CPANEL', connection=>new CpanelDriver(connection)],
  ['JOKER', connection=>new JokerDriver(connection)],
  ['PROXMOX', connection=>new ProxmoxDriver(connection)],
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
