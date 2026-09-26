import type { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { logEvent, requestIdFrom } from '@/platform/observability/logger'

const REDACT = /password|secret|token|authorization|cookie|api[_-]?key|private[_-]?key/i

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[max-depth]'
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitize(item, depth + 1))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = REDACT.test(key) ? '[redacted]' : sanitize(item, depth + 1)
    }
    return out
  }
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'string' && value.length > 1000) return `${value.slice(0, 1000)}…`
  return value
}

function requestIp(req: NextRequest) {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || req.headers.get('x-real-ip')?.trim() || ''
}

export async function auditAdmin(input: {
  req: NextRequest
  actor: { id: number; email: string }
  action: string
  targetType: string
  targetId?: string | number | null
  metadata?: Record<string, unknown>
}) {
  const requestId = requestIdFrom(input.req.headers)
  const metadata = JSON.stringify(sanitize(input.metadata || {})).slice(0, 12_000)
  try {
    await db.auditLog.create({
      data: {
        actorUserId: input.actor.id,
        actorEmail: input.actor.email,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId == null ? '' : String(input.targetId),
        requestId,
        ip: requestIp(input.req),
        metadata,
      },
    })
  } catch (error) {
    // Audit failure must be visible, but it must not corrupt an already committed business action.
    logEvent('error', 'audit.write_failed', { requestId, action: input.action, targetType: input.targetType, error })
  }
}
