import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { db } from '@/platform/database/prisma'
import { kv } from '@/platform/cache/kv'
import { egressFetch } from '@/modules/social/server/egress'
import { decryptPanelCredential, encryptPanelCredential } from '@/modules/providers/server/panel-credentials'
import { siteBaseUrl } from '@/modules/site/server/site-url'
import { createSectionSettingsHistory, type SectionSettingsContext } from '@/modules/settings/server/section-history'
import { RevisionError } from '@/modules/content/server/revisions'
import { globalAuthenticationDenied } from '@/modules/identity/server/authentication-restrictions'
import { safeNext } from '@/modules/identity/domain/continuation'
import {
  GOOGLE_CALLBACK_PATH, GOOGLE_FLOW_TTL_MS, GOOGLE_SETTINGS_KEY, GOOGLE_TICKET_TTL_MS, GOOGLE_TOKEN_URL,
  checkGoogleClaims, decodeIdTokenPayload, googleAuthorizeUrl, normalizeGoogleLogin, validGoogleClientId,
  type GoogleIdentity, type GoogleIntent, type GoogleLoginError, type GoogleLoginSettings,
} from '@/modules/identity/domain/google-login'

/**
 * Google sign-in for members (owner, 2026-11-10). Settings live with the sign-in security policy
 * (Admin › امنیت › ورود با گوگل, `settings.manage`); the client secret is encrypted at rest with the same key as
 * the site's other provider credentials. The flow is OpenID Connect's authorization code with PKCE; the
 * Google account is its `sub`. A member who already has an account by that email address is never joined to it
 * silently: they sign in as always and connect Google from their account settings (as with Telegram), so an
 * address registered by someone else cannot hand its owner's Google sign-in to that person.
 *
 * After Google, the browser gets a one-time ticket in the address fragment; `signIn('google', { ticket })` turns it
 * into the ordinary session, so 2-step codes, restrictions and the required-details step all still apply.
 */

export class GoogleLoginFailure extends Error {
  constructor(readonly code: GoogleLoginError) { super(code) }
}

const b64 = (bytes: number) => randomBytes(bytes).toString('base64url')
const digest = (value: string) => createHash('sha256').update(value).digest('base64url')
const flowKey = (state: string) => `google:flow:${digest(state)}`
const ticketKey = (ticket: string) => `google:ticket:${digest(ticket)}`
const shapeOk = (value: unknown, length = 43): value is string => typeof value === 'string' && value.length === length && /^[A-Za-z0-9_-]+$/.test(value)

// ---------- settings ----------

const history = createSectionSettingsHistory(GOOGLE_SETTINGS_KEY, 'settings-google-login', normalizeGoogleLogin, value => ({
  enabled: value.enabled, signup: value.signup, clientId: value.clientId, secret: value.clientSecret ? 'saved' : 'missing',
}), { action: 'google_login.settings.update', targetId: GOOGLE_SETTINGS_KEY })

export const googleLoginSettingsState = history.current
export const restoreGoogleLoginSettings = history.restore

export async function getGoogleLogin(): Promise<GoogleLoginSettings> {
  const row = await db.setting.findUnique({ where: { key: GOOGLE_SETTINGS_KEY } }).catch(() => null)
  let parsed: unknown
  try { parsed = row ? JSON.parse(row.value) : undefined } catch { parsed = undefined }
  return normalizeGoogleLogin(parsed)
}

/** What the Admin page may see: everything except the secret itself. */
export function publicGoogleSettings(value: GoogleLoginSettings) {
  return { enabled: value.enabled, clientId: value.clientId, signup: value.signup, clientSecret: '', secretSaved: Boolean(value.clientSecret) }
}

export async function googleLoginStatus() {
  return { redirectUri: `${await siteBaseUrl().catch(() => 'https://example.com')}${GOOGLE_CALLBACK_PATH}` }
}

export async function saveGoogleLogin(input: unknown, context?: SectionSettingsContext): Promise<GoogleLoginSettings> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new RevisionError('تنظیمات ورود با گوگل معتبر نیست', 422)
  const raw = input as Record<string, unknown>
  for (const field of ['enabled', 'signup'] as const) if (raw[field] !== undefined && typeof raw[field] !== 'boolean') throw new RevisionError('تنظیمات ورود با گوگل معتبر نیست', 422)
  if (raw.clientId !== undefined && typeof raw.clientId !== 'string') throw new RevisionError('شناسهٔ کلاینت معتبر نیست', 422)
  const clientId = typeof raw.clientId === 'string' ? raw.clientId.trim() : undefined
  if (clientId && !validGoogleClientId(clientId)) throw new RevisionError('شناسهٔ کلاینت گوگل باید به شکل …apps.googleusercontent.com باشد', 422)
  const newSecret = typeof raw.clientSecret === 'string' ? raw.clientSecret.trim() : ''
  if (newSecret && !/^[A-Za-z0-9_-]{10,200}$/.test(newSecret)) throw new RevisionError('رمز کلاینت گوگل معتبر نیست', 422)
  return history.save((before: GoogleLoginSettings) => {
    const next: GoogleLoginSettings = {
      enabled: typeof raw.enabled === 'boolean' ? raw.enabled : before.enabled,
      signup: typeof raw.signup === 'boolean' ? raw.signup : before.signup,
      clientId: clientId ?? before.clientId,
      // An empty field keeps the saved secret; a new one replaces it, encrypted.
      clientSecret: newSecret ? encryptPanelCredential(newSecret) : raw.clearSecret === true ? '' : before.clientSecret,
    }
    if (next.enabled && (!validGoogleClientId(next.clientId) || !next.clientSecret)) throw new RevisionError('برای روشن کردن ورود با گوگل، شناسه و رمز کلاینت را وارد کنید', 422)
    return next
  }, context)
}

/** Ready for members: on, with an ID and a secret this server can read. */
export async function googleLoginConfig() {
  const settings = await getGoogleLogin()
  let secret = ''
  try { secret = settings.clientSecret ? decryptPanelCredential(settings.clientSecret) : '' } catch { secret = '' }
  return { ready: settings.enabled && validGoogleClientId(settings.clientId) && Boolean(secret), clientId: settings.clientId, secret, signup: settings.signup }
}

export const googleLoginAvailable = async () => (await googleLoginConfig()).ready

// ---------- the flow ----------

type Flow = { v: 1; verifier: string; nonce: string; next: string; intent: GoogleIntent; userId: number; at: number }

/** Begins a sign-in (or, for a signed-in member, a connection): the address of Google's chooser and the state the browser keeps. */
export async function startGoogleSignIn(input: { intent: GoogleIntent; next?: unknown; userId?: number; locale?: string }) {
  const config = await googleLoginConfig()
  if (!config.ready) throw new GoogleLoginFailure('unavailable')
  if (input.intent === 'link' && !(Number.isSafeInteger(input.userId) && Number(input.userId) > 0)) throw new GoogleLoginFailure('not-allowed')
  const state = b64(32), verifier = b64(32), nonce = b64(24)
  const flow: Flow = { v: 1, verifier, nonce, next: safeNext(input.next), intent: input.intent, userId: input.intent === 'link' ? Number(input.userId) : 0, at: Date.now() }
  await (await kv()).set(flowKey(state), JSON.stringify(flow), GOOGLE_FLOW_TTL_MS)
  const url = googleAuthorizeUrl({ clientId: config.clientId, redirectUri: `${await siteBaseUrl()}${GOOGLE_CALLBACK_PATH}`, state, nonce, challenge: digest(verifier), locale: input.locale })
  return { url, state }
}

/** The started flow behind `state`, taken once. The browser's own copy of the state must match. */
async function takeFlow(state: unknown, browserState: unknown): Promise<Flow> {
  if (!shapeOk(state) || !shapeOk(browserState)) throw new GoogleLoginFailure('expired')
  const a = Buffer.from(state), b = Buffer.from(browserState)
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new GoogleLoginFailure('expired')
  const store = await kv()
  if (!await store.lock(`${flowKey(state)}:taken`, GOOGLE_FLOW_TTL_MS)) throw new GoogleLoginFailure('expired')
  const raw = await store.get(flowKey(state))
  await store.del(flowKey(state))
  let flow: Flow | null = null
  try { flow = raw ? JSON.parse(raw) as Flow : null } catch { flow = null }
  if (!flow || flow.v !== 1 || !shapeOk(flow.verifier) || typeof flow.nonce !== 'string' || Date.now() - flow.at > GOOGLE_FLOW_TTL_MS) throw new GoogleLoginFailure('expired')
  return flow
}

/** Exchanges Google's code for its ID token (through the site's proxy when the owner routed Google there). */
async function googleIdentity(code: string, flow: Flow, config: Awaited<ReturnType<typeof googleLoginConfig>>): Promise<GoogleIdentity> {
  let response: Response
  try {
    response = await egressFetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ code, client_id: config.clientId, client_secret: config.secret, redirect_uri: `${await siteBaseUrl()}${GOOGLE_CALLBACK_PATH}`, grant_type: 'authorization_code', code_verifier: flow.verifier }).toString(),
      signal: AbortSignal.timeout(15_000),
      redirect: 'error',
      cache: 'no-store',
    })
  } catch {
    throw new GoogleLoginFailure('unreachable')
  }
  const text = await response.text().catch(() => '')
  if (!response.ok || text.length > 65_536) throw new GoogleLoginFailure('failed')
  let body: { id_token?: unknown } | null = null
  try { body = JSON.parse(text) } catch { body = null }
  const claims = checkGoogleClaims(decodeIdTokenPayload(body?.id_token), { clientId: config.clientId, nonce: flow.nonce })
  if (!claims.ok) throw new GoogleLoginFailure('failed')
  return claims.identity
}

export type GoogleOutcome = { kind: 'ticket'; ticket: string; next: string } | { kind: 'linked'; next: string }

/** Google sent the member back: check everything, then sign in, create the account, or connect it. */
export async function finishGoogleSignIn(input: { code?: string | null; state?: string | null; browserState?: string | null; error?: string | null }): Promise<GoogleOutcome> {
  const flow = await takeFlow(input.state, input.browserState)
  if (input.error) throw Object.assign(new GoogleLoginFailure('cancelled'), { intent: flow.intent })
  try {
    const config = await googleLoginConfig()
    if (!config.ready) throw new GoogleLoginFailure('unavailable')
    if (typeof input.code !== 'string' || !input.code || input.code.length > 2048) throw new GoogleLoginFailure('failed')
    const identity = await googleIdentity(input.code, flow, config)
    if (flow.intent === 'link') {
      await connectGoogle(flow.userId, identity)
      return { kind: 'linked', next: flow.next }
    }
    const userId = await userForGoogle(identity, config.signup)
    return { kind: 'ticket', ticket: await issueGoogleTicket(userId), next: flow.next }
  } catch (error) {
    if (error instanceof GoogleLoginFailure) throw Object.assign(error, { intent: flow.intent })
    throw error
  }
}

const isUnique = (error: unknown) => (error as { code?: string })?.code === 'P2002'
const target = (error: unknown) => String((error as { meta?: { target?: unknown } })?.meta?.target || '')

/** The member this Google account signs in, creating one only for an address no account uses. */
export async function userForGoogle(identity: GoogleIdentity, signup: boolean): Promise<number> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const known = await db.user.findUnique({ where: { googleId: identity.sub }, select: { id: true, status: true } })
    if (known) {
      if (known.status !== 'ACTIVE' || await globalAuthenticationDenied(known.id)) throw new GoogleLoginFailure('not-allowed')
      await db.user.update({ where: { id: known.id }, data: { googleEmail: identity.email, lastLoginAt: new Date() } })
      return known.id
    }
    if (!signup) throw new GoogleLoginFailure('signup-closed')
    if (!identity.email || !identity.emailVerified) throw new GoogleLoginFailure('unverified')
    if (await db.user.findUnique({ where: { email: identity.email }, select: { id: true } })) throw new GoogleLoginFailure('email-exists')
    try {
      const now = new Date()
      const created = await db.user.create({
        data: {
          email: identity.email, name: identity.name || identity.email.split('@')[0],
          // Nobody knows this password; the member signs in with Google, a code, or a password they set later.
          passwordHash: await bcrypt.hash(b64(24), 10),
          googleId: identity.sub, googleEmail: identity.email, googleLinkedAt: now, lastLoginAt: now,
        },
        select: { id: true },
      })
      return created.id
    } catch (error) {
      // Two returns from Google at once: the first created the account; this one signs into it.
      if (isUnique(error) && target(error).includes('googleId') && attempt === 0) continue
      if (isUnique(error)) throw new GoogleLoginFailure('email-exists')
      throw error
    }
  }
  throw new GoogleLoginFailure('failed')
}

/** Connects a Google account to a signed-in member. One Google account per member, one member per Google account. */
export async function connectGoogle(userId: number, identity: GoogleIdentity) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, status: true, googleId: true } })
  if (!user || user.status !== 'ACTIVE' || await globalAuthenticationDenied(user.id)) throw new GoogleLoginFailure('not-allowed')
  if (user.googleId === identity.sub) return
  if (user.googleId) throw new GoogleLoginFailure('other-google')
  const owner = await db.user.findUnique({ where: { googleId: identity.sub }, select: { id: true } })
  if (owner) throw new GoogleLoginFailure('already-linked')
  try {
    // Only while the member still has no Google account: a parallel connection cannot replace the first.
    const result = await db.user.updateMany({ where: { id: user.id, googleId: null }, data: { googleId: identity.sub, googleEmail: identity.email, googleLinkedAt: new Date() } })
    if (result.count !== 1) throw new GoogleLoginFailure('other-google')
  } catch (error) {
    if (isUnique(error)) throw new GoogleLoginFailure('already-linked')
    throw error
  }
}

/** The member's Google connection, for their account settings. */
export async function googleConnection(userId: number) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { googleId: true, googleEmail: true, googleLinkedAt: true, createdAt: true, phoneVerifiedAt: true, telegramId: true, passwordChangedAt: true } })
  if (!user) return null
  return { linked: Boolean(user.googleId), email: user.googleEmail, linkedAt: user.googleLinkedAt, canDisconnect: Boolean(user.googleId) && hasOtherWayIn(user) }
}

/**
 * Another way into the account than Google: a verified mobile, Telegram, a password the member set, or an account
 * that existed (with its own sign-in) before Google was connected. An account Google created has none of these.
 */
function hasOtherWayIn(user: { googleLinkedAt: Date | null; createdAt: Date; phoneVerifiedAt: Date | null; telegramId: string | null; passwordChangedAt: Date | null }) {
  if (user.phoneVerifiedAt || user.telegramId || user.passwordChangedAt) return true
  return Boolean(user.googleLinkedAt && user.createdAt.getTime() < user.googleLinkedAt.getTime() - 60_000)
}

export async function disconnectGoogle(userId: number) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { googleId: true, googleLinkedAt: true, createdAt: true, phoneVerifiedAt: true, telegramId: true, passwordChangedAt: true } })
  if (!user?.googleId) return
  if (!hasOtherWayIn(user)) throw new RevisionError('پیش از جدا کردن گوگل، شمارهٔ موبایل را تأیید کنید یا رمز عبور بگذارید تا راه ورود دیگری داشته باشید.', 409)
  await db.user.updateMany({ where: { id: userId, googleId: user.googleId }, data: { googleId: null, googleEmail: '', googleLinkedAt: null } })
}

// ---------- the one-time ticket ----------

export async function issueGoogleTicket(userId: number) {
  const ticket = b64(32)
  await (await kv()).set(ticketKey(ticket), String(userId), GOOGLE_TICKET_TTL_MS)
  return ticket
}

/** The member a ticket signs in, without using it up (a 2-step code may still be asked for). */
export async function peekGoogleTicket(ticket: unknown): Promise<number | null> {
  if (!shapeOk(ticket)) return null
  const value = Number(await (await kv()).get(ticketKey(ticket)))
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

/** Uses the ticket up; only the first caller succeeds. */
export async function consumeGoogleTicket(ticket: unknown): Promise<boolean> {
  if (!shapeOk(ticket)) return false
  const store = await kv()
  if (!await store.lock(`${ticketKey(ticket)}:used`, GOOGLE_TICKET_TTL_MS)) return false
  const present = await store.get(ticketKey(ticket))
  await store.del(ticketKey(ticket))
  return Boolean(present)
}
