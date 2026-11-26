import { connectionFailure, hostingRequest } from '@/modules/hosting/server/drivers/http'
import type { DriverCheck, DriverConnection, HostingDriver } from '@/modules/hosting/server/drivers/contract'
import { hetznerOperation } from '@/modules/hosting/server/drivers/compute-operations'
import type { CloudOperationInput } from '@/modules/hosting/server/drivers/operations'

const API = 'https://api.hetzner.cloud/v1'

/**
 * Hetzner Cloud through the owner's own project token. The address is fixed; the token is the only secret.
 * Slice 1: the connection check. Server operations follow in slice 4.
 */
export class HetznerCloudDriver implements HostingDriver {
  readonly id = 'HETZNER_CLOUD'
  readonly capabilities = ['create','start','stop','shutdown','reboot','delete'] as const
  constructor(private readonly connection: DriverConnection) {}
  performOperation(input:CloudOperationInput){return hetznerOperation(this.connection,input,'',false)}
  inspectOperation(input:CloudOperationInput,reference:string){return hetznerOperation(this.connection,input,reference,true)}

  async testConnection(): Promise<DriverCheck> {
    if (!this.connection.secret) return { ok: false, message: 'توکن API وارد نشده است' }
    try {
      const res = await hostingRequest(`${API}/locations`, { headers: { authorization: `Bearer ${this.connection.secret}` } })
      if (res.status === 401 || res.status === 403) return { ok: false, message: 'توکن پذیرفته نشد؛ توکن پروژه را بررسی کنید' }
      if (res.status < 200 || res.status >= 300) return { ok: false, message: `پاسخ ناموفق از Hetzner (${res.status})` }
      const data:unknown=JSON.parse(res.text)
      if(!data||typeof data!=='object'||!('locations' in data)||!Array.isArray(data.locations))return {ok:false,message:'پاسخ API هتزنر معتبر نیست.'}
      return { ok: true, message: `ورود هتزنر تأیید شد؛ ${data.locations.length.toLocaleString('fa-IR')} مکان در دسترس. ساخت خودکار سرور با این آزمون تأیید نمی‌شود.` }
    } catch(error) {
      return { ok: false, message: error instanceof SyntaxError?'پاسخ API هتزنر JSON معتبر نیست.':connectionFailure(error) }
    }
  }
}
