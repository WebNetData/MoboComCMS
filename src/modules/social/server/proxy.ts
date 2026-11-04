import { execFile } from 'node:child_process'
import { readJsonSetting, updateJsonSetting } from '@/modules/settings/server'
import { decryptPanelCredential, encryptPanelCredential } from '@/modules/providers/server/panel-credentials'
import { parseProxyConfig, ProxyConfigError } from '@/modules/social/domain/xray-link'
import { SOCIAL_PROXY_KEY, forgetSocialProxySetting, viaProxy } from '@/modules/social/server/egress'

// The social-network proxy as the Server Panel manages it: the outbound the owner pasted (kept encrypted), the root
// helper that turns it into the running Xray-core configuration, and whether Telegram/Instagram traffic uses it.

const HELPER = process.env.SOCIAL_PROXY_HELPER || '/usr/local/sbin/mobocom-xrayctl'
const MISSING = /password is required|a terminal is required|not allowed|no such file|ENOENT|sudoers|command not found/i

export class SocialProxyError extends Error { constructor(message: string, readonly status = 400) { super(message) } }

type Stored = { enabled?: boolean; link?: string; label?: string; protocol?: string; server?: string; appliedAt?: string }
export type ProxyService = { installed: boolean; version: string; configured: boolean; active: boolean }

function helper(args: string[], input?: string): Promise<{ ok: boolean; out: string }> {
  return new Promise(resolve => {
    const child = execFile('sudo', ['-n', HELPER, ...args], { timeout: 45_000, maxBuffer: 256 * 1024, windowsHide: true, env: { ...process.env, LC_ALL: 'C' } }, (error, stdout, stderr) => {
      const out = `${stdout || ''}\n${stderr || ''}`.trim()
      if (error && MISSING.test(`${out} ${error.message}`)) return resolve({ ok: false, out: 'ابزار پروکسی روی سرور نصب نیست؛ نصب‌کنندهٔ سرور را یک بار دیگر اجرا کنید (sudo bash install.sh).' })
      resolve({ ok: !error, out: out.replace(/^ERROR: /gm, '').slice(0, 1200) })
    })
    child.stdin?.on('error', () => undefined)
    child.stdin?.end(input ?? '')
  })
}

/** Xray's own reasons, in words the owner can act on; anything else is shown as Xray wrote it. */
export function explain(out: string) {
  if (/without TLS or other encryption is prohibited/i.test(out)) return 'Xray اتصال VLESS بدون TLS یا REALITY را به سرور عمومی نمی‌پذیرد (ترافیک رمزنگاری نمی‌شد). لینکی با security=tls یا reality وارد کنید.'
  if (/invalid user id|failed to parse UUID/i.test(out)) return 'شناسهٔ کاربر (UUID) را Xray نپذیرفت؛ لینک را دوباره از پنل سرور کپی کنید.'
  if (/password|key/i.test(out) && /shadowsocks/i.test(out)) return 'کلید یا گذرواژهٔ Shadowsocks برای این روش رمزگذاری درست نیست.'
  return out
}

async function stored(): Promise<Stored> {
  return ((await readJsonSetting(SOCIAL_PROXY_KEY)) || {}) as Stored
}

export async function proxyOverview() {
  const [settings, status] = await Promise.all([stored(), helper(['status'])])
  let service: ProxyService = { installed: false, version: '', configured: false, active: false }
  if (status.ok) {
    try {
      const value = JSON.parse(status.out.split('\n').filter(Boolean).pop() || '{}')
      service = { installed: value.installed === 1, version: String(value.version || '').slice(0, 32), configured: value.configured === 1, active: value.active === 1 }
    } catch { /* an unreadable answer counts as not installed */ }
  }
  return {
    service,
    helperError: status.ok ? '' : status.out,
    settings: { enabled: settings.enabled === true, configured: Boolean(settings.link), label: settings.label || '', protocol: settings.protocol || '', server: settings.server || '', appliedAt: settings.appliedAt || '' },
  }
}

/** Checks the pasted link, has Xray check and run it, then keeps it (encrypted) and routes the social networks through it. */
export async function saveProxy(raw: unknown) {
  let parsed
  try { parsed = parseProxyConfig(typeof raw === 'string' ? raw : '') } catch (error) {
    if (error instanceof ProxyConfigError) throw new SocialProxyError(error.message)
    throw error
  }
  const applied = await helper(['apply'], JSON.stringify(parsed.outbound))
  if (!applied.ok) throw new SocialProxyError(explain(applied.out) || 'Xray پیکربندی را نپذیرفت', 422)
  const link = encryptPanelCredential(String(raw).trim())
  await updateJsonSetting(SOCIAL_PROXY_KEY, async (value) => {
    Object.assign(value, { enabled: true, link, label: parsed.label, protocol: parsed.protocol, server: parsed.server, appliedAt: new Date().toISOString() })
  })
  forgetSocialProxySetting()
  return { protocol: parsed.protocol, server: parsed.server, label: parsed.label }
}

/** Telegram and Instagram through the proxy, or directly again; the configuration stays. */
export async function setProxyEnabled(enabled: boolean) {
  const current = await stored()
  if (enabled && !current.link) throw new SocialProxyError('اول پیکربندی پروکسی را ذخیره کنید')
  await updateJsonSetting(SOCIAL_PROXY_KEY, async (value) => { value.enabled = enabled })
  forgetSocialProxySetting()
  return { enabled }
}

/** Stops the proxy, removes its configuration and sends the social networks directly again. */
export async function removeProxy() {
  const result = await helper(['disable'])
  if (!result.ok) throw new SocialProxyError(result.out || 'پروکسی متوقف نشد', 502)
  await updateJsonSetting(SOCIAL_PROXY_KEY, async (value) => { for (const key of Object.keys(value)) delete value[key] })
  forgetSocialProxySetting()
  return { removed: true }
}

/** Reaches Telegram's and Instagram's APIs through the proxy (whether or not it is switched on) and reports how. */
export async function testProxy() {
  const targets = [
    { name: 'telegram', url: 'https://api.telegram.org/' },
    { name: 'instagram', url: 'https://graph.facebook.com/' },
  ]
  return {
    results: await Promise.all(targets.map(async (target) => {
      const started = Date.now()
      try {
        const response = await viaProxy(new URL(target.url), { signal: AbortSignal.timeout(15_000) })
        await response.body?.cancel().catch(() => undefined)
        return { name: target.name, ok: true, status: response.status, ms: Date.now() - started }
      } catch (error) {
        return { name: target.name, ok: false, error: String((error as Error)?.message || error).slice(0, 200), ms: Date.now() - started }
      }
    })),
  }
}

/** The saved link for the owner to see again (only through the unlocked panel). */
export async function revealProxyLink() {
  const { link } = await stored()
  if (!link) return { link: '' }
  try { return { link: decryptPanelCredential(link) } } catch { throw new SocialProxyError('پیکربندی ذخیره‌شده قابل رمزگشایی نیست؛ دوباره ذخیره کنید', 409) }
}
