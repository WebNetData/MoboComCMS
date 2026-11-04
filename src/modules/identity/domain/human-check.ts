/**
 * Human check (captcha) rules: the places it protects, its settings and the proof the browser must find.
 * Pure: no secrets, storage or network. See docs/specs/human-check/SPEC.md.
 */

export const HUMAN_SURFACES = [
  { key: 'login', fa: 'ورود', hint: 'ورود با رمز، کد ایمیل و کد پیامک', group: 'auth' },
  { key: 'register', fa: 'ثبت‌نام', hint: 'ساخت حساب تازه', group: 'auth' },
  { key: 'recovery', fa: 'بازیابی رمز', hint: 'درخواست لینک یا کد بازیابی', group: 'auth' },
  { key: 'comment', fa: 'نظرهای مجله', hint: 'نظر زیر مطالب', group: 'content' },
  { key: 'review', fa: 'نقد و پرسش', hint: 'نقد آیتم‌ها و پرسش دربارهٔ محصول', group: 'content' },
  { key: 'forum', fa: 'تالار گفتمان', hint: 'موضوع تازه و پاسخ', group: 'content' },
  { key: 'community', fa: 'شبکهٔ اجتماعی', hint: 'پست و دیدگاه', group: 'content' },
  { key: 'form', fa: 'فرم‌ها', hint: 'فرم‌های عمومی، خبرنامه و گزارش حق نشر', group: 'content' },
  { key: 'message', fa: 'گفت‌وگوی آنلاین', hint: 'گفت‌وگویی که بازدیدکننده شروع می‌کند', group: 'content' },
] as const

export type HumanSettingSurface = typeof HUMAN_SURFACES[number]['key']
/** OTP entry can create an account as well as sign in; use the stricter combined policy without revealing membership. */
export type HumanSurface = HumanSettingSurface | 'entry'
export type HumanProvider = 'builtin' | 'turnstile' | 'off'
export type HumanDifficulty = 'low' | 'normal' | 'high'
export type HumanCheckSettings = { provider: HumanProvider; difficulty: HumanDifficulty; surfaces: Record<HumanSettingSurface, boolean> }

export const DIFFICULTY_BITS: Record<HumanDifficulty, number> = { low: 14, normal: 16, high: 18 }
export const CHALLENGE_TTL_MS = 10 * 60_000
/** Seconds a person needs at least between opening a form and sending it. Sign-in is often filled by a password manager. */
export const MIN_SECONDS: Record<'auth' | 'content', number> = { auth: 0, content: 3 }

export const isHumanSurface = (value: unknown): value is HumanSurface => value === 'entry' || HUMAN_SURFACES.some((s) => s.key === value)
export const surfaceGroup = (surface: HumanSurface) => surface === 'entry' ? 'auth' : HUMAN_SURFACES.find((s) => s.key === surface)!.group
/** Places the page security policy lets Cloudflare Turnstile load on; elsewhere the built-in check is used. */
export const TURNSTILE_SURFACES: readonly HumanSurface[] = ['login', 'register', 'recovery', 'entry']

export function defaultHumanCheck(turnstileReady = false): HumanCheckSettings {
  return {
    provider: turnstileReady ? 'turnstile' : 'builtin',
    difficulty: 'normal',
    surfaces: Object.fromEntries(HUMAN_SURFACES.map((s) => [s.key, true])) as Record<HumanSettingSurface, boolean>,
  }
}

export function normalizeHumanCheck(input: unknown, turnstileReady = false): HumanCheckSettings {
  const base = defaultHumanCheck(turnstileReady)
  if (!input || typeof input !== 'object') return base
  const raw = input as Record<string, unknown>
  const provider = raw.provider === 'off' || raw.provider === 'builtin' || (raw.provider === 'turnstile' && turnstileReady) ? raw.provider : base.provider
  const difficulty = raw.difficulty === 'low' || raw.difficulty === 'high' || raw.difficulty === 'normal' ? raw.difficulty : base.difficulty
  const given = raw.surfaces && typeof raw.surfaces === 'object' ? raw.surfaces as Record<string, unknown> : {}
  const surfaces = Object.fromEntries(HUMAN_SURFACES.map((s) => [s.key, typeof given[s.key] === 'boolean' ? given[s.key] as boolean : true])) as Record<HumanSettingSurface, boolean>
  return { provider, difficulty, surfaces }
}

/** Which check a place uses now: nothing, the built-in proof, or Turnstile. */
export function providerFor(settings: HumanCheckSettings, surface: HumanSurface, turnstileReady: boolean): HumanProvider {
  const enabled = surface === 'entry' ? settings.surfaces.login || settings.surfaces.register : settings.surfaces[surface]
  if (settings.provider === 'off' || !enabled) return 'off'
  if (settings.provider === 'turnstile' && turnstileReady && TURNSTILE_SURFACES.includes(surface)) return 'turnstile'
  return 'builtin'
}

/** Leading zero bits of a hex digest. */
export function leadingZeroBits(hex: string): number {
  let bits = 0
  for (const char of hex) {
    const nibble = parseInt(char, 16)
    if (Number.isNaN(nibble)) return bits
    if (nibble === 0) { bits += 4; continue }
    return bits + (Math.clz32(nibble) - 28)
  }
  return bits
}

export type ChallengePayload = { v: 1; s: HumanSurface; r: string; b: number; i: number; e: number }

export function validPayload(value: unknown): value is ChallengePayload {
  if (!value || typeof value !== 'object') return false
  const p = value as Record<string, unknown>
  return p.v === 1 && isHumanSurface(p.s) && typeof p.r === 'string' && /^[a-f0-9]{32}$/.test(p.r)
    && Number.isInteger(p.b) && (p.b as number) >= 8 && (p.b as number) <= 24
    && Number.isInteger(p.i) && Number.isInteger(p.e) && (p.e as number) > (p.i as number)
}

/** Splits a submitted proof `challenge.signature.nonce`; a fourth part means the hidden trap field was filled. */
export function parseProof(token: unknown): { body: string; signature: string; nonce: string } | null {
  if (typeof token !== 'string' || token.length > 600) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [body, signature, nonce] = parts
  if (!/^[A-Za-z0-9_-]{20,400}$/.test(body) || !/^[A-Za-z0-9_-]{43}$/.test(signature) || !/^\d{1,12}$/.test(nonce)) return null
  return { body, signature, nonce }
}

export const proofInput = (salt: string, nonce: string | number) => `${salt}:${nonce}`
