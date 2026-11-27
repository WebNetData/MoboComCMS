import type { Prisma } from '@prisma/client'
import type { NextRequest } from 'next/server'
import { isModuleEnabled } from '@/extensions/server/modules'
import { currentAdminHasPermission, requireAdmin } from '@/modules/identity/server/access'
import { CRM_PERMISSIONS } from '../../domain/crm-desk'
import { ChatError } from '../../domain/livechat'

export async function lockOpportunityUsers(tx: Prisma.TransactionClient, ...ids: number[]) {
  if (process.env.DATABASE_URL?.startsWith('file:')) return
  const unique = Array.from(new Set(ids)).sort((a, b) => a - b)
  // Stable order, shared with customer erasure and linked follow-ups.
  for (const id of unique) await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${id} FOR UPDATE`
}

export async function currentOpportunityActor(req: NextRequest, tx: Prisma.TransactionClient, actorId: number) {
  if (!await isModuleEnabled('livechat', tx)) throw new ChatError('مدیریت فرصت‌ها در دسترس نیست', 404)
  const actor = await requireAdmin(req, tx)
  if (actor?.id === actorId && CRM_PERMISSIONS.some(permission => currentAdminHasPermission(actor, permission))) return actor
  throw new ChatError('دسترسی به فرصت فروش مجاز نیست', 403)
}
