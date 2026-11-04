import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { updateJsonSetting } from '@/modules/settings/server'
import { decryptPanelCredential, encryptPanelCredential } from '@/modules/providers/server/panel-credentials'
import { parseProxyConfig, ProxyConfigError, type ProxyOutbound } from '@/modules/social/domain/xray-link'
import {
  EGRESS_PURPOSES, MAX_PROFILES, helperPayload, isPurpose, nextProfileId, normalizeEgress, normalizeProfileName,
  type EgressProfile, type EgressPurpose, type EgressSettings,
} from '@/modules/social/domain/egress'
import { EGRESS_PROXY_KEY, forgetSocialProxySetting, readEgressSettings, viaProxy } from '@/modules/social/server/egress'

// The outbound proxy as the Server Panel manages it: named profiles (each a pasted outbound, kept encrypted), the
// profile each purpose uses, and the root helper that turns them into the running Xray-core configuration.

const HELPER = process.env.SOCIAL_PROXY_HELPER || '/usr/local/sbin/mobocom-xrayctl'
const MISSING = /password is required|a terminal is required|not allowed|no such file|ENOENT|sudoers|command not found/i
const PROXY_URL = `http://127.0.0.1:${Number(process.env.SOCIAL_PROXY_PORT || 10809)}`
/** Read by deploy/ubuntu/git-fetch.sh: the updater's git fetch uses the proxy while "updates" has a profile. */
const GIT_PROXY_FILE = () => path.join(process.env.UPDATE_STATE_DIR || path.join(process.cwd(), 'storage', 'update'), 'git-proxy')
const OLD_BUILDER = 'ابزار Xray روی سرور نسخهٔ قدیمی است و فقط یک پیکربندی برای تلگرام و اینستاگرام می‌پذیرد. یک بار این دستور را روی سرور اجرا کنید: sudo bash /opt/mobocom/app/deploy/ubuntu/xray-install.sh'

export class SocialProxyError extends Error { constructor(message: string, readonly status = 400) { super(message) } }

export type ProxyService = { installed: boolean; version: string; configured: boolean; active: boolean; builder: number }

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

async function service(): Promise<{ service: ProxyService; helperError: string }> {
  const status = await helper(['status'])
  let value: ProxyService = { installed: false, version: '', configured: false, active: false, builder: 1 }
  if (status.ok) {
    try {
      const v = JSON.parse(status.out.split('\n').filter(Boolean).pop() || '{}')
      value = { installed: v.installed === 1, version: String(v.version || '').slice(0, 32), configured: v.configured === 1, active: v.active === 1, builder: Number.isInteger(v.builder) ? v.builder : 1 }
    } catch { /* an unreadable answer counts as not installed */ }
  }
  return { service: value, helperError: status.ok ? '' : status.out }
}

const outboundOf = (profile: EgressProfile): ProxyOutbound => {
  let link: string
  try { link = decryptPanelCredential(profile.link) } catch { throw new SocialProxyError(`پیکربندی «${profile.name}» قابل رمزگشایی نیست؛ آن را دوباره ذخیره کنید`, 409) }
  try { return parseProxyConfig(link).outbound } catch (error) {
    if (error instanceof ProxyConfigError) throw new SocialProxyError(`پیکربندی «${profile.name}»: ${error.message}`)
    throw error
  }
}

const publicProfile = (p: EgressProfile) => ({ id: p.id, name: p.name, protocol: p.protocol, server: p.server, label: p.label, savedAt: p.savedAt })

export async function proxyOverview() {
  const [settings, status] = await Promise.all([readEgressSettings(), service()])
  return {
    ...status,
    profiles: settings.profiles.map(publicProfile),
    routes: settings.routes,
    purposes: EGRESS_PURPOSES.map(({ key, label, hint }) => ({ key, label, hint })),
    appliedAt: settings.appliedAt,
    maxProfiles: MAX_PROFILES,
  }
}

/** Has Xray check and run the given settings (or stop when nothing uses a profile), then stores them. */
async function applyAndStore(next: EgressSettings) {
  const { service: svc } = await service()
  const payload = helperPayload(next, outboundOf, svc.builder)
  if (payload.kind === 'old-builder') throw new SocialProxyError(OLD_BUILDER, 409)
  if (payload.kind === 'none') {
    if (svc.configured || svc.active) {
      const stopped = await helper(['disable'])
      if (!stopped.ok) throw new SocialProxyError(stopped.out || 'پروکسی متوقف نشد', 502)
    }
  } else {
    const applied = await helper(['apply'], JSON.stringify(payload.body))
    if (!applied.ok) throw new SocialProxyError(explain(applied.out) || 'Xray پیکربندی را نپذیرفت', 422)
  }
  const stored = { ...next, appliedAt: new Date().toISOString() }
  await updateJsonSetting(EGRESS_PROXY_KEY, async (value) => {
    for (const key of Object.keys(value)) delete value[key]
    Object.assign(value, stored)
  })
  forgetSocialProxySetting()
  await writeGitProxy(Boolean(stored.routes.updates))
  return stored
}

async function writeGitProxy(on: boolean) {
  const file = GIT_PROXY_FILE()
  try {
    if (on) { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, `${PROXY_URL}\n`, { mode: 0o640 }) }
    else await fs.rm(file, { force: true })
  } catch { /* a read-only checkout (tests, containers) keeps the updater as it was */ }
}

/** Adds a profile, or replaces/renames one (an empty link keeps the saved one). Xray checks it before it is kept. */
export async function saveProfile(input: { id?: unknown; name?: unknown; link?: unknown }) {
  const settings = await readEgressSettings()
  const name = normalizeProfileName(input.name)
  if (!name) throw new SocialProxyError('برای پیکربندی یک نام بنویسید')
  const existing = typeof input.id === 'string' ? settings.profiles.find((p) => p.id === input.id) : undefined
  if (input.id && !existing) throw new SocialProxyError('این پیکربندی پیدا نشد', 404)
  if (!existing && settings.profiles.length >= MAX_PROFILES) throw new SocialProxyError(`حداکثر ${MAX_PROFILES} پیکربندی می‌توانید داشته باشید`)
  const raw = typeof input.link === 'string' ? input.link.trim() : ''
  let profile: EgressProfile
  if (raw) {
    let parsed
    try { parsed = parseProxyConfig(raw) } catch (error) {
      if (error instanceof ProxyConfigError) throw new SocialProxyError(error.message)
      throw error
    }
    profile = { id: existing?.id || nextProfileId(settings)!, name, link: encryptPanelCredential(raw), protocol: parsed.protocol, server: parsed.server, label: parsed.label, savedAt: new Date().toISOString() }
  } else if (existing) profile = { ...existing, name }
  else throw new SocialProxyError('لینک یا JSON پیکربندی را وارد کنید')
  const next = normalizeEgress({ ...settings, profiles: existing ? settings.profiles.map((p) => p.id === profile.id ? profile : p) : [...settings.profiles, profile] })
  // A profile no purpose uses is only stored; one in use is checked and applied by Xray first.
  const inUse = Object.values(next.routes).includes(profile.id)
  if (inUse) await applyAndStore(next)
  else if (raw) {
    const { service: svc } = await service()
    // Xray still checks a new link on its own, without changing what runs, when the builder can take profiles.
    if (svc.builder >= 2) {
      const checked = await helper(['check'], JSON.stringify({ version: 2, profiles: [{ tag: 'p1', outbound: outboundOf(profile) }], routes: { telegram: 'p1' } }))
      if (!checked.ok && !/usage/i.test(checked.out)) throw new SocialProxyError(explain(checked.out) || 'Xray پیکربندی را نپذیرفت', 422)
    }
    await store(next)
  } else await store(next)
  return publicProfile(profile)
}

async function store(next: EgressSettings) {
  await updateJsonSetting(EGRESS_PROXY_KEY, async (value) => {
    for (const key of Object.keys(value)) delete value[key]
    Object.assign(value, next)
  })
  forgetSocialProxySetting()
}

/** The profile each purpose uses; '' sends it directly. */
export async function setRoutes(input: unknown) {
  const settings = await readEgressSettings()
  const given = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const routes: Partial<Record<EgressPurpose, string>> = {}
  for (const [purpose, id] of Object.entries(given)) {
    if (!isPurpose(purpose)) throw new SocialProxyError('کاربرد ناشناخته است')
    if (id === '' || id === null) continue
    if (typeof id !== 'string' || !settings.profiles.some((p) => p.id === id)) throw new SocialProxyError('پیکربندی انتخاب‌شده وجود ندارد')
    routes[purpose] = id
  }
  const stored = await applyAndStore({ ...settings, routes })
  return { routes: stored.routes }
}

/** Removes a profile; purposes that used it go directly again. */
export async function removeProfile(id: unknown) {
  const settings = await readEgressSettings()
  if (typeof id !== 'string' || !settings.profiles.some((p) => p.id === id)) throw new SocialProxyError('این پیکربندی پیدا نشد', 404)
  const routes = Object.fromEntries(Object.entries(settings.routes).filter(([, used]) => used !== id))
  await applyAndStore({ ...settings, profiles: settings.profiles.filter((p) => p.id !== id), routes })
  return { removed: id }
}

/** Reaches each purpose's service through the running proxy and reports how. */
export async function testProxy(purposes?: unknown) {
  const settings = await readEgressSettings()
  const wanted = Array.isArray(purposes) ? purposes.filter(isPurpose) : EGRESS_PURPOSES.map((p) => p.key)
  const targets = EGRESS_PURPOSES.filter((p) => wanted.includes(p.key) && settings.routes[p.key])
  return {
    results: await Promise.all(targets.map(async (target) => {
      const started = Date.now()
      try {
        const response = await viaProxy(new URL(target.test), { signal: AbortSignal.timeout(15_000) })
        await response.body?.cancel().catch(() => undefined)
        return { name: target.key, ok: true, status: response.status, ms: Date.now() - started }
      } catch (error) {
        return { name: target.key, ok: false, error: String((error as Error)?.message || error).slice(0, 200), ms: Date.now() - started }
      }
    })),
  }
}

/** A saved link for the owner to see again (only through the unlocked panel). */
export async function revealProxyLink(id?: unknown) {
  const settings = await readEgressSettings()
  const profile = settings.profiles.find((p) => p.id === id) || (id ? undefined : settings.profiles[0])
  if (!profile) return { link: '' }
  try { return { link: decryptPanelCredential(profile.link) } } catch { throw new SocialProxyError('پیکربندی ذخیره‌شده قابل رمزگشایی نیست؛ دوباره ذخیره کنید', 409) }
}
