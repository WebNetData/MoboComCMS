import type { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import QRCode from 'qrcode'
import { err, ok } from '@/platform/http/response'
import { auditAdmin } from '@/platform/audit/server'
import { db } from '@/platform/database/prisma'
import { totpUri } from '@/modules/server-panel/domain/policy'
import { clearUnlockCookie, requestIp, serverGate, setUnlockCookie, unlockToken, unlockedFor } from '@/modules/server-panel/server/gate'
import { beginTotp, checkTotp, confirmTotp, disableTotp, hasTotp } from '@/modules/server-panel/server/totp'
import { serverStatus, serviceAction, type ServiceAction } from '@/modules/server-panel/server/system'

// Failed unlock attempts per user+IP: 5 per 15 minutes, then a lockout until the window ends.
const failures = new Map<string, { count: number; resetAt: number }>()
const FAIL_LIMIT = 5, FAIL_WINDOW = 15 * 60_000
function lockedOut(key: string) {
  const entry = failures.get(key)
  if (!entry || entry.resetAt <= Date.now()) { failures.delete(key); return 0 }
  return entry.count >= FAIL_LIMIT ? entry.resetAt - Date.now() : 0
}
function recordFailure(key: string) {
  const now = Date.now()
  if (failures.size > 5000) for (const [k, v] of failures) if (v.resetAt <= now) failures.delete(k)
  const entry = failures.get(key)
  if (!entry || entry.resetAt <= now) failures.set(key, { count: 1, resetAt: now + FAIL_WINDOW })
  else entry.count++
}

/** GET /api/admin/server/session — lock state (works while locked). */
export async function GET_session(req: NextRequest) {
  const gate = await serverGate(req, { allowLocked: true })
  if ('response' in gate) return gate.response
  const remaining = await unlockedFor(req, gate.user)
  return ok({ unlocked: remaining > 0, remainingMs: remaining, totp: await hasTotp(gate.user.id), ip: requestIp(req), ipRestricted: gate.config.allowlist.length > 0, unlockMinutes: gate.config.unlockMinutes, root: gate.config.root, appDir: process.cwd() })
}

/** POST /api/admin/server/session {password, code?} — open the unlock window. DELETE — lock now. */
export async function POST_session(req: NextRequest) {
  const gate = await serverGate(req, { allowLocked: true })
  if ('response' in gate) return gate.response
  const ip = requestIp(req)
  const key = `${gate.user.id}:${ip}`
  const wait = lockedOut(key)
  if (wait) return err(`تلاش‌های ناموفق زیاد بود؛ ${Math.ceil(wait / 60_000).toLocaleString('fa-IR')} دقیقهٔ دیگر دوباره امتحان کنید.`, 429)
  const body = await req.json().catch(() => null) as { password?: unknown; code?: unknown } | null
  const row = await db.user.findUnique({ where: { id: gate.user.id }, select: { passwordHash: true } })
  const passwordOk = !!row && await bcrypt.compare(String(body?.password || ''), row.passwordHash)
  const codeOk = passwordOk && await checkTotp(gate.user.id, body?.code)
  if (!passwordOk || !codeOk) {
    recordFailure(key)
    await auditAdmin({ req, actor: gate.user, action: 'server.unlock_failed', targetType: 'server', metadata: { reason: passwordOk ? 'totp' : 'password' } })
    return err(passwordOk ? 'کد دومرحله‌ای درست نیست' : 'رمز عبور درست نیست', 401, { code: passwordOk ? 'totp' : 'password' })
  }
  failures.delete(key)
  const token = unlockToken(gate.user.id, row!.passwordHash, ip, gate.config.unlockMinutes)
  await auditAdmin({ req, actor: gate.user, action: 'server.unlock', targetType: 'server', metadata: { minutes: gate.config.unlockMinutes } })
  const response = ok({ unlocked: true, remainingMs: token.expires - Date.now() })
  setUnlockCookie(response, token)
  return response
}

export async function DELETE_session(req: NextRequest) {
  const gate = await serverGate(req, { allowLocked: true })
  if ('response' in gate) return gate.response
  await auditAdmin({ req, actor: gate.user, action: 'server.lock', targetType: 'server' })
  const response = ok({ unlocked: false })
  clearUnlockCookie(response)
  return response
}

/** GET /api/admin/server/status — host, CPU, memory, disks, services, processes. */
export async function GET_status(req: NextRequest) {
  const gate = await serverGate(req)
  if ('response' in gate) return gate.response
  return ok(await serverStatus())
}

/** POST /api/admin/server/services {id, action} */
export async function POST_services(req: NextRequest) {
  const gate = await serverGate(req)
  if ('response' in gate) return gate.response
  const body = await req.json().catch(() => null) as { id?: unknown; action?: unknown } | null
  const id = String(body?.id || '')
  const action = String(body?.action || '') as ServiceAction
  const result = await serviceAction(id, action)
  await auditAdmin({ req, actor: gate.user, action: `server.service_${action}`, targetType: 'service', targetId: id, metadata: { ok: result.ok } })
  return result.ok ? ok({ ok: true }) : err(result.out || 'انجام نشد', 502)
}

/** POST /api/admin/server/totp {action: begin|confirm|disable, code?} */
export async function POST_totp(req: NextRequest) {
  const gate = await serverGate(req)
  if ('response' in gate) return gate.response
  const body = await req.json().catch(() => null) as { action?: unknown; code?: unknown } | null
  const action = String(body?.action || '')
  if (action === 'begin') {
    if (await hasTotp(gate.user.id)) return err('کد دومرحله‌ای از قبل فعال است', 409)
    const secret = await beginTotp(gate.user.id)
    const uri = totpUri(secret, gate.user.email, 'MoboCom Server')
    return ok({ secret, uri, qr: await QRCode.toDataURL(uri, { margin: 1, width: 220 }) })
  }
  if (action === 'confirm') {
    if (!await confirmTotp(gate.user.id, body?.code)) return err('کد درست نیست؛ ساعت گوشی را بررسی کنید و کد تازه را وارد کنید', 400)
    await auditAdmin({ req, actor: gate.user, action: 'server.totp_enabled', targetType: 'user', targetId: gate.user.id })
    return ok({ totp: true })
  }
  if (action === 'disable') {
    if (!await disableTotp(gate.user.id, body?.code)) return err('کد درست نیست', 400)
    await auditAdmin({ req, actor: gate.user, action: 'server.totp_disabled', targetType: 'user', targetId: gate.user.id })
    return ok({ totp: false })
  }
  return err('عملیات نامعتبر است')
}

/** GET /api/admin/server/activity — the panel's own audit trail. */
export async function GET_activity(req: NextRequest) {
  const gate = await serverGate(req)
  if ('response' in gate) return gate.response
  const rows = await db.auditLog.findMany({ where: { action: { startsWith: 'server.' } }, orderBy: { id: 'desc' }, take: 100, select: { id: true, actorEmail: true, action: true, targetType: true, targetId: true, ip: true, metadata: true, createdAt: true } })
  return ok({ rows })
}
