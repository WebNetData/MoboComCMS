/**
 * Outbound proxy profiles and purposes (Server Panel → Xray-core). A profile is one outbound the owner pasted; each
 * purpose goes through the profile chosen for it, or directly. The root builder (deploy/ubuntu/xray-config.cjs) keeps
 * its own list of the hosts each purpose may reach; this list says which requests of the site belong to a purpose.
 */

export const EGRESS_PURPOSES = [
  { key: 'telegram', label: 'تلگرام', hint: 'ربات، مینی‌اپ، ارسال به کانال و اعلان‌ها', hosts: ['api.telegram.org'], test: 'https://api.telegram.org/' },
  { key: 'instagram', label: 'اینستاگرام', hint: 'انتشار خودکار پست‌ها', hosts: ['graph.facebook.com', 'graph.instagram.com'], test: 'https://graph.facebook.com/' },
  { key: 'updates', label: 'به‌روزرسانی از GitHub', hint: 'دریافت نسخهٔ تازهٔ سایت (git) در به‌روزرسانی امن', hosts: ['github.com', 'githubusercontent.com'], test: 'https://github.com/' },
  { key: 'ai', label: 'هوش مصنوعی', hint: 'OpenAI، Claude، Gemini، Qwen، DeepSeek، OpenRouter و Groq', hosts: ['openai.com', 'anthropic.com', 'generativelanguage.googleapis.com', 'openrouter.ai', 'groq.com', 'dashscope-intl.aliyuncs.com', 'api.deepseek.com'], test: 'https://api.openai.com/' },
] as const

export type EgressPurpose = typeof EGRESS_PURPOSES[number]['key']
export type EgressProfile = { id: string; name: string; link: string; protocol: string; server: string; label: string; savedAt: string }
export type EgressSettings = { profiles: EgressProfile[]; routes: Partial<Record<EgressPurpose, string>>; appliedAt: string }

export const MAX_PROFILES = 8
export const PROFILE_IDS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'] as const
/** Purposes an older root builder (version 1) can carry: one outbound for Telegram and Instagram. */
export const LEGACY_PURPOSES: readonly EgressPurpose[] = ['telegram', 'instagram']

export const isPurpose = (value: unknown): value is EgressPurpose => EGRESS_PURPOSES.some((p) => p.key === value)

/** The purpose a request host belongs to (the host itself or a subdomain of a listed one). */
export function purposeOfHost(host: string): EgressPurpose | null {
  const name = host.toLowerCase().replace(/\.$/, '')
  for (const purpose of EGRESS_PURPOSES) if (purpose.hosts.some((h) => name === h || name.endsWith(`.${h}`))) return purpose.key
  return null
}

export function normalizeProfileName(value: unknown) {
  const name = typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 60) : ''
  return name
}

/** Settings as stored, cleaned: known purposes only, each naming a profile that exists. */
export function normalizeEgress(input: unknown): EgressSettings {
  const raw = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const seen = new Set<string>()
  const profiles: EgressProfile[] = (Array.isArray(raw.profiles) ? raw.profiles : []).flatMap((item) => {
    const p = item && typeof item === 'object' ? item as Record<string, unknown> : {}
    const id = String(p.id || '')
    if (!(PROFILE_IDS as readonly string[]).includes(id) || seen.has(id) || typeof p.link !== 'string' || !p.link) return []
    seen.add(id)
    const text = (v: unknown, max: number) => typeof v === 'string' ? v.slice(0, max) : ''
    return [{ id, name: normalizeProfileName(p.name) || id, link: p.link, protocol: text(p.protocol, 20), server: text(p.server, 260), label: text(p.label, 120), savedAt: text(p.savedAt, 40) }]
  }).slice(0, MAX_PROFILES)
  const given = raw.routes && typeof raw.routes === 'object' ? raw.routes as Record<string, unknown> : {}
  const routes: EgressSettings['routes'] = {}
  for (const purpose of EGRESS_PURPOSES) {
    const id = given[purpose.key]
    if (typeof id === 'string' && seen.has(id)) routes[purpose.key] = id
  }
  return { profiles, routes, appliedAt: typeof raw.appliedAt === 'string' ? raw.appliedAt.slice(0, 40) : '' }
}

/** The first social-proxy setting (one link, on/off for Telegram and Instagram) as profiles and routes. */
export function fromLegacy(value: unknown): EgressSettings {
  const v = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  if (typeof v.link !== 'string' || !v.link) return { profiles: [], routes: {}, appliedAt: '' }
  const profile: EgressProfile = { id: 'p1', name: (typeof v.label === 'string' && v.label.trim().slice(0, 60)) || 'پیکربندی اول', link: v.link, protocol: String(v.protocol || ''), server: String(v.server || ''), label: String(v.label || ''), savedAt: String(v.appliedAt || '') }
  return { profiles: [profile], routes: v.enabled === true ? { telegram: 'p1', instagram: 'p1' } : {}, appliedAt: String(v.appliedAt || '') }
}

export function nextProfileId(settings: EgressSettings) {
  return PROFILE_IDS.find((id) => !settings.profiles.some((p) => p.id === id)) || null
}

/**
 * What the root helper is asked to run: version 2 with every profile a purpose uses; or, for a version-1 builder, the
 * one outbound Telegram and Instagram share. Null when nothing goes through the proxy (the helper then stops it).
 */
export function helperPayload<T>(settings: EgressSettings, outboundOf: (profile: EgressProfile) => T, builder: number):
  { kind: 'v2'; body: { version: 2; profiles: { tag: string; outbound: T }[]; routes: Record<string, string> } } | { kind: 'v1'; body: T } | { kind: 'none' } | { kind: 'old-builder' } {
  const routes = Object.entries(settings.routes).filter(([, id]) => id) as [EgressPurpose, string][]
  if (!routes.length) return { kind: 'none' }
  const used = settings.profiles.filter((p) => routes.some(([, id]) => id === p.id))
  if (builder >= 2) return { kind: 'v2', body: { version: 2, profiles: used.map((p) => ({ tag: p.id, outbound: outboundOf(p) })), routes: Object.fromEntries(routes) } }
  const ids = new Set(routes.map(([, id]) => id))
  if (ids.size !== 1 || routes.some(([purpose]) => !LEGACY_PURPOSES.includes(purpose))) return { kind: 'old-builder' }
  return { kind: 'v1', body: outboundOf(used[0]) }
}
