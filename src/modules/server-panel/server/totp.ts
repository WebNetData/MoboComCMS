import crypto from 'node:crypto'
import { db } from '@/platform/database/prisma'
import { decryptPanelCredential, encryptPanelCredential } from '@/modules/providers/server/panel-credentials'
import { base32Decode, base32Encode, hotpFromDigest, totpCounter } from '@/modules/server-panel/domain/policy'

// Per-admin 2-step codes for the server panel (any authenticator app).
// Secrets are stored encrypted with PANEL_CREDENTIAL_KEY.

const activeKey = (userId: number) => `server-panel.totp.${userId}`
const pendingKey = (userId: number) => `server-panel.totp-pending.${userId}`

async function readSecret(key: string): Promise<string | null> {
  const row = await db.setting.findUnique({ where: { key } }).catch(() => null)
  if (!row?.value) return null
  try { return decryptPanelCredential(row.value) } catch { return null }
}

const store = (key: string, secret: string) => db.setting.upsert({ where: { key }, update: { value: encryptPanelCredential(secret) }, create: { key, value: encryptPanelCredential(secret) } })

export function totpCode(secret: string, now = Date.now()): string {
  const digest = crypto.createHmac('sha1', Buffer.from(base32Decode(secret))).update(Buffer.from(totpCounter(now))).digest()
  return hotpFromDigest(new Uint8Array(digest))
}

/** Accepts the current code and one step either side (clock drift). */
export function verifyTotp(secret: string, code: unknown, now = Date.now()): boolean {
  const given = String(code || '').replace(/\s/g, '')
  if (!/^\d{6}$/.test(given)) return false
  return [-1, 0, 1].some((drift) => {
    const expected = Buffer.from(totpCode(secret, now + drift * 30_000))
    return crypto.timingSafeEqual(expected, Buffer.from(given))
  })
}

export async function hasTotp(userId: number) {
  return !!await readSecret(activeKey(userId))
}

export async function checkTotp(userId: number, code: unknown) {
  const secret = await readSecret(activeKey(userId))
  return secret ? verifyTotp(secret, code) : true
}

export async function beginTotp(userId: number) {
  const secret = base32Encode(new Uint8Array(crypto.randomBytes(20)))
  await store(pendingKey(userId), secret)
  return secret
}

export async function confirmTotp(userId: number, code: unknown) {
  const secret = await readSecret(pendingKey(userId))
  if (!secret || !verifyTotp(secret, code)) return false
  await store(activeKey(userId), secret)
  await db.setting.delete({ where: { key: pendingKey(userId) } }).catch(() => null)
  return true
}

export async function disableTotp(userId: number, code: unknown) {
  const secret = await readSecret(activeKey(userId))
  if (!secret || !verifyTotp(secret, code)) return false
  await db.setting.delete({ where: { key: activeKey(userId) } }).catch(() => null)
  return true
}
