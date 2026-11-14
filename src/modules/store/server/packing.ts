import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { StoreError } from '@/modules/store/domain/store'
import { deviceIdentifiers } from '@/modules/store/domain/device-identifiers'
import { PACKING_CHECKS, type PackingChecks, type PackingLine, type PackingView } from '@/modules/store/domain/packing'
import { lockOrderWork, orderVisibility, type OrderWorkScope } from '@/modules/store/server/order-work'

type Tx = Prisma.TransactionClient
const readOrder = (client: Tx | typeof db, id: number, scope?: OrderWorkScope) => client.order.findFirst({
  where: { id, productId: { not: null }, ...orderVisibility(scope) },
  select: { id: true, status: true, assigneeId: true, product: { select: { name: true, kind: true } },
    lines: { orderBy: { line: 'asc' }, select: { line: true, name: true, variantName: true, kind: true, quantity: true, deviceIdentifiers: true } },
    productDelivery: { select: { status: true } }, packingCheck: { include: { verifier: { select: { name: true } } } } },
})
type Order = NonNullable<Awaited<ReturnType<typeof readOrder>>>
const physicalLines = (order: Order): PackingLine[] => order.lines.length
  ? order.lines.filter(line => line.kind === 'PHYSICAL').map(line => ({ line: line.line, name: line.name, variant: line.variantName, quantity: line.quantity, devices: deviceIdentifiers(line.deviceIdentifiers) }))
  : order.product?.kind === 'PHYSICAL' ? [{ line: 0, name: order.product.name, variant: '', quantity: 1, devices: [] }] : []
const fingerprint = (lines: PackingLine[]) => createHash('sha256').update(JSON.stringify(lines)).digest('hex')
const complete = (lines: PackingLine[], checks: PackingChecks[]) => checks.length === lines.length && lines.every(line => checks.filter(check => check.line === line.line && PACKING_CHECKS.every(item => check[item.key] === true)).length === 1)
function parsedChecks(raw: string): PackingChecks[] { try { const parsed: unknown = JSON.parse(raw); return Array.isArray(parsed) ? parsed.filter(check => check && typeof check === 'object' && Number.isSafeInteger(check.line)) : [] } catch { return [] } }
function view(order: Order, scope: OrderWorkScope): PackingView {
  const lines = physicalLines(order), snapshot = fingerprint(lines), row = order.packingCheck
  const checks = row ? parsedChecks(row.checks) : []
  return { required: !!lines.length, editable: order.status === 'PAID' && ['PENDING', 'PROCESSING', 'PACKED'].includes(order.productDelivery?.status || '') && (scope.manager || scope.actorId === order.assigneeId),
    snapshot, revision: row?.updatedAt.toISOString() || null, lines, checks, note: row?.note || '',
    completed: row ? { name: row.verifier.name || `کارشناس ${row.completedById}`, at: row.completedAt.toISOString(), current: row.snapshot === snapshot && complete(lines, checks) } : null }
}

/** Shared row lock: request/review/packing/dispatch serialize on the canonical Order. */
export async function lockOrderDispatch(tx: Tx, orderId: number) {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Order" WHERE "id"=${orderId} FOR UPDATE`)
}
export async function orderPacking(orderId: number, scope: OrderWorkScope) {
  const order = await readOrder(db, orderId, scope)
  if (!order) throw new StoreError('سفارش پیدا نشد', 404)
  return view(order, scope)
}
export async function saveOrderPacking(orderId: number, raw: Record<string, unknown>, scope: OrderWorkScope, authorize: (tx: Tx) => Promise<void>, audit: (tx: Tx) => Promise<void>) {
  return db.$transaction(async tx => {
    await lockOrderDispatch(tx, orderId)
    await authorize(tx)
    await lockOrderWork(tx, orderId, scope)
    const order = await readOrder(tx, orderId, scope)
    if (!order) throw new StoreError('سفارش پیدا نشد', 404)
    const state = view(order, scope)
    if (!state.required || !state.editable) throw new StoreError('چک‌لیست این سفارش قابل تغییر نیست', 409)
    if (raw.snapshot !== state.snapshot || raw.revision !== state.revision) throw new StoreError('اطلاعات کالا یا چک‌لیست تغییر کرده است؛ دوباره بررسی کنید', 409, 'CONFLICT')
    const checks = Array.isArray(raw.checks) ? raw.checks as PackingChecks[] : []
    if (checks.some(check => !check || typeof check !== 'object') || !complete(state.lines, checks)) throw new StoreError('همهٔ موارد هر کالای فیزیکی را کنترل کنید', 400, 'PACKING_INCOMPLETE')
    const note = typeof raw.note === 'string' ? raw.note.replace(/[<>\u0000-\u001f]/g, ' ').trim().slice(0, 500) : ''
    const normalized = state.lines.map(line => ({ line: line.line, ...Object.fromEntries(PACKING_CHECKS.map(item => [item.key, true])) }))
    const data = { snapshot: state.snapshot, checks: JSON.stringify(normalized), note, completedById: scope.actorId, completedAt: new Date() }
    if (order.packingCheck) {
      const changed = await tx.orderPackingCheck.updateMany({ where: { orderId, updatedAt: order.packingCheck.updatedAt }, data })
      if (changed.count !== 1) throw new StoreError('چک‌لیست هم‌زمان تغییر کرده است', 409)
    } else await tx.orderPackingCheck.create({ data: { orderId, ...data } })
    await tx.orderEvent.create({ data: { orderId, status: 'PACKING_CHECK', visible: false, actorId: scope.actorId, note: `مدل، گونه، تعداد، شناسهٔ دستگاه و لوازم همراه کنترل شد${note ? `؛ ${note}` : ''}` } })
    await audit(tx)
    return view((await readOrder(tx, orderId, scope))!, scope)
  })
}
/** Call under the shared dispatch lock, before a physical handoff/state write. */
export async function assertOrderPacking(tx: Tx, orderId: number) {
  const order = await readOrder(tx, orderId)
  if (!order) throw new StoreError('سفارش پیدا نشد', 404)
  const lines = physicalLines(order)
  if (!lines.length) return
  const row = order.packingCheck
  if (!row || row.snapshot !== fingerprint(lines) || !complete(lines, parsedChecks(row.checks))) throw new StoreError('چک‌لیست فعلی بسته‌بندی و تحویل را ثبت کنید', 409, 'PACKING_REQUIRED')
}
export async function assertOrderDispatchReady(tx: Tx, orderId: number) {
  await lockOrderDispatch(tx, orderId)
  if (await tx.orderDeliveryChange.findFirst({ where: { orderId, status: 'REQUESTED' }, select: { id: true } })) throw new StoreError('درخواست تغییر اطلاعات تحویل هنوز تعیین تکلیف نشده است', 409, 'DELIVERY_CHANGE_PENDING')
  await assertOrderPacking(tx, orderId)
}
/** Immediate counter handoff records the explicit cashier checklist in the sale transaction. */
export async function recordCounterPacking(tx: Tx, orderId: number, actorId: number, confirmed: boolean) {
  const order = await readOrder(tx, orderId)
  if (!order) throw new StoreError('سفارش پیدا نشد', 404)
  const lines = physicalLines(order)
  if (!lines.length) return
  if (!confirmed) throw new StoreError('کنترل مدل، گونه، تعداد، سریال و لوازم همراه را تأیید کنید', 409, 'PACKING_REQUIRED')
  const checks = lines.map(line => ({ line: line.line, ...Object.fromEntries(PACKING_CHECKS.map(item => [item.key, true])) }))
  await tx.orderPackingCheck.create({ data: { orderId, snapshot: fingerprint(lines), checks: JSON.stringify(checks), completedById: actorId } })
}
