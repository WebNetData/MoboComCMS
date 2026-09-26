import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { requirePerm } from '@/modules/identity/server/access'
import { err, ok } from '@/platform/http/response'
import { validateIncident } from '@/modules/support/domain/incidents'
export async function GET(req: NextRequest) {
  if (!await requirePerm(req, 'tickets.handle')) return err('forbidden', 403)
  const [incidents, panels] = await Promise.all([
    db.serviceIncident.findMany({ orderBy: { updatedAt: 'desc' }, take: 200 }),
    db.panel.findMany({ select: { id: true, name: true } }),
  ])
  return ok({ incidents, panels })
}
async function save(req: NextRequest, editing: boolean) {
  if (!await requirePerm(req, 'tickets.handle')) return err('forbidden', 403)
  const input = await req.json().catch(() => null)
  let data
  try { data = validateIncident(input) } catch (e) { return err((e as Error).message, 400) }
  if (data.panelId !== null && !await db.panel.findUnique({ where: { id: data.panelId }, select: { id: true } })) return err('service not found', 400)
  if (editing) {
    if (!Number.isSafeInteger(input.id) || input.id <= 0) return err('invalid id', 400)
    const result = await db.serviceIncident.updateMany({ where: { id: input.id }, data })
    if (!result.count) return err('not found', 404)
    return ok({ saved: true })
  }
  return ok(await db.serviceIncident.create({ data }))
}
export const POST = (req: NextRequest) => save(req, false)
export const PATCH = (req: NextRequest) => save(req, true)
