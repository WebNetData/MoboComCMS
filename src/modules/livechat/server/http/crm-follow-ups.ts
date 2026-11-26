import type { NextRequest } from 'next/server'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { err, ok } from '@/platform/http/response'
import { CRM_PERMISSIONS } from '@/modules/livechat/domain/crm-desk'
import { validFollowUpId } from '@/modules/livechat/domain/crm-follow-ups'
import { followUpQueueQuery } from '@/modules/livechat/domain/crm-follow-up-queue'
import { ChatError } from '@/modules/livechat/domain/livechat'
import { listFollowUps, saveFollowUp } from '@/modules/livechat/server/crm-follow-ups'
import { listFollowUpQueue } from '@/modules/livechat/server/crm-follow-up-queue'

async function handle(req: NextRequest, action?: 'create' | 'update') {
  const guard = await adminGuard(req, null, CRM_PERMISSIONS)
  if ('response' in guard) return guard.response
  const userId = Number(req.nextUrl.searchParams.get('userId'))
  if (!validFollowUpId(userId)) return err('شناسهٔ مشتری معتبر نیست')
  try {
    const input = action ? await req.json().catch(() => null) : null
    if (action && (!input || typeof input !== 'object' || Array.isArray(input))) return err('اطلاعات پیگیری معتبر نیست')
    const response = action
      ? ok(await saveFollowUp(req, guard.admin, userId, input, action === 'create'), action === 'create' ? 201 : 200)
      : ok(await listFollowUps(userId, guard.admin))
    response.headers.set('Cache-Control', 'private, no-store')
    return response
  } catch (error) {
    if (error instanceof ChatError) return err(error.message, error.status)
    throw error
  }
}

export const GET = (req: NextRequest) => handle(req)
export const POST = (req: NextRequest) => handle(req, 'create')
export const PATCH = (req: NextRequest) => handle(req, 'update')

export async function GET_QUEUE(req: NextRequest) {
  const guard = await adminGuard(req, 'livechat', CRM_PERMISSIONS)
  if ('response' in guard) return guard.response
  const query = followUpQueueQuery(req.nextUrl.searchParams)
  if (!query) return err('فیلتر پیگیری معتبر نیست')
  try {
    const response = ok(await listFollowUpQueue(guard.admin, query))
    response.headers.set('Cache-Control', 'private, no-store')
    return response
  } catch (error) {
    if (error instanceof ChatError) return err(error.message, error.status)
    throw error
  }
}
