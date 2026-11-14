import { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { FormsError, answerText, parseForm, stepLabel, workSteps, type StoredAnswer } from '@/modules/forms/domain/forms'
import { mayHandle } from '@/modules/forms/server/advanced'
import { normalizeMobile } from '@/modules/sms/domain/sms'

// Store owns the sale and payment; Forms links the one paid Store order to this repair and gates handing the device back.
// In-shop sales may include parts and work; a matching paid mixed goods/service checkout can also be attached.

type Client = Prisma.TransactionClient | typeof db
export type RepairActor = { id: number; builder: boolean; handler: boolean }
export type RepairInvoice = { orderId: number; number: string; status: string }
export type RepairForInvoice = { id: number; formId: number; title: string; stage: string; customerName: string; phone: string; device: string; invoice: RepairInvoice | null }

const DEVICE_FIELDS = ['device', 'brand', 'model', 'serial', 'imei']
const finished = (stage: string) => stage === 'DONE' || stage === 'REJECTED'

/** The repair's sale, when it has one: its invoice number and whether it is paid. */
export async function repairInvoice(orderId: number | null, client: Client = db): Promise<RepairInvoice | null> {
  if (!orderId) return null
  const invoice = await client.invoice.findUnique({ where: { orderId }, select: { number: true, status: true } })
  return invoice ? { orderId, number: invoice.number, status: invoice.status } : null
}
export const invoicePaid = (invoice: RepairInvoice | null) => invoice?.status === 'PAID'

/**
 * A repair that may be invoiced now: its form asks for a paid invoice at some step, the device is in the shop (when the
 * form issues receipts), the work is not finished, it has no paid invoice yet, and the person may work on it — a forms
 * manager, or a named handler of the form while no colleague holds the work (the same rule as the answers' desk).
 */
export async function repairForInvoice(id: number, actor: RepairActor, client: Client = db): Promise<RepairForInvoice> {
  if (!Number.isSafeInteger(id) || id <= 0) throw new FormsError('شمارهٔ تعمیر معتبر نیست')
  const row = await client.formSubmission.findUnique({ where: { id }, select: { id: true, data: true, stage: true, assigneeId: true, receivedAt: true, repairOrderId: true, form: true } })
  if (!row) throw new FormsError('درخواست تعمیر پیدا نشد', 404)
  const form = parseForm(row.form), steps = workSteps(form.settings)
  if (!actor.builder && (!actor.handler || !mayHandle(form, actor, false) || (row.assigneeId && row.assigneeId !== actor.id))) throw new FormsError('این درخواست تعمیر به شما سپرده نشده است', 403)
  if (!steps.some((step) => step.invoice)) throw new FormsError('مراحل این فرم فاکتور تعمیر نمی‌خواهند؛ در مراحل کار، «فقط با فاکتور پرداخت‌شده» را روشن کنید', 409)
  if (finished(row.stage)) throw new FormsError(`این درخواست «${stepLabel(form.settings, row.stage)}» است و فاکتور تازه نمی‌گیرد`, 409)
  if (steps.some((step) => step.receipt) && !row.receivedAt) throw new FormsError('دستگاه هنوز دریافت نشده است؛ پس از دریافت و صدور رسید، فاکتور تعمیر صادر می‌شود', 409)
  const invoice = await repairInvoice(row.repairOrderId, client)
  if (invoicePaid(invoice)) throw new FormsError(`این تعمیر فاکتور پرداخت‌شدهٔ ${invoice!.number} را دارد`, 409)
  const answers = (() => { try { return JSON.parse(row.data) as StoredAnswer[] } catch { return [] } })()
  const text = (answer?: StoredAnswer) => answer ? answerText(answer.value).trim() : ''
  const named = answers.find((answer) => answer.id === 'name') || answers.find((answer) => answer.type === 'text')
  const phone = answers.find((answer) => answer.type === 'mobile' || answer.type === 'tel')
  const device = DEVICE_FIELDS.map((key) => text(answers.find((answer) => answer.id === key))).filter(Boolean).join(' · ')
  return { id: row.id, formId: row.form.id, title: form.title, stage: row.stage ? stepLabel(form.settings, row.stage) : '', customerName: text(named).slice(0, 80), phone: text(phone).slice(0, 30), device: device.slice(0, 200), invoice }
}

/** Inside the sale's transaction: this sale is now the repair's invoice. A refunded or void earlier sale may be replaced. */
export async function linkRepairOrder(tx: Prisma.TransactionClient, id: number, orderId: number) {
  const row = await tx.formSubmission.findUnique({ where: { id }, select: { repairOrderId: true } })
  if (!row) throw new FormsError('درخواست تعمیر پیدا نشد', 404)
  if (invoicePaid(await repairInvoice(row.repairOrderId, tx))) throw new FormsError('این تعمیر هم‌زمان فاکتور پرداخت‌شده گرفت', 409)
  const changed = await tx.formSubmission.updateMany({ where: { id, repairOrderId: row.repairOrderId }, data: { repairOrderId: orderId } })
  if (changed.count !== 1) throw new FormsError('درخواست تعمیر هم‌زمان تغییر کرد؛ دوباره تلاش کنید', 409)
}

/** Links an already-paid mixed Store order to an eligible repair; no order, invoice or payment is created here. */
export async function attachPaidServiceOrder(tx: Prisma.TransactionClient, id: number, orderId: number, actor: RepairActor) {
  if (/^postgres/.test(process.env.DATABASE_URL || '')) await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "FormSubmission" WHERE "id" = ${id} FOR UPDATE`)
  const repair = await tx.formSubmission.findUnique({ where: { id }, select: { id: true, userId: true, data: true, stage: true, assigneeId: true, receivedAt: true, repairOrderId: true } })
  if (!repair) throw new FormsError('درخواست تعمیر پیدا نشد', 404)
  await repairForInvoice(id, actor, tx)
  if (/^postgres/.test(process.env.DATABASE_URL || '')) {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`)
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Invoice" WHERE "orderId" = ${orderId} FOR UPDATE`)
  }
  const order = await tx.order.findFirst({
    where: { id: orderId, productId: { not: null }, status: 'PAID' },
    select: { id: true, userId: true, customerPhone: true, meta: true, invoice: { select: { orderId: true, status: true } }, user: { select: { phone: true } }, lines: { select: { productId: true, kind: true, sellerId: true } } },
  })
  if (!order || order.invoice?.status !== 'PAID' || order.invoice.orderId !== order.id) throw new FormsError('سفارش و فاکتور پرداخت‌شده پیدا نشد', 404)
  let serviceProductIds: number[] = []
  try {
    const meta = JSON.parse(order.meta || '{}') as { serviceProductIds?: unknown }
    if (Array.isArray(meta.serviceProductIds)) serviceProductIds = meta.serviceProductIds.map(Number).filter((value) => Number.isSafeInteger(value) && value > 0)
  } catch { /* older orders have no frozen service snapshot */ }
  const service = order.lines.some((line) => line.kind === 'VIRTUAL' && line.productId !== null && line.sellerId === null && serviceProductIds.includes(line.productId))
  const goods = order.lines.some((line) => line.kind === 'PHYSICAL' && line.productId !== null && line.sellerId === null)
  if (!service || !goods) throw new FormsError('سفارش باید خدمت و کالای فیزیکی فروشگاه را با هم داشته باشد', 409)

  if (repair.userId !== null && order.userId !== null) {
    if (repair.userId !== order.userId) throw new FormsError('خریدار سفارش با مشتری این تعمیر یکسان نیست', 403)
  } else {
    let repairPhone = ''
    try {
      const answers = JSON.parse(repair.data) as StoredAnswer[]
      const answer = answers.find((item) => item.type === 'mobile' || item.type === 'tel')
      repairPhone = answer ? normalizeMobile(answerText(answer.value)) : ''
    } catch { /* unparseable historical answers cannot establish customer match */ }
    const orderPhone = normalizeMobile(order.userId !== null ? order.user?.phone || '' : order.customerPhone)
    if (!repairPhone || !orderPhone || repairPhone !== orderPhone) throw new FormsError('موبایل خریدار سفارش با مشتری این تعمیر تطبیق ندارد', 403)
  }

  let changed: { count: number }
  try {
    changed = await tx.formSubmission.updateMany({
      where: { id, repairOrderId: repair.repairOrderId, stage: repair.stage, assigneeId: repair.assigneeId, receivedAt: repair.receivedAt, userId: repair.userId },
      data: { repairOrderId: order.id },
    })
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') throw new FormsError('این سفارش قبلاً به تعمیر دیگری وصل شده است', 409)
    throw error
  }
  if (changed.count !== 1) throw new FormsError('درخواست تعمیر هم‌زمان تغییر کرد؛ دوباره تلاش کنید', 409)
  return { submissionId: id, orderId: order.id }
}
