import crypto from 'node:crypto'
import type { NextRequest, NextResponse } from 'next/server'
import { err } from '@/platform/http/response'
import { authSecret, env } from '@/platform/config/env'
import { clientIp } from '@/platform/http/rate-limit'
import { db } from '@/platform/database/prisma'
import { moduleGuard } from '@/extensions/server/modules'
import { requirePerm, type AuthedUser } from '@/modules/identity/server/access'
import { canonicalIp, ipAllowed, parseAllowlist } from '@/modules/server-panel/domain/policy'

// The server panel is full server trust, so every request passes four locks:
// 1. SERVER_PANEL_ENABLED=true in the environment (off by default),
// 2. the server.manage permission,
// 3. the IP allowlist (SERVER_PANEL_ALLOWED_IPS) when configured,
// 4. a short "unlocked" window opened by re-entering the password (and the
//    2-step code when set up), bound to this user, password and IP.

export const UNLOCK_COOKIE = 'mc_srv'
export const COOKIE_PATH = '/api/admin/server'

export type PanelConfig = { enabled: boolean; allowlist: string[]; unlockMinutes: number; root: string }

export function panelConfig(): PanelConfig {
  const minutes = Number(env('SERVER_PANEL_UNLOCK_MINUTES') || 15)
  return {
    enabled: env('SERVER_PANEL_ENABLED') === 'true',
    allowlist: parseAllowlist(env('SERVER_PANEL_ALLOWED_IPS')),
    unlockMinutes: Number.isFinite(minutes) ? Math.min(120, Math.max(3, Math.round(minutes))) : 15,
    root: env('SERVER_PANEL_ROOT') || '/',
  }
}

export const requestIp = (req: NextRequest) => canonicalIp(clientIp(req.headers))

function signingKey() {
  return crypto.createHash('sha256').update(`server-panel:${authSecret()}`).digest()
}

const fingerprint = (passwordHash: string) => crypto.createHash('sha256').update(passwordHash).digest('base64url').slice(0, 16)

function signature(userId: number, expires: number, passwordHash: string, ip: string) {
  return crypto.createHmac('sha256', signingKey()).update(`${userId}.${expires}.${fingerprint(passwordHash)}.${ip}`).digest('base64url')
}

export function unlockToken(userId: number, passwordHash: string, ip: string, minutes: number) {
  const expires = Date.now() + minutes * 60_000
  return { value: `${userId}.${expires}.${signature(userId, expires, passwordHash, ip)}`, expires }
}

/** Remaining unlocked milliseconds for this user/IP, or 0. */
export async function unlockedFor(req: NextRequest, user: AuthedUser): Promise<number> {
  const raw = req.cookies.get(UNLOCK_COOKIE)?.value || ''
  const [uid, exp, sig] = raw.split('.')
  const expires = Number(exp)
  if (Number(uid) !== user.id || !Number.isFinite(expires) || expires <= Date.now() || !sig) return 0
  const row = await db.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } })
  if (!row) return 0
  const expected = Buffer.from(signature(user.id, expires, row.passwordHash, requestIp(req)))
  const given = Buffer.from(sig)
  return expected.length === given.length && crypto.timingSafeEqual(expected, given) ? expires - Date.now() : 0
}

export function setUnlockCookie(response: NextResponse, token: { value: string; expires: number }) {
  response.cookies.set(UNLOCK_COOKIE, token.value, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: COOKIE_PATH, expires: new Date(token.expires) })
}

export function clearUnlockCookie(response: NextResponse) {
  response.cookies.set(UNLOCK_COOKIE, '', { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: COOKIE_PATH, maxAge: 0 })
}

type GateResult = { user: AuthedUser; config: PanelConfig } | { response: NextResponse }

/**
 * Locks 1–3 (and 4 unless `locked` is allowed, used by the status/unlock
 * endpoints). Responses carry a machine code so the UI knows what to show.
 */
export async function serverGate(req: NextRequest, options: { allowLocked?: boolean } = {}): Promise<GateResult> {
  const off = await moduleGuard('server-panel')
  if (off) return { response: off }
  const user = await requirePerm(req, 'server.manage')
  if (!user) return { response: err('حساب شما مجوز «پنل سرور» را ندارد. مدیر اصلی باید در «نقش‌ها و دسترسی‌ها» این مجوز را به نقش شما بدهد.', 403, { code: 'forbidden' }) }
  const config = panelConfig()
  if (!config.enabled) return { response: err('پنل سرور خاموش است. برای روشن‌کردن، SERVER_PANEL_ENABLED=true را در فایل محیطی سرور بگذارید.', 423, { code: 'disabled' }) }
  if (!ipAllowed(requestIp(req), config.allowlist)) return { response: err(`دسترسی از این IP (${requestIp(req)}) مجاز نیست.`, 403, { code: 'ip' }) }
  if (!options.allowLocked && !await unlockedFor(req, user)) return { response: err('برای ادامه، رمز عبور خود را دوباره وارد کنید.', 401, { code: 'locked' }) }
  return { user, config }
}
