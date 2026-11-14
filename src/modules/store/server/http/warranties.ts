import type { NextRequest } from 'next/server'
import type { Prisma } from '@prisma/client'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { requirePerm } from '@/modules/identity/server/access'
import { auditAdminStrict } from '@/platform/audit/server'
import { moduleGuard } from '@/extensions/server/modules'
import { StoreError } from '@/modules/store/domain/store'
import { parseWarrantyDraft, parseWarrantyUpdate } from '@/modules/store/domain/warranty'
import { adminWarrantyDevices, createWarrantyDevice, updateWarrantyDevice } from '@/modules/store/server/warranties'

type OrderContext = { params: Promise<{ id: string }> }
type DeviceContext = { params: Promise<{ id: string }> }
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } })
const failure = (error: unknown) => { if (error instanceof StoreError) return reply({ error: error.message, code: error.code }, error.status); console.error('[store.warranty]', error); return reply({ error: 'ثبت اطلاعات ضمانت ممکن نشد' }, 500) }
const positiveId = (value: unknown) => { const id = Number(value); return Number.isSafeInteger(id) && id > 0 ? id : 0 }

export async function GET_order_warranties(req: NextRequest, context: OrderContext) {
  const off = await moduleGuard('store')
  if (off) return off
  const g = await adminGuard(req, 'store', ['orders.manage'])
  if ('response' in g) return g.response
  const id = positiveId((await context.params).id)
  if (!id) return reply({ error: 'شناسهٔ سفارش معتبر نیست' }, 400)
  try { return reply(await adminWarrantyDevices(id)) } catch (error) { return failure(error) }
}

/** Explicit staff action. A warranty is never created automatically at checkout or counter sale. */
export async function POST_order_warranty(req: NextRequest, context: OrderContext) {
  const off = await moduleGuard('store')
  if (off) return off
  const g = await adminGuard(req, 'store', ['orders.manage'])
  if ('response' in g) return g.response
  const orderId = positiveId((await context.params).id), body = await req.json().catch(() => null)
  if (!orderId || !body || typeof body !== 'object' || Array.isArray(body)) return reply({ error: 'اطلاعات ضمانت معتبر نیست' }, 400)
  try {
    const input = parseWarrantyDraft(body)
    const row = await createWarrantyDevice({ ...input, orderId, actorId: g.admin.id }, async (tx: Prisma.TransactionClient, targetId: number) => {
      if (!await requirePerm(req, 'orders.manage', tx)) throw new StoreError('دسترسی مدیریت سفارش‌ها تغییر کرده است', 403)
      await auditAdminStrict({ req, actor: g.admin, action: 'store.warranty.create', targetType: 'warranty-device', targetId }, tx)
    })
    return reply(row, 201)
  } catch (error) { return failure(error) }
}

export async function PUT_warranty(req: NextRequest, context: DeviceContext) {
  const off = await moduleGuard('store')
  if (off) return off
  const g = await adminGuard(req, 'store', ['orders.manage'])
  if ('response' in g) return g.response
  const id = positiveId((await context.params).id), body = await req.json().catch(() => null)
  if (!id || !body || typeof body !== 'object' || Array.isArray(body)) return reply({ error: 'اطلاعات ضمانت معتبر نیست' }, 400)
  try {
    const input = parseWarrantyUpdate(body)
    const row = await updateWarrantyDevice({ ...input, id, actorId: g.admin.id }, async (tx: Prisma.TransactionClient, targetId: number) => {
      if (!await requirePerm(req, 'orders.manage', tx)) throw new StoreError('دسترسی مدیریت سفارش‌ها تغییر کرده است', 403)
      await auditAdminStrict({ req, actor: g.admin, action: 'store.warranty.update', targetType: 'warranty-device', targetId }, tx)
    })
    return reply(row)
  } catch (error) { return failure(error) }
}
