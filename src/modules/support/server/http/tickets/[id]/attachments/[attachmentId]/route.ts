import { NextRequest } from 'next/server'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { db } from '@/platform/database/prisma'
import { err } from '@/platform/http/response'
import { requirePerm, requireUser } from '@/modules/identity/server/access'
import { canHandleTicket } from '@/modules/support/server/department-access'
import { ticketFileDirectory } from '@/modules/support/server/ticket-attachments'

export const runtime = 'nodejs'

export async function GET(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string; attachmentId: string }> }) {
  const user = await requireUser(req)
  if (!user) return err('unauthorized', 401)
  const { id: ticketParam, attachmentId: fileParam } = await paramsPromise
  const ticketId = Number(ticketParam)
  const attachmentId = Number(fileParam)
  if (!Number.isSafeInteger(ticketId) || ticketId < 1 || !Number.isSafeInteger(attachmentId) || attachmentId < 1) return err('invalid attachment', 400)
  const file = await db.ticketAttachment.findUnique({
    where: { id: attachmentId },
    include: { message: { include: { ticket: { select: { id: true, userId: true, department: true } } } } },
  })
  if (!file || file.message.ticket.id !== ticketId || !/^[0-9a-f-]{36}\.(png|jpg|webp)$/.test(file.filename)) return err('not found', 404)
  const owner = file.message.ticket.userId === user.id
  const staff = user.role === 'ADMIN' && Boolean(await requirePerm(req, 'tickets.handle')) && await canHandleTicket(user, file.message.ticket.department)
  if (!staff && (!owner || file.message.internal)) return err('not found', 404)
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.mimeType)) return err('not found', 404)
  try {
    const bytes = await readFile(join(ticketFileDirectory(), file.filename))
    return new Response(new Uint8Array(bytes), { headers: {
      'content-type': file.mimeType,
      'content-length': String(bytes.length),
      'content-disposition': 'inline',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox",
    } })
  } catch { return err('not found', 404) }
}
