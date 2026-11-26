import type { DriverCheck, DriverConnection, HostingDriver } from '@/modules/hosting/server/drivers/contract'
import { hostingRequest } from '@/modules/hosting/server/drivers/http'
import { proxmoxOperation } from '@/modules/hosting/server/drivers/compute-operations'
import type { CloudOperationInput } from '@/modules/hosting/server/drivers/operations'

function adminOrigin(value: string): string | null {
  // Accept only an HTTPS authority and an optional trailing slash, before URL normalization.
  if (!/^https:\/\/[^\s\\/?#@]+\/?$/i.test(value)) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || (url.port && url.port !== '8006' && url.port !== '443')) return null
    return url.origin
  } catch { return null }
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validPermissions(value: unknown): boolean {
  return object(value) && Object.entries(value).every(([path, privileges]) =>
    path.startsWith('/') && object(privileges) && Object.entries(privileges).every(([name, propagate]) =>
      !!name && (propagate === 0 || propagate === 1 || typeof propagate === 'boolean')))
}

export class ProxmoxDriver implements HostingDriver {
  readonly id = 'PROXMOX'
  readonly capabilities = ['create','start','stop','shutdown','reboot','delete'] as const
  constructor(private readonly connection: DriverConnection) {}
  performOperation(input:CloudOperationInput){return proxmoxOperation(this.connection,input,'',false)}
  inspectOperation(input:CloudOperationInput,reference:string){return proxmoxOperation(this.connection,input,reference,true)}

  async testConnection(): Promise<DriverCheck> {
    const { url, username, secret } = this.connection
    const origin = adminOrigin(url)
    if (!origin) return { ok: false, message: 'نشانی مدیریت Proxmox باید HTTPS و با درگاه ۴۴۳ یا ۸۰۰۶ باشد' }
    if (!/^[^\s@!=:]+@[^\s@!=:]+![^\s@!=:]+$/.test(username) || !secret || /[\s\x00-\x1f\x7f]/.test(secret)) {
      return { ok: false, message: 'شناسه و کلید توکن Proxmox را بررسی کنید' }
    }
    try {
      const response = await hostingRequest(`${origin}/api2/json/access/permissions`, {
        method: 'GET', headers: { authorization: `PVEAPIToken=${username}=${secret}`, accept: 'application/json' }, timeoutMs: 10_000,
      })
      if (response.status === 401 || response.status === 403) return { ok: false, message: 'احراز هویت یا دسترسی توکن Proxmox ناموفق بود' }
      if (response.status < 200 || response.status >= 300) return { ok: false, message: 'Proxmox درخواست بررسی اتصال را نپذیرفت' }
      let payload: unknown
      try { payload = JSON.parse(response.text) } catch { return { ok: false, message: 'پاسخ Proxmox معتبر نیست' } }
      if (!object(payload) || !validPermissions(payload.data)) return { ok: false, message: 'پاسخ مجوزهای Proxmox معتبر نیست' }
      return { ok: true, message: 'اتصال به Proxmox برقرار شد' }
    } catch {
      return { ok: false, message: 'ارتباط با Proxmox برقرار نشد؛ شبکه و گواهی TLS را بررسی کنید' }
    }
  }
}
