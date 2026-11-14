import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { StoreError } from '@/modules/store/domain/store'
import type { LineChoice } from '@/modules/store/domain/returns'
import { transferStock, disposeQuarantineStock, quarantineLocationId, LocationError } from '@/modules/catalog/server/locations'
import { lockOrder } from './shared'
import { receivePhysicalReturn } from './refunds'
const parseJson = <T>(raw: string, fallback: T): T => { try { return JSON.parse(raw) as T } catch { return fallback } }
const plain = (value: unknown, max: number) => String(value ?? '').replace(/[<>\u0000-\u001f]/g, ' ').trim().slice(0, max)

/** A refund may precede the parcel's arrival; receive it once without refunding again. */
export async function receiveReturnState(input: { id: number; actorId: number; expectedUpdatedAt: unknown }, audit: (tx: Prisma.TransactionClient, id: number) => Promise<unknown>) {
  const expected = new Date(String(input.expectedUpdatedAt ?? ''))
  if (!Number.isFinite(expected.getTime())) throw new StoreError('نسخهٔ مرجوعی معتبر نیست')
  await db.$transaction(async tx => {
    const first = await tx.returnRequest.findUnique({ where: { id: input.id } })
    if (!first) throw new StoreError('مرجوعی پیدا نشد', 404)
    await lockOrder(tx, first.orderId)
    const row = await tx.returnRequest.findUniqueOrThrow({ where: { id: first.id } })
    const claimed = await tx.returnRequest.updateMany({ where: { id: row.id, kind: 'RETURN', status: 'REFUNDED', restocked: false, inspectionStatus: 'NOT_REQUIRED', updatedAt: expected }, data: { restocked: true, inspectionStatus: 'PENDING' } })
    if (claimed.count !== 1) throw new StoreError('دریافت قبلاً ثبت شده یا مرجوعی تغییر کرده است', 409, 'CONFLICT')
    await receivePhysicalReturn(tx, row, input.actorId)
    await tx.orderEvent.create({ data: { orderId: row.orderId, status: 'RETURN_RECEIVED', visible: false, actorId: input.actorId, note: `دریافت کالاهای ${row.number} برای بررسی در قرنطینه` } })
    await audit(tx, row.id)
  })
}

/** Manager inspection moves healthy units from quarantine using the existing stock transfer ledger. */
export async function inspectReturnState(input: { id: number; actorId: number; expectedUpdatedAt: unknown; lines: unknown }, audit?: (tx: Prisma.TransactionClient, id: number) => Promise<unknown>) {
  const expected = new Date(String(input.expectedUpdatedAt ?? ''))
  if (!Number.isFinite(expected.getTime()) || !Array.isArray(input.lines) || !input.lines.length || input.lines.length > 300) throw new StoreError('اطلاعات بررسی کالا معتبر نیست')
  const segmentsInput = input.lines
  try {
    await db.$transaction(async (tx) => {
      const first = await tx.returnRequest.findUnique({ where: { id: input.id } })
      if (!first || first.kind !== 'RETURN' || first.status !== 'REFUNDED' || first.inspectionStatus !== 'PENDING') throw new StoreError('این مرجوعی در انتظار بررسی نیست', 409, 'CONFLICT')
      await lockOrder(tx, first.orderId)
      const row = await tx.returnRequest.findUnique({ where: { id: input.id } })
      if (!row || row.updatedAt.getTime() !== expected.getTime() || row.inspectionStatus !== 'PENDING') throw new StoreError('مرجوعی هم‌زمان تغییر کرده است؛ پیش از بررسی صفحه را تازه کنید', 409, 'CONFLICT')
      const allChoices = parseJson<LineChoice[]>(row.lines, [])
      const source = await tx.orderLine.findMany({ where: { orderId: row.orderId, line: { in: allChoices.map((choice) => choice.line) }, kind: 'PHYSICAL' }, select: { line: true, productId: true, variantId: true, name: true, variantName: true } })
      const choices = allChoices.filter((choice) => source.some((entry) => entry.line === choice.line))
      if (!choices.length) throw new StoreError('کالای فیزیکی برای بررسی وجود ندارد', 409)
      const grouped = new Map<number, Array<{ line: number; quantity: number; disposition: string; approvedQuantity: number; destinationLocationId?: number; note: string }>>()
      for (const raw of segmentsInput) {
        const value = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
        const line = Number(value.line), quantity = Number(value.quantity), approvedQuantity = Number(value.approvedQuantity)
        const disposition = String(value.disposition)
        const destinationLocationId = value.destinationLocationId == null || value.destinationLocationId === '' ? undefined : Number(value.destinationLocationId)
        if (!Number.isSafeInteger(line) || !Number.isSafeInteger(quantity) || quantity <= 0 || !['HEALTHY', 'DAMAGED', 'INCOMPLETE'].includes(disposition) || !Number.isSafeInteger(approvedQuantity) || approvedQuantity < 0 || (disposition === 'HEALTHY' ? approvedQuantity !== quantity : approvedQuantity !== 0) || (disposition === 'HEALTHY' ? !Number.isSafeInteger(destinationLocationId) || destinationLocationId! <= 0 : destinationLocationId !== undefined)) throw new StoreError('تعداد یا وضعیت بخش بررسی‌شده معتبر نیست')
        const bucket = grouped.get(line) || []
        if (bucket.some((item) => item.disposition === disposition) || bucket.length >= 3) throw new StoreError('برای هر وضعیت یک تعداد مشخص ثبت کنید')
        bucket.push({ line, quantity, disposition, approvedQuantity, ...(destinationLocationId ? { destinationLocationId } : {}), note: plain(value.note, 300) })
        grouped.set(line, bucket)
      }
      if (grouped.size !== choices.length || choices.some((choice) => !grouped.has(choice.line))) throw new StoreError('وضعیت همهٔ کالاهای فیزیکی برگشتی را مشخص کنید')
      const now = new Date(), segments: Array<Record<string, unknown>> = []
      for (const choice of choices) {
        const product = source.find((entry) => entry.line === choice.line)
        if (!product?.productId) throw new StoreError('این ردیف کالای فیزیکی قابل بررسی ندارد', 409)
        const parts = grouped.get(choice.line)!
        if (parts.reduce((sum, part) => sum + part.quantity, 0) !== choice.quantity) throw new StoreError('جمع تعداد سالم، معیوب و ناقص باید با تعداد برگشتی برابر باشد', 409)
        for (const part of parts) {
          if (part.disposition === 'HEALTHY') await transferStock(tx, { productId: product.productId, variantId: product.variantId, from: await quarantineLocationId(tx), to: part.destinationLocationId!, quantity: part.quantity }, { actorId: input.actorId, refType: 'return-inspection', refId: row.id, orderId: row.orderId, note: part.note || 'تأیید سلامت کالای مرجوعی' })
          else await disposeQuarantineStock(tx, { productId: product.productId, variantId: product.variantId, quantity: part.quantity }, { actorId: input.actorId, refType: 'return-inspection', refId: row.id, orderId: row.orderId, note: `${part.disposition}${part.note ? `: ${part.note}` : ''}` })
          segments.push({ ...part, name: product.name, variantName: product.variantName, productId: product.productId, variantId: product.variantId, actorId: input.actorId, inspectedAt: now.toISOString() })
        }
      }
      const claimed = await tx.returnRequest.updateMany({ where: { id: row.id, status: 'REFUNDED', inspectionStatus: 'PENDING', updatedAt: expected }, data: { inspectionStatus: 'DISPOSED', inspectionLines: JSON.stringify(segments) } })
      if (claimed.count !== 1) throw new StoreError('مرجوعی هم‌زمان تغییر کرده است؛ پیش از بررسی صفحه را تازه کنید', 409, 'CONFLICT')
      await audit?.(tx, row.id)
    }, { isolationLevel: 'Serializable', timeout: 30_000 })
  } catch (error) {
    if (error instanceof StoreError) throw error
    if (error instanceof LocationError) throw new StoreError(error.message, error.status)
    throw error
  }

}
