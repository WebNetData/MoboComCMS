// Customer REST API keys (Authorization: Bearer <key>).
import crypto from 'crypto'
import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { rateLimitStrict } from '@/platform/http/rate-limit'
import { globalAuthenticationDenied } from '@/modules/identity/server/authentication-restrictions'

export const API_KEY_PREFIX = 'kv_'

/** Keys are stored as SHA-256 hashes; the plaintext token never touches the DB. */
export function hashApiKey(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export function generateApiKey() {
  const token = API_KEY_PREFIX + crypto.randomBytes(24).toString('hex')
  return { token, hash: hashApiKey(token), prefix: token.slice(0, 11) }
}

export function extractApiKey(req: NextRequest): string | null {
  // Query-string keys are intentionally not accepted: URLs end up in server
  // and proxy logs. Use the Authorization or X-API-Key header.
  const auth = req.headers.get('authorization') || ''
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim()
  const header = req.headers.get('x-api-key')
  return header ? header.trim() : null
}

export interface ApiCaller {
  keyId: number
  userId: number
  email: string
  name: string
  role: string
}

/** Resolves the caller for /api/v1 requests (API key, or an active session). */
export async function resolveApiCaller(req: NextRequest): Promise<ApiCaller | null> {
  const key = extractApiKey(req)
  if (key) {
    const include = { user: { select: { id: true, email: true, name: true, role: true, status: true } } } as const
    let row = await db.apiKey.findUnique({ where: { token: hashApiKey(key) }, include })
    if (!row) {
      // One-time migration: keys created before hashing was introduced are
      // still stored in plaintext; upgrade them on first successful use.
      const legacy = await db.apiKey.findUnique({ where: { token: key }, include })
      if (legacy) {
        row = await db.apiKey
          .update({ where: { id: legacy.id }, data: { token: hashApiKey(key) }, include })
          .catch(() => legacy)
      }
    }
    if (!row || !row.active || row.user.status === 'BANNED') return null
    if (await globalAuthenticationDenied(row.userId)) return null
    await db.apiKey
      .update({ where: { id: row.id }, data: { lastUsedAt: new Date(), requests: { increment: 1 } } })
      .catch(() => {})
    return { keyId: row.id, userId: row.userId, email: row.user.email, name: row.user.name, role: row.user.role }
  }

  // session fallback (used by the dashboard playground)
  const { getServerSession } = await import('next-auth')
  const { authOptions } = await import('@/modules/identity/auth')
  const session: any = await getServerSession(authOptions)
  const uid = Number(session?.user?.id || 0)
  if (!uid) return null
  const user = await db.user.findUnique({ where: { id: uid }, select: { id: true, email: true, name: true, role: true, status: true } })
  if (!user || user.status !== 'ACTIVE' || await globalAuthenticationDenied(user.id)) return null
  return { keyId: 0, userId: user.id, email: user.email, name: user.name, role: user.role }
}

// --- per-key rate limiting (per minute) ---
export async function rateLimit(keyId: number, limit = 120) {
  const result = await rateLimitStrict(`api-key:${keyId}`, limit, 60_000)
  return { ok: result.ok, remaining: result.ok ? limit : 0, retryAfter: result.ok ? undefined : result.retryAfter }
}
