import { createPublicKey, verify, type JsonWebKey } from 'node:crypto'
import { egressFetch } from '@/modules/social/server/egress'
import { AUTH, RESOURCE, ChatGptError, type Pending, type Registration } from './types'

export async function boundedText(response: Response, limit = 128 * 1024) {
  if (!response.body) throw new ChatGptError('پاسخ ChatGPT خالی بود', 502)
  const reader = response.body.getReader(), decoder = new TextDecoder(); let text = '', bytes = 0
  try {
    while (true) { const part = await reader.read(); if (part.done) break; bytes += part.value.length
      if (bytes > limit) throw new ChatGptError('پاسخ ChatGPT بیش از حد بزرگ بود', 502)
      text += decoder.decode(part.value, { stream: true }) }
    return text + decoder.decode()
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock() }
}
type ChatRequest = NonNullable<Parameters<typeof egressFetch>[1]>
export async function fixedFetch(url: string, init: ChatRequest = {}) {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:' || !['auth.openai.com', 'api.openai.com'].includes(parsed.hostname) || parsed.username || parsed.password || parsed.port) throw new ChatGptError('نشانی ChatGPT مجاز نیست')
  try { return await egressFetch(url, { ...init, redirect: 'error', cache: 'no-store', signal: init.signal || AbortSignal.timeout(20_000) }) }
  catch { throw new ChatGptError('اتصال ChatGPT کامل نشد؛ مسیر هوش مصنوعی در تنظیمات پروکسی را بررسی کنید', 502) }
}
export async function jsonRequest(url: string, init: ChatRequest = {}) {
  const response = await fixedFetch(url, init)
  if (!response.ok) { await response.body?.cancel().catch(() => undefined)
    if (response.status === 429) throw new ChatGptError('سهمیه یا محدودیت ChatGPT تمام شده است؛ API پولی استفاده نشد', 429)
    if ([400, 401, 403].includes(response.status)) throw new ChatGptError('اجازهٔ اتصال ChatGPT پذیرفته نشد؛ دوباره وارد حساب شوید', 401)
    throw new ChatGptError('سرویس ChatGPT پاسخ معتبر نداد', 502) }
  try { return JSON.parse(await boundedText(response)) as Record<string, unknown> } catch (error) {
    if (error instanceof ChatGptError) throw error
    throw new ChatGptError('قالب پاسخ ChatGPT معتبر نبود', 502)
  }
}
export async function discovery() {
  const data = await jsonRequest(`${AUTH}/.well-known/openid-configuration`)
  if (data.issuer !== AUTH || typeof data.jwks_uri !== 'string') throw new ChatGptError('مشخصات ورود ChatGPT معتبر نیست', 502)
  for (const name of ['jwks_uri', 'revocation_endpoint']) if (data[name]) {
    const url = new URL(String(data[name])); if (url.origin !== AUTH || url.hash || url.username || url.password) throw new ChatGptError('مشخصات ورود ChatGPT مجاز نیست', 502)
  }
  return data
}
export async function verifyIdentity(token: string, pending: Pick<Pending, 'nonce' | 'clientId' | 'subject'>) {
  try {
    const parts = token.split('.'); if (parts.length !== 3 || token.length > 20000) throw new Error('invalid')
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString()), claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new Error('algorithm')
    const meta = await discovery(), jwks = await jsonRequest(String(meta.jwks_uri))
    const keys = Array.isArray(jwks.keys) ? jwks.keys : [], key = keys.find(k => k && typeof k === 'object' && k.kid === header.kid && k.kty === 'RSA' && (!k.use || k.use === 'sig') && (!k.alg || k.alg === 'RS256'))
    if (!key || !verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key: key as JsonWebKey, format: 'jwk' }), Buffer.from(parts[2], 'base64url'))) throw new Error('signature')
    const now = Math.floor(Date.now() / 1000), aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
    if (claims.iss !== AUTH || !aud.includes(pending.clientId) || (aud.length > 1 && claims.azp !== pending.clientId) || (claims.azp && claims.azp !== pending.clientId) || !Number.isFinite(claims.exp) || claims.exp <= now || (claims.nbf && claims.nbf > now + 30) || claims.nonce !== pending.nonce || typeof claims.sub !== 'string' || !claims.sub || (pending.subject && claims.sub !== pending.subject)) throw new Error('claims')
    return { subject: claims.sub as string, email: typeof claims.email === 'string' ? claims.email.slice(0, 200) : '' }
  } catch (error) {
    if (error instanceof ChatGptError) throw error
    throw new ChatGptError('هویت پاسخ ChatGPT تأیید نشد؛ ورود را دوباره شروع کنید', 401)
  }
}
export async function tokenGrant(form: Record<string, string>) {
  return jsonRequest(`${AUTH}/api/accounts/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ...form, resource: RESOURCE }) })
}
export function tokenFields(data: Record<string, unknown>, previous?: Registration) {
  const scopes = typeof data.scope === 'string' ? data.scope.split(/\s+/) : previous?.scopes || []
  if (data.token_type !== 'Bearer' || typeof data.access_token !== 'string' || !data.access_token || data.access_token.length > 20000 || typeof data.refresh_token !== 'string' || !data.refresh_token || data.refresh_token.length > 20000 || !Number.isFinite(data.expires_in) || Number(data.expires_in) < 1 || Number(data.expires_in) > 86400 || !['chatgpt.tokens.use.direct', 'resource.invoke'].every(s=>scopes.includes(s))) throw new ChatGptError('مجوز مصرف سهمیهٔ ChatGPT صادر نشد؛ تنظیمات دسترسی حساب را بررسی کنید', 403)
  return { access: data.access_token, refresh: data.refresh_token, expires: Date.now() + Number(data.expires_in) * 1000, scopes }
}
