import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import type { Permission } from '@/modules/identity/rbac'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'

export async function GET(req: NextRequest) {
  const admin = await requirePerm(req, 'users.manage' as Permission)
  if (!admin) return err('forbidden', 403)
  const notes = await db.crmNote.findMany({
    where: { userId: Number(req.nextUrl.searchParams.get('userId')) || 0 },
    orderBy: { createdAt: 'desc' },
  })
  return ok(notes)
}

export async function POST(req: NextRequest) {
  const admin = await requirePerm(req, 'users.manage' as Permission)
  if (!admin) return err('forbidden', 403)
  const body = await req.json().catch(() => null)
  const userId = Number(body?.userId)
  const text = String(body?.body || '').trim()
  if (!userId || !text) return err('invalid input')
  const note = await db.crmNote.create({ data: { userId, adminId: admin.id, body: text } })
  return ok(note)
}
