import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import type { Permission } from '@/modules/identity/rbac'

const MAX_TAKE = 100

function safeMetadata(raw: string) {
  try { return JSON.parse(raw || '{}') }
  catch { return {} }
}

export async function GET(req: NextRequest) {
  const admin = await requirePerm(req, 'audit.view' as Permission)
  if (!admin) return err('forbidden', 403)

  const sp = req.nextUrl.searchParams
  const take = Math.min(Math.max(Number(sp.get('take')) || 50, 1), MAX_TAKE)
  const cursor = Math.max(Number(sp.get('cursor')) || 0, 0)
  const actorUserId = Math.max(Number(sp.get('actorUserId')) || 0, 0)
  const action = (sp.get('action') || '').trim()
  const targetType = (sp.get('targetType') || '').trim()
  const requestId = (sp.get('requestId') || '').trim()
  const targetId = (sp.get('targetId') || '').trim().slice(0, 80)
  const day = (value: string | null) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00+03:30`) : null)
  const from = day(sp.get('from')), until = day(sp.get('to'))

  const where: Record<string, unknown> = {}
  if (cursor) where.id = { lt: cursor }
  if (actorUserId) where.actorUserId = actorUserId
  if (action) where.action = { contains: action }
  if (targetType) where.targetType = targetType
  if (requestId) where.requestId = requestId
  // The events of one item: its kind and its id together.
  if (targetId) where.targetId = targetId
  if (from || until) where.createdAt = { ...(from ? { gte: from } : {}), ...(until ? { lt: new Date(until.getTime() + 86_400_000) } : {}) }

  const rows = await db.auditLog.findMany({
    where,
    orderBy: { id: 'desc' },
    take: take + 1,
  })
  const hasMore = rows.length > take
  const items = rows.slice(0, take).map((row) => ({
    id: row.id,
    actorUserId: row.actorUserId,
    actorEmail: row.actorEmail,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    requestId: row.requestId,
    ip: row.ip,
    metadata: safeMetadata(row.metadata),
    createdAt: row.createdAt,
  }))

  return ok({ items, nextCursor: hasMore ? items.at(-1)?.id || null : null })
}
