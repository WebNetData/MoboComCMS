import type { DriverCheck, DriverConnection, HostingDriver } from '@/modules/hosting/server/drivers/contract'
import { hostingRequest } from '@/modules/hosting/server/drivers/http'

const API = 'https://dmapi.joker.com/request'

// DMAPI headers end at the first blank line; body rows are not headers.
function parseReply(text: string): Map<string, string> | null {
  const headers = new Map<string, string>()
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) break
    const match = /^([A-Za-z][A-Za-z0-9-]*):\s*(.*?)\s*$/.exec(line)
    if (!match) return null
    const key = match[1].toLowerCase()
    if (headers.has(key)) return null
    headers.set(key, match[2])
  }
  return headers
}

function accepted(status: number, headers: Map<string, string> | null): boolean {
  if (status !== 200 || !headers || headers.has('error')) return false
  const result=headers.get('result')
  if(result!==undefined&&result.toUpperCase()!=='ACK')return false
  const code = headers.get('status-code')
  // The official minimal login response contains Auth-SID alone, and logout
  // may have no body. Explicit negative/common status always takes precedence.
  return code===undefined||/^(?:0|1\d{3})$/.test(code)
}

async function request(operation: 'login' | 'logout', fields: Record<string, string>) {
  return hostingRequest(`${API}/${operation}`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(), timeoutMs: 10_000,
  })
}

export class JokerDriver implements HostingDriver {
  readonly id = 'JOKER'
  readonly capabilities = [] as const
  constructor(private readonly connection: DriverConnection) {}

  async testConnection(): Promise<DriverCheck> {
    const { secret, username, config } = this.connection
    const mode = config.authMode ?? 'API_TOKEN'
    if (mode !== 'API_TOKEN' && mode !== 'PASSWORD') return { ok: false, message: 'روش احراز هویت Joker معتبر نیست' }
    if (!secret || (mode === 'PASSWORD' && !username)) return { ok: false, message: 'اطلاعات احراز هویت Joker را کامل کنید' }
    let session: string | undefined
    let loginOk = false
    let logoutOk = false
    try {
      const response = await request('login', mode === 'PASSWORD' ? { username, password: secret } : { 'api-key': secret })
      const headers = parseReply(response.text)
      const sid=headers?.get('auth-sid')
      session=sid&&/^[A-Za-z0-9._-]{1,256}$/.test(sid)?sid:undefined
      loginOk = accepted(response.status, headers) && !!session
    } catch {
      return { ok: false, message: 'ارتباط با Joker برقرار نشد؛ دسترسی شبکه را بررسی کنید' }
    } finally {
      if (session) {
        try {
          const response = await request('logout', { 'auth-sid': session })
          logoutOk = accepted(response.status, parseReply(response.text))
        } catch { /* Do not disclose the session or provider response. */ }
      }
    }
    if (!loginOk) return { ok: false, message: 'احراز هویت Joker ناموفق بود؛ اطلاعات حساب و دسترسی API را بررسی کنید' }
    if (!logoutOk) return { ok: false, message: 'ورود به Joker انجام شد اما بستن نشست تأیید نشد؛ اتصال شبکه را بررسی کنید' }
    return { ok: true, message: 'اتصال به Joker برقرار شد' }
  }
}
