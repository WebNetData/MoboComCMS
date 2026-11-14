import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { StoreError } from '@/modules/store/domain/store'
import type { ReturnCustodyAction } from '@/modules/store/domain/custody'
import { deviceIdentifiers } from '@/modules/store/domain/device-identifiers'
import { parseForm } from '@/modules/forms/domain/forms'
import { releaseQuarantineStock, quarantineLocationId, transferStock, LocationError } from '@/modules/catalog/server/locations'
import { lockOrder } from './shared'

type Input = {
  id: number
  actorId: number
  segmentIndex: number
  action: ReturnCustodyAction
  expectedUpdatedAt: Date
  note: string
  formSubmissionId?: number
  destinationLocationId?: number
  identityConfirmed?: boolean
  healthConfirmed?: boolean
  physicalReleaseConfirmed?: boolean
  formsManager?: boolean
}
type Audit = (tx: Prisma.TransactionClient, id: number, status: string, resolution: string) => Promise<unknown>
const parse = <T>(raw: string, fallback: T): T => { try { return JSON.parse(raw) as T } catch { return fallback } }
const normalized = (value: unknown) => String(value ?? '').replace(/[\s\-]/g, '').toUpperCase()

function formDeviceIds(raw: string) {
  const answers = parse<Array<{ id?: unknown; value?: unknown }>>(raw, [])
  const result = { serial: '', imei: '' }
  for (const answer of answers) {
    const key = String(answer?.id || '').toLowerCase()
    if (key === 'serial') result.serial = String(answer.value ?? '').trim()
    if (key === 'imei') result.imei = String(answer.value ?? '').trim()
  }
  return result
}

async function repairSubmission(tx: Prisma.TransactionClient, input: Input, request: { orderId: number; order: { userId: number | null } }, segment: Record<string, unknown>) {
  if (!input.formSubmissionId || input.identityConfirmed !== true) throw new StoreError('درخواست تعمیر و تطبیق حضوری دستگاه را تأیید کنید')
  const submission = await tx.formSubmission.findUnique({ where: { id: input.formSubmissionId }, include: {
    form: { select: { id: true, slug: true, title: true, description: true, fields: true, published: true, successText: true, settings: true } },
    storeWarrantyDevice: { select: { orderLine: { select: { orderId: true, productId: true } } } },
  } })
  if (!submission || !['mobile-repair', 'computer-repair'].includes(submission.form.slug) || submission.stage === 'REJECTED' || submission.status === 'SPAM') throw new StoreError('درخواست تعمیر معتبر و باز پیدا نشد', 404)
  if (request.order.userId !== null ? submission.userId !== request.order.userId : submission.userId !== null || submission.source !== 'STAFF') throw new StoreError('درخواست تعمیر به همین مشتری متصل نیست', 403)
  if (!input.formsManager && !parseForm(submission.form).settings?.handlers.includes(input.actorId)) throw new StoreError('این درخواست تعمیر به شما سپرده نشده است', 403)
  const productId = Number(segment.productId)
  if (submission.storeWarrantyDevice && (submission.storeWarrantyDevice.orderLine.orderId !== request.orderId || submission.storeWarrantyDevice.orderLine.productId !== productId)) throw new StoreError('محصول دستگاه ضمانت با کالای مرجوع‌شده یکی نیست', 409)
  const line = await tx.orderLine.findFirst({ where: { orderId: request.orderId, line: Number(segment.line) }, select: { deviceIdentifiers: true } })
  const soldDevices = deviceIdentifiers(line?.deviceIdentifiers)
  const formIds = formDeviceIds(submission.data)
  const entered = [formIds.serial, formIds.imei].filter(Boolean)
  if (entered.length && soldDevices.length && !soldDevices.some(item =>
    (!formIds.serial || normalized(item.serial) === normalized(formIds.serial)) &&
    (!formIds.imei || normalized(item.imei) === normalized(formIds.imei)))) throw new StoreError('شناسهٔ درخواست تعمیر با شناسه‌های ثبت‌شده هنگام فروش تطبیق ندارد', 409)
  if (submission.assigneeId && submission.assigneeId !== input.actorId) throw new StoreError('این درخواست تعمیر را همکار دیگری در اختیار دارد', 403)
  return submission
}

/** Manager confirms one quarantined inspection segment at a time; each movement and history row shares the claim. */
export async function resolveReturnCustody(input: Input, audit: Audit) {
  try {
    return await db.$transaction(async tx => {
      const request = await tx.returnRequest.findUnique({ where: { id: input.id }, include: { order: { select: { userId: true } } } })
      if (!request || request.kind !== 'RETURN' || request.status !== 'REFUNDED' || request.inspectionStatus !== 'DISPOSED') throw new StoreError('مرجوعی بررسی‌شده برای تعیین تکلیف پیدا نشد', 409, 'CONFLICT')
      await lockOrder(tx, request.orderId)
      const current = await tx.returnRequest.findUnique({ where: { id: request.id }, include: { order: { select: { userId: true } } } })
      if (!current || current.kind !== 'RETURN' || current.status !== 'REFUNDED' || current.inspectionStatus !== 'DISPOSED') throw new StoreError('وضعیت مرجوعی تغییر کرده است', 409, 'CONFLICT')
      const segments = parse<Array<Record<string, unknown>>>(current.inspectionLines, [])
      const segment = segments[input.segmentIndex]
      if (!segment || !['DAMAGED', 'INCOMPLETE'].includes(String(segment.disposition))) throw new StoreError('این بخش برای تعیین تکلیف آسیب‌دیدگی موجود نیست', 404)
      const productId = Number(segment.productId), variantId = segment.variantId == null ? null : Number(segment.variantId), quantity = Number(segment.quantity)
      if (!Number.isSafeInteger(productId) || productId <= 0 || !Number.isSafeInteger(quantity) || quantity <= 0 || (variantId !== null && (!Number.isSafeInteger(variantId) || variantId <= 0))) throw new StoreError('اطلاعات کالای قرنطینه معتبر نیست', 409)

      const existing = await tx.returnCustodyResolution.findUnique({ where: { returnRequestId_segmentIndex: { returnRequestId: current.id, segmentIndex: input.segmentIndex } } })
      const now = new Date()
      let resolution: string, status: string, rowId: number
      if (!existing) {
        if ((input.action === 'SUPPLIER_RETURN' || input.action === 'SCRAP') && input.physicalReleaseConfirmed !== true) throw new StoreError('تأیید خروج فیزیکی کالا را ثبت کنید')
        if (input.expectedUpdatedAt.getTime() !== current.updatedAt.getTime()) throw new StoreError('مرجوعی هم‌زمان تغییر کرده است؛ صفحه را تازه کنید', 409, 'CONFLICT')
        if (input.action === 'RESTOCK') throw new StoreError('بازگشت به انبار فقط پس از تکمیل تعمیر ممکن است', 409)
        const note = input.action === 'REPAIR'
          ? [input.note, 'کارمند تطبیق فیزیکی هویت دستگاه را هنگام اتصال درخواست تعمیر تأیید کرد'].filter(Boolean).join(' · ')
          : input.note
        const form = input.action === 'REPAIR' ? await repairSubmission(tx, input, current, segment) : null
        resolution = input.action
        status = input.action
        const created = await tx.returnCustodyResolution.create({ data: {
          returnRequestId: current.id, segmentIndex: input.segmentIndex, productId, variantId, quantity,
          resolution, status, formSubmissionId: form?.id ?? null, destinationLocationId: null,
          note, confirmedById: input.actorId, confirmedAt: now,
          ...(input.action === 'SUPPLIER_RETURN' || input.action === 'SCRAP' ? { releasedAt: now } : {}),
        } })
        rowId = created.id
        if (input.action === 'SUPPLIER_RETURN' || input.action === 'SCRAP') await releaseQuarantineStock(tx, { productId, variantId, quantity }, { actorId: input.actorId, refId: current.id, refType: 'return-custody', orderId: current.orderId, note: `${current.number}: ${input.action} segment ${input.segmentIndex + 1}${note ? ` · ${note}` : ''}` })
      } else {
        if (existing.status !== 'REPAIR' || existing.resolution !== 'REPAIR' || existing.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) throw new StoreError('تعیین تکلیف این بخش قبلاً تغییر کرده یا نهایی شده است', 409, 'CONFLICT')
        if (input.action === 'REPAIR') throw new StoreError('درخواست تعمیر این بخش قبلاً متصل شده است', 409)
        if (input.action === 'RESTOCK') {
          if (input.healthConfirmed !== true || !input.destinationLocationId) throw new StoreError('سلامت دستگاه و مقصد فروش‌پذیر را تأیید کنید', 409)
          const form = existing.formSubmissionId ? await tx.formSubmission.findUnique({ where: { id: existing.formSubmissionId }, select: { stage: true } }) : null
          if (!form || form.stage !== 'DONE') throw new StoreError('درخواست تعمیر باید در Forms تکمیل شود پیش از تأیید سلامت', 409)
          const destination = await tx.stockLocation.findFirst({ where: { id: input.destinationLocationId, active: true, isQuarantine: false }, select: { id: true } })
          if (!destination) throw new StoreError('انبار فعال و فروش‌پذیر برای کالای سالم انتخاب کنید', 409)
          await transferStock(tx, { productId, variantId, from: await quarantineLocationId(tx), to: destination.id, quantity }, { actorId: input.actorId, refType: 'return-inspection', refId: current.id, orderId: current.orderId, note: `${current.number}: repair completed, manager verified healthy segment ${input.segmentIndex + 1}${input.note ? ` · ${input.note}` : ''}` })
          resolution = 'RESTOCK'; status = 'RESTOCKED'
        } else {
          if (input.physicalReleaseConfirmed !== true) throw new StoreError('تأیید خروج فیزیکی کالا را ثبت کنید')
          await releaseQuarantineStock(tx, { productId, variantId, quantity }, { actorId: input.actorId, refId: current.id, refType: 'return-custody', orderId: current.orderId, note: `${current.number}: ${input.action} segment ${input.segmentIndex + 1}${input.note ? ` · ${input.note}` : ''}` })
          resolution = input.action; status = input.action
        }
        const changed = await tx.returnCustodyResolution.updateMany({ where: { id: existing.id, status: 'REPAIR', resolution: 'REPAIR', updatedAt: input.expectedUpdatedAt }, data: {
          resolution, status, ...(input.action === 'RESTOCK' ? { destinationLocationId: input.destinationLocationId } : { destinationLocationId: null }),
          note: input.note || existing.note, confirmedById: input.actorId, confirmedAt: now,
          releasedAt: now,
        } })
        if (changed.count !== 1) throw new StoreError('این بخش هم‌زمان تغییر کرد؛ صفحه را تازه کنید', 409, 'CONFLICT')
        rowId = existing.id
      }
      const result = await tx.returnCustodyResolution.findUniqueOrThrow({ where: { id: rowId } })
      const eventStatus = `RETURN_CUSTODY_${status}`
      await tx.orderEvent.create({ data: { orderId: current.orderId, status: eventStatus, visible: false, actorId: input.actorId, note: `${current.number}: segment ${input.segmentIndex + 1}, quantity ${quantity}, ${resolution}${result.formSubmissionId ? `, repair #${result.formSubmissionId}` : ''}${result.note ? ` · ${result.note}` : ''}` } })
      await audit(tx, rowId, status, resolution)
      return result
    }, { isolationLevel: 'Serializable', timeout: 30_000 })
  } catch (error) {
    if (error instanceof StoreError) throw error
    if (error instanceof LocationError) throw new StoreError(error.message, error.status)
    if ((error as { code?: string })?.code === 'P2002') throw new StoreError('این بخش مرجوعی قبلاً تعیین تکلیف شده است', 409, 'CONFLICT')
    throw error
  }
}
