import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { err } from '@/platform/http/response'
import { authSecret } from '@/platform/config/env'
import {
  CHALLENGE_TTL_MS, DIFFICULTY_BITS, MIN_SECONDS, leadingZeroBits, normalizeHumanCheck, parseProof, proofInput, providerFor,
  surfaceGroup, validPayload, type ChallengePayload, type HumanCheckSettings, type HumanSurface,
} from '@/modules/identity/domain/human-check'
import { createSectionSettingsHistory, type SectionSettingsContext } from '@/modules/settings/server/section-history'
import { RevisionError } from '@/modules/content/server/revisions'
import { turnstileConfigured, verifyTurnstile } from '@/modules/identity/server/turnstile'

/**
 * The human check of sign-in and user writes (docs/specs/human-check/SPEC.md). The owning route asks
 * verifyHuman(token, headers, surface) before its own rules; settings live with the sign-in security policy.
 */
const SETTINGS_KEY = 'security.human-check.v1'
const turnstileReady = () => turnstileConfigured() && Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim())

export async function getHumanCheck(): Promise<HumanCheckSettings> {
  const row = await db.setting.findUnique({ where: { key: SETTINGS_KEY } })
  let parsed: unknown = undefined
  try { parsed = row ? JSON.parse(row.value) : undefined } catch { parsed = undefined }
  const value = normalizeHumanCheck(parsed, turnstileReady())
  return value
}

const history = createSectionSettingsHistory(SETTINGS_KEY, 'settings-human-check', input => normalizeHumanCheck(input, turnstileReady()), value => ({ provider: value.provider, difficulty: value.difficulty, surfaces: value.surfaces }))

export const humanCheckSettingsState = history.current
export const restoreHumanCheckSettings = history.restore

export async function saveHumanCheck(input: unknown, context?: SectionSettingsContext): Promise<HumanCheckSettings> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new RevisionError('تنظیمات کپچا معتبر نیست', 422)
  const raw = input as Record<string, unknown>
  if (raw.provider !== undefined && !['builtin', 'turnstile', 'off'].includes(String(raw.provider))) throw new RevisionError('روش کپچا معتبر نیست', 422)
  if (raw.provider === 'turnstile' && !turnstileReady()) throw new RevisionError('ابتدا کلیدهای Turnstile را در سرور تنظیم کنید', 422)
  if (raw.difficulty !== undefined && !['low', 'normal', 'high'].includes(String(raw.difficulty))) throw new RevisionError('سختی کپچا معتبر نیست', 422)
  if (raw.surfaces !== undefined && (!raw.surfaces || typeof raw.surfaces !== 'object' || Array.isArray(raw.surfaces) || Object.values(raw.surfaces).some(value => typeof value !== 'boolean'))) throw new RevisionError('انتخاب بخش‌ها معتبر نیست', 422)
  const value = await history.save((before: HumanCheckSettings) => ({ ...before, ...raw, surfaces: { ...before.surfaces, ...(raw.surfaces as object || {}) } }), context)
  return value
}

export function humanCheckStatus() { return { turnstileReady: turnstileReady() } }

const key = () => createHmac('sha256', authSecret()).update('mobocom:human-check:v1').digest()
const sign = (body: string) => createHmac('sha256', key()).update(body).digest('base64url')

export type IssuedCheck =
  | { provider: 'off' }
  | { provider: 'turnstile'; siteKey: string; action: 'login' | 'register' }
  | { provider: 'builtin'; challenge: string; bits: number; expiresAt: number; readyAt: number }

/** What the form on `surface` must do now; for the built-in check a fresh signed challenge. */
export async function issueHumanCheck(surface: HumanSurface, now = Date.now()): Promise<IssuedCheck> {
  const settings = await getHumanCheck()
  const provider = providerFor(settings, surface, turnstileReady())
  if (provider === 'off') return { provider }
  if (provider === 'turnstile') return { provider, siteKey: String(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '').trim(), action: surface === 'register' ? 'register' : 'login' }
  const payload: ChallengePayload = { v: 1, s: surface, r: randomBytes(16).toString('hex'), b: DIFFICULTY_BITS[settings.difficulty], i: now, e: now + CHALLENGE_TTL_MS }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return { provider, challenge: `${body}.${sign(body)}`, bits: payload.b, expiresAt: payload.e, readyAt: payload.i + MIN_SECONDS[surfaceGroup(surface)] * 1000 }
}

export type HumanVerdict = 'ok' | 'missing' | 'invalid' | 'expired' | 'too-fast' | 'reused'

/** Checks a built-in proof and spends it. Exported for tests; routes call verifyHuman. */
export async function checkBuiltinProof(token: unknown, surface: HumanSurface, now = Date.now()): Promise<HumanVerdict> {
  if (token === undefined || token === null || token === '') return 'missing'
  const proof = parseProof(token)
  if (!proof) return 'invalid'
  const expected = Buffer.from(sign(proof.body)), given = Buffer.from(proof.signature)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return 'invalid'
  let payload: unknown
  try { payload = JSON.parse(Buffer.from(proof.body, 'base64url').toString('utf8')) } catch { return 'invalid' }
  if (!validPayload(payload) || payload.s !== surface) return 'invalid'
  if (now >= payload.e) return 'expired'
  if (payload.i > now || payload.e - payload.i !== CHALLENGE_TTL_MS) return 'invalid'
  if (now - payload.i < MIN_SECONDS[surfaceGroup(surface)] * 1000) return 'too-fast'
  if (leadingZeroBits(createHash('sha256').update(proofInput(payload.r, proof.nonce)).digest('hex')) < payload.b) return 'invalid'
  try {
    await db.humanCheckUse.create({ data: { salt: payload.r, surface, expiresAt: new Date(payload.e) } })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return 'reused'
    throw error
  }
  // Spent challenges are only needed until they expire; a few writes clear the old ones.
  if (Math.random() < 0.05) await db.humanCheckUse.deleteMany({ where: { expiresAt: { lt: new Date(now) } } }).catch(() => null)
  return 'ok'
}

/** True when the request on `surface` passed the check its settings ask for (or none is asked). */
export async function verifyHuman(token: unknown, headers: Headers, surface: HumanSurface): Promise<boolean> {
  const settings = await getHumanCheck()
  const provider = providerFor(settings, surface, turnstileReady())
  if (provider === 'off') return true
  if (provider === 'turnstile') return verifyTurnstile(token, headers, surface === 'register' ? 'register' : 'login')
  return (await checkBuiltinProof(token, surface)) === 'ok'
}

/** The answer every route gives to a refused check; the form fetches a new challenge when it sees the code. */
export const HUMAN_CHECK_REFUSAL = { error: 'بررسی امنیتی انجام نشد؛ دوباره تلاش کنید.', code: 'HUMAN_CHECK' } as const

/** For a write route: null when the request may go on, otherwise the 400 answer with code HUMAN_CHECK. */
export async function humanCheckRefusal(token: unknown, headers: Headers, surface: HumanSurface) {
  return await verifyHuman(token, headers, surface) ? null : err(HUMAN_CHECK_REFUSAL.error, 400, { code: HUMAN_CHECK_REFUSAL.code })
}
