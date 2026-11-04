import { httpJson } from '@/modules/providers/server/panels/http'
import type { DriverCheck, DriverConnection, HostingDriver } from '@/modules/hosting/server/drivers/contract'

const API = 'https://api.hetzner.cloud/v1'

/**
 * Hetzner Cloud through the owner's own project token. The address is fixed; the token is the only secret.
 * Slice 1: the connection check. Server operations follow in slice 4.
 */
export class HetznerCloudDriver implements HostingDriver {
  readonly id = 'HETZNER_CLOUD'
  readonly capabilities = [] as const
  constructor(private readonly connection: DriverConnection) {}

  async testConnection(): Promise<DriverCheck> {
    if (!this.connection.secret) return { ok: false, message: 'توکن API وارد نشده است' }
    try {
      const { res, data } = await httpJson(`${API}/locations`, { headers: { authorization: `Bearer ${this.connection.secret}`, accept: 'application/json' }, timeoutMs: 10_000 })
      if (res.status === 401 || res.status === 403) return { ok: false, message: 'توکن پذیرفته نشد؛ توکن Read & Write پروژه را وارد کنید' }
      if (!res.ok) return { ok: false, message: `پاسخ ناموفق از Hetzner (${res.status})` }
      const names = Array.isArray(data?.locations) ? data.locations.map((item: { name?: string }) => item?.name).filter(Boolean) : []
      return { ok: true, message: names.length ? `متصل شد؛ مکان‌ها: ${names.join('، ')}` : 'متصل شد' }
    } catch {
      return { ok: false, message: 'Hetzner پاسخ نداد؛ دسترسی شبکهٔ سرور به api.hetzner.cloud را بررسی کنید' }
    }
  }
}
