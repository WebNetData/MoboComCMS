// Web installer rules: install state, database address, runtime settings file, admin and site input.
// Pure functions with no imports, shared by the server, the tests and (as plain text) the installer page.

export class InstallError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

/** What the site needs next. `unknown` means the state could not be read (for example a database outage): nothing is offered then. */
export type InstallMode = 'installed' | 'needs-database' | 'needs-schema' | 'needs-admin' | 'unknown'

export interface ModeInput {
  disabled: boolean          // INSTALL_DISABLED=true
  lockFile: boolean          // storage/config/installed.lock exists
  setupMode: boolean         // booted without a database (SETUP_MODE=1) or DATABASE_URL is empty
  probe: 'admin' | 'no-admin' | 'no-schema' | 'unreachable' | 'skipped'
}

/**
 * Decides the install state. The installer must never appear on a working site: it opens only when the
 * state is positively known to be fresh (no database configured, no tables, or tables without an administrator).
 */
export function decideMode(input: ModeInput): InstallMode {
  if (input.disabled || input.lockFile) return 'installed'
  if (input.setupMode) return 'needs-database'
  switch (input.probe) {
    case 'admin': return 'installed'
    case 'no-admin': return 'needs-admin'
    case 'no-schema': return 'needs-schema'
    default: return 'unknown'
  }
}

// ------------------------------------------------------------------ runtime settings file

/** Keys the installer may write to storage/config/runtime.env, and the loader may export. Nothing else is ever read from it. */
export const RUNTIME_KEYS = ['DATABASE_URL', 'NEXTAUTH_SECRET', 'NEXTAUTH_URL', 'INTERNAL_JOBS_SECRET', 'PANEL_CREDENTIAL_KEY'] as const
export type RuntimeKey = (typeof RUNTIME_KEYS)[number]
export const RUNTIME_MARKER = '# web-installer'

const LINE = /^([A-Z][A-Z0-9_]*)=(.*)$/
const SAFE_VALUE = /^[A-Za-z0-9_@:/?&=.%+,#~!*()-]+$/

export function serializeRuntimeEnv(values: Partial<Record<RuntimeKey, string>>): string {
  const lines = [RUNTIME_MARKER, '# Written by the web installer. Real environment variables take precedence over these values.']
  for (const key of RUNTIME_KEYS) {
    const value = values[key]
    if (value === undefined) continue
    if (!SAFE_VALUE.test(value) || value.length > 2000) throw new InstallError(`مقدار ${key} نویسهٔ غیرمجاز دارد`)
    lines.push(`${key}=${value}`)
  }
  return `${lines.join('\n')}\n`
}

export function parseRuntimeEnv(text: string): Partial<Record<RuntimeKey, string>> {
  const out: Partial<Record<RuntimeKey, string>> = {}
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const match = LINE.exec(line)
    if (!match || !(RUNTIME_KEYS as readonly string[]).includes(match[1])) continue
    let value = match[2].trim()
    if (value.length >= 2 && ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"')))) value = value.slice(1, -1)
    if (value && SAFE_VALUE.test(value)) out[match[1] as RuntimeKey] = value
  }
  return out
}

// ------------------------------------------------------------------ database address

export interface PostgresInput { host: string; port: number; database: string; user: string; password: string; ssl: 'disable' | 'prefer' | 'require' }

export function normalizePostgres(input: Record<string, unknown>): PostgresInput {
  const host = String(input.host ?? '').trim()
  if (!/^[A-Za-z0-9]([A-Za-z0-9._-]{0,251}[A-Za-z0-9])?$/.test(host)) throw new InstallError('نشانی سرور پایگاه داده معتبر نیست')
  const port = Number(input.port || 5432)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new InstallError('درگاه (port) معتبر نیست')
  const database = String(input.database ?? '').trim()
  if (!/^[A-Za-z0-9_][A-Za-z0-9_.$-]{0,62}$/.test(database)) throw new InstallError('نام پایگاه داده معتبر نیست')
  const user = String(input.user ?? '').trim()
  if (!/^[A-Za-z0-9_][A-Za-z0-9_.$-]{0,62}$/.test(user)) throw new InstallError('نام کاربری پایگاه داده معتبر نیست')
  const password = String(input.password ?? '')
  if (password.length > 200 || /[\u0000-\u001f\u007f]/.test(password)) throw new InstallError('گذرواژهٔ پایگاه داده معتبر نیست')
  const ssl = input.ssl === 'require' || input.ssl === 'disable' ? input.ssl : 'prefer'
  return { host, port, database, user, password, ssl }
}

/** The connection URL; the password is percent-encoded so any character is safe. */
export function buildPostgresUrl(input: PostgresInput): string {
  return `postgresql://${encodeURIComponent(input.user)}:${encodeURIComponent(input.password)}@${input.host}:${input.port}/${input.database}${input.ssl === 'prefer' ? '' : `?sslmode=${input.ssl}`}`
}

/** A URL for display: the password is never shown. */
export function describeDatabaseUrl(url: string): { provider: 'postgresql' | 'sqlite' | 'unknown'; where: string } {
  if (/^file:/i.test(url)) return { provider: 'sqlite', where: url.replace(/^file:/i, '') }
  try {
    const parsed = new URL(url)
    if (/^postgres(ql)?:$/.test(parsed.protocol)) return { provider: 'postgresql', where: `${decodeURIComponent(parsed.username)}@${parsed.hostname}:${parsed.port || '5432'}${parsed.pathname}` }
  } catch { /* falls through */ }
  return { provider: 'unknown', where: '' }
}

/** Removes anything that looks like a secret from an error message before it is shown. */
export function scrubMessage(message: string, secrets: string[]): string {
  let out = String(message)
  for (const secret of secrets) if (secret.length >= 3) out = out.split(secret).join('••••').split(encodeURIComponent(secret)).join('••••')
  return out.replace(/(postgres(?:ql)?:\/\/[^:\s/]+:)[^@\s]+@/gi, '$1••••@').slice(0, 600)
}

// ------------------------------------------------------------------ checks

export interface Check { id: string; label: string; status: 'ok' | 'warn' | 'fail'; detail: string }
export const worst = (checks: Check[]): 'ok' | 'warn' | 'fail' => (checks.some((c) => c.status === 'fail') ? 'fail' : checks.some((c) => c.status === 'warn') ? 'warn' : 'ok')

export const weakSecret = (value: string | undefined, min = 32) => !value || value.length < min || /change[-_ ]?me|replace|example|dev-secret/i.test(value)

// ------------------------------------------------------------------ administrator and site

const COMMON = ['password', 'passw0rd', '12345678', '123456789', '1234567890', 'qwerty', 'abc123', 'letmein', 'admin', 'welcome', 'iloveyou', '11111111', '00000000']

/** '' when the password is acceptable, otherwise why not (Persian, for the person installing). */
export function passwordProblem(password: string, email = ''): string {
  if (password.length < 10) return 'گذرواژه دست‌کم ۱۰ نویسه باشد'
  if (password.length > 200) return 'گذرواژه بیش از حد طولانی است'
  if (!/[A-Za-z؀-ۿ]/.test(password) || !/\d/.test(password)) return 'گذرواژه هم حرف و هم عدد داشته باشد'
  const lower = password.toLowerCase()
  if (COMMON.some((word) => lower.includes(word))) return 'این گذرواژه بیش از حد رایج است'
  const local = email.split('@')[0]?.toLowerCase()
  if (local && local.length >= 4 && lower.includes(local)) return 'گذرواژه نباید شامل بخشی از ایمیل باشد'
  if (/^(.)\1+$/.test(password)) return 'گذرواژه نباید تکراری باشد'
  return ''
}

export interface SiteInput { siteName: string; tagline: string; siteUrl: string; adminName: string; adminEmail: string; adminPassword: string; modules: Record<string, boolean> }

const cleanText = (value: unknown, max: number) => String(value ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)

/** The site's public address: an http(s) origin. Production also needs https and a real host. */
export function normalizeSiteUrl(value: unknown, production: boolean): string {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  let url: URL
  try { url = new URL(raw) } catch { throw new InstallError('نشانی سایت معتبر نیست (مثلاً https://example.com)') }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new InstallError('نشانی سایت باید با http یا https شروع شود')
  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  if (production && (url.protocol !== 'https:' || !host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === '127.0.0.1' || host === '::1')) {
    throw new InstallError('در حالت تولید، نشانی سایت باید نشانی عمومی با https باشد')
  }
  return `${url.protocol}//${url.host}`
}

export function normalizeSiteInput(input: Record<string, unknown>, options: { production: boolean; knownModules: string[] }): SiteInput {
  const siteName = cleanText(input.siteName, 80)
  if (!siteName) throw new InstallError('نام سایت را وارد کنید')
  const adminEmail = String(input.adminEmail ?? '').trim().toLowerCase()
  if (adminEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) throw new InstallError('ایمیل مدیر معتبر نیست')
  const adminPassword = String(input.adminPassword ?? '')
  const problem = passwordProblem(adminPassword, adminEmail)
  if (problem) throw new InstallError(problem)
  const modules: Record<string, boolean> = {}
  const chosen = (input.modules && typeof input.modules === 'object' ? input.modules : {}) as Record<string, unknown>
  for (const id of options.knownModules) if (typeof chosen[id] === 'boolean') modules[id] = chosen[id] as boolean
  return {
    siteName, tagline: cleanText(input.tagline, 160), siteUrl: normalizeSiteUrl(input.siteUrl, options.production),
    adminName: cleanText(input.adminName, 80) || 'مدیر سایت', adminEmail, adminPassword, modules,
  }
}

/**
 * Order in which module switches can be applied: a module needs the modules it requires enabled,
 * and cannot be disabled while a module that requires it stays enabled.
 */
export function moduleOrder(desired: Record<string, boolean>, requires: Record<string, string[]>): string[] {
  const ids = Object.keys(desired)
  const enable = ids.filter((id) => desired[id])
  const disable = ids.filter((id) => !desired[id])
  const depth = (id: string, seen = new Set<string>()): number => {
    if (seen.has(id)) return 0
    seen.add(id)
    return 1 + Math.max(0, ...(requires[id] || []).map((r) => depth(r, seen)))
  }
  enable.sort((a, b) => depth(a) - depth(b))     // dependencies first
  disable.sort((a, b) => depth(b) - depth(a))    // dependents first
  return [...disable, ...enable]
}

/** A random string the caller supplies bytes for (kept pure so tests are deterministic). */
export const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
