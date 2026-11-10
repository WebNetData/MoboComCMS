/**
 * Google sign-in, the parts without input or output (owner, 2026-11-10).
 *
 * The site speaks OpenID Connect with Google as a confidential web client: the authorization-code flow with PKCE,
 * a `state` bound to the browser that started it and a `nonce` bound to the ID token. The ID token comes straight
 * from Google's token endpoint over TLS, so its claims are checked here and its signature is not (OpenID Connect
 * Core 3.1.3.7, step 6). The Google account is identified by its `sub`, never by its email address.
 */

export const GOOGLE_SETTINGS_KEY = 'security.google-login.v1'
export const GOOGLE_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
export const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'] as const
/** Where Google sends the member back; the owner registers exactly this address in the Google Cloud console. */
export const GOOGLE_CALLBACK_PATH = '/api/login/google/callback'
/** A started sign-in waits this long for Google to send the member back. */
export const GOOGLE_FLOW_TTL_MS = 10 * 60_000
/** The one-time ticket between the callback and the session; long enough to type a 2-step code. */
export const GOOGLE_TICKET_TTL_MS = 5 * 60_000
export const GOOGLE_FLOW_COOKIE = 'mc_google_flow'

export type GoogleLoginSettings = {
  enabled: boolean
  /** The OAuth client ID from the Google Cloud console (public). */
  clientId: string
  /** The client secret, encrypted at rest; never sent back to a browser. */
  clientSecret: string
  /** May someone without an account create one with Google? Off: only members who connected Google sign in. */
  signup: boolean
}

const CLIENT_ID = /^[0-9]{6,30}-[a-z0-9]{8,64}\.apps\.googleusercontent\.com$/

export const validGoogleClientId = (value: string) => CLIENT_ID.test(value)

export function normalizeGoogleLogin(input: unknown): GoogleLoginSettings {
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {}
  const clientId = typeof raw.clientId === 'string' ? raw.clientId.trim().slice(0, 200) : ''
  return {
    enabled: raw.enabled === true,
    clientId,
    clientSecret: typeof raw.clientSecret === 'string' ? raw.clientSecret.slice(0, 2000) : '',
    signup: raw.signup !== false,
  }
}

export type GoogleIntent = 'login' | 'link'

/** The address that sends the member to Google's account chooser. */
export function googleAuthorizeUrl(input: { clientId: string; redirectUri: string; state: string; nonce: string; challenge: string; locale?: string }) {
  const url = new URL(GOOGLE_AUTHORIZE_URL)
  url.search = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state: input.state,
    nonce: input.nonce,
    code_challenge: input.challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
    ...(input.locale ? { hl: input.locale } : {}),
  }).toString()
  return url.toString()
}

export type GoogleIdentity = { sub: string; email: string; emailVerified: boolean; name: string; picture: string }

export type GoogleClaimsError = 'MALFORMED' | 'ISSUER' | 'AUDIENCE' | 'EXPIRED' | 'NONCE' | 'SUBJECT'

/** The payload of a compact JWT, or null. The signature part is not trusted for anything. */
export function decodeIdTokenPayload(idToken: unknown): Record<string, unknown> | null {
  if (typeof idToken !== 'string' || idToken.length > 8192) return null
  const parts = idToken.split('.')
  if (parts.length !== 3 || !parts[1]) return null
  try {
    const value: unknown = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
  } catch {
    return null
  }
}

/** Checks what Google's ID token says against this sign-in; the result names the Google account. */
export function checkGoogleClaims(payload: Record<string, unknown> | null, expected: { clientId: string; nonce: string; now?: number }): { ok: true; identity: GoogleIdentity } | { ok: false; error: GoogleClaimsError } {
  if (!payload) return { ok: false, error: 'MALFORMED' }
  const now = Math.floor((expected.now ?? Date.now()) / 1000)
  if (!GOOGLE_ISSUERS.includes(payload.iss as typeof GOOGLE_ISSUERS[number])) return { ok: false, error: 'ISSUER' }
  const audience = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
  if (!audience.includes(expected.clientId) || (Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== expected.clientId)) return { ok: false, error: 'AUDIENCE' }
  const exp = Number(payload.exp), iat = Number(payload.iat)
  // A minute of clock difference either way.
  if (!Number.isFinite(exp) || !Number.isFinite(iat) || exp + 60 < now || iat - 60 > now) return { ok: false, error: 'EXPIRED' }
  if (typeof payload.nonce !== 'string' || !expected.nonce || payload.nonce !== expected.nonce) return { ok: false, error: 'NONCE' }
  const sub = typeof payload.sub === 'string' ? payload.sub : ''
  if (!/^[0-9A-Za-z_-]{1,255}$/.test(sub)) return { ok: false, error: 'SUBJECT' }
  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase().slice(0, 254) : ''
  const name = typeof payload.name === 'string' ? payload.name.replace(/\s+/g, ' ').trim().slice(0, 120) : ''
  const picture = typeof payload.picture === 'string' && /^https:\/\/[a-z0-9.-]+\.googleusercontent\.com\//i.test(payload.picture) ? payload.picture.slice(0, 500) : ''
  return { ok: true, identity: { sub, email, emailVerified: payload.email_verified === true || payload.email_verified === 'true', name, picture } }
}

/** What a member who comes back from Google sees when it did not work (`/login?google=<code>`). */
export const GOOGLE_LOGIN_ERRORS = {
  unavailable: 'ورود با گوگل هم‌اکنون فعال نیست.',
  cancelled: 'ورود با گوگل لغو شد.',
  expired: 'زمان ورود با گوگل گذشت یا از مرورگر دیگری ادامه داده شد؛ دوباره تلاش کنید.',
  failed: 'پاسخ گوگل تأیید نشد؛ دوباره تلاش کنید.',
  unreachable: 'سایت به گوگل دسترسی نداشت؛ کمی بعد دوباره تلاش کنید.',
  unverified: 'نشانی ایمیل این حساب گوگل تأیید نشده است.',
  'email-exists': 'با این ایمیل قبلاً حساب ساخته شده است. با همان روش همیشگی وارد شوید و سپس از «تنظیمات حساب» گوگل را به حساب وصل کنید.',
  'signup-closed': 'ساخت حساب تازه با گوگل بسته است. اگر حساب دارید، وارد شوید و از «تنظیمات حساب» گوگل را وصل کنید.',
  'not-allowed': 'ورود به این حساب ممکن نیست.',
  'already-linked': 'این حساب گوگل به حساب دیگری وصل است.',
  'other-google': 'حساب دیگری از گوگل به این حساب وصل است؛ اول آن را جدا کنید.',
} as const
export type GoogleLoginError = keyof typeof GOOGLE_LOGIN_ERRORS
export const isGoogleLoginError = (value: unknown): value is GoogleLoginError => typeof value === 'string' && Object.hasOwn(GOOGLE_LOGIN_ERRORS, value)
