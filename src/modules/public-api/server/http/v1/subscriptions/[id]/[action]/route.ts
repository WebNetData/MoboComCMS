import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { apiErr, apiOk, authorize } from '@/modules/public-api/server/v1'
import { CUSTOMER_SUB_ACTIONS, subscriptionAction, type SubAction } from '@/modules/subscriptions/server/submanage'


async function ownedSub(userId: number, id: number) {
  const sub = await db.subscription.findUnique({ where: { id }, select: { id: true, userId: true } })
  if (!sub || sub.userId !== userId) return null
  return sub
}

function parseAction(raw: string): SubAction | null {
  const action = raw === 'resetTraffic' ? 'reset-traffic' : raw === 'deleteDevice' ? 'delete-device' : raw
  return (CUSTOMER_SUB_ACTIONS as readonly string[]).includes(action) ? (action as SubAction) : null
}

export async function GET(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string; action: string }> }) {
  const params = await paramsPromise
  const auth = await authorize(req)
  if (!auth.ok) return auth.response
  const id = Number(params.id)
  if (!id) return apiErr('invalid subscription id')
  if (!(await ownedSub(auth.caller.userId, id))) return apiErr('subscription not found', 404)
  const action = parseAction(params.action)
  if (!action) return apiErr(`unknown action "${params.action}"`, 404)
  if (!['devices', 'sync'].includes(action)) return apiErr(`use POST for "${action}"`, 405)

  const res = await subscriptionAction(id, action)
  if (!res.ok) return apiErr(res.message || 'action failed', 502)
  return apiOk(res.data)
}

export async function POST(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string; action: string }> }) {
  const params = await paramsPromise
  const auth = await authorize(req)
  if (!auth.ok) return auth.response
  const id = Number(params.id)
  if (!id) return apiErr('invalid subscription id')
  if (!(await ownedSub(auth.caller.userId, id))) return apiErr('subscription not found', 404)
  const action = parseAction(params.action)
  if (!action) return apiErr(`unknown action "${params.action}"`, 404)

  const body = await req.json().catch(() => null)
  const res = await subscriptionAction(id, action, {
    hwid: body?.hwid ? String(body.hwid) : undefined,
    idempotencyKey: req.headers.get('idempotency-key') || body?.idempotencyKey || undefined,
  })
  if (!res.ok) {
    return apiErr(res.message || 'action failed', res.code === 'INSUFFICIENT_FUNDS' ? 402 : 502, res.code)
  }
  return apiOk(res.data)
}

export async function DELETE(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string; action: string }> }) {
  const params = await paramsPromise
  const auth = await authorize(req)
  if (!auth.ok) return auth.response
  const id = Number(params.id)
  if (!id) return apiErr('invalid subscription id')
  if (!(await ownedSub(auth.caller.userId, id))) return apiErr('subscription not found', 404)
  const action = parseAction(params.action)
  if (action !== 'devices') return apiErr('only device deletion is exposed as DELETE', 405)

  const hwid = req.nextUrl.searchParams.get('hwid') || ''
  if (!hwid) return apiErr('hwid query parameter is required')
  const res = await subscriptionAction(id, 'delete-device', { hwid })
  if (!res.ok) return apiErr(res.message || 'device deletion failed', 502)
  return apiOk(res.data)
}
