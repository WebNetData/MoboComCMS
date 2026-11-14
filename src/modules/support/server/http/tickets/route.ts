import { offeredLocale } from '@/i18n/policy'
import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { requireUser } from '@/modules/identity/server/access'
import { sanitizeMessage, richTextToPlain } from '@/shared/content/sanitize'
import { issueTypes, reportDevices } from '@/modules/support/domain/incidents'
import { validateAnswers, parseFields } from '@/modules/support/domain/department-config'
import { getUserLocale } from '@/modules/notifications/server/telegram-locale'
import { planName } from '@/modules/catalog/domain/plan-locale'
import { safeHappLink } from '@/modules/subscriptions/server/happ-protocol'
import { parseTicketSubmission, removeTicketFiles, saveTicketFiles, ticketAttachmentRows, TicketUploadError } from '@/modules/support/server/ticket-attachments'
import { createSupportTicket } from '@/modules/support/server/create-ticket'
import { customerWarrantyDevices, ownedWarrantyDeviceForSupport } from '@/modules/store/server/warranties'
import { moduleGuard } from '@/extensions/server/modules'

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return err('unauthorized', 401)
  if (req.nextUrl.searchParams.get('view') === 'options') {
    const locale = await getUserLocale(user.id) || offeredLocale(req.cookies.get('lang')?.value)
    const [subscriptions, orders, supportOrders, departments] = await Promise.all([
      db.subscription.findMany({ where: { userId: user.id, status: 'ACTIVE', expiresAt: { gt: new Date() } }, include: { plan: true }, orderBy: { createdAt: 'desc' } }),
      db.order.findMany({ where: { userId: user.id, status: 'PAID', productId: { not: null }, product: { active: true } }, include: { product: true }, orderBy: { createdAt: 'desc' } }),
      db.order.findMany({ where: { userId: user.id }, include: { lines: { orderBy: { line: 'asc' }, select: { line: true, name: true, variantName: true, quantity: true } } }, orderBy: { createdAt: 'desc' } }),
      db.ticketDepartment.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }),
    ])
    const products = [...new Map(orders.filter(o => o.product).map(o => [o.product!.id, { id: o.product!.id, name: locale === 'fa' ? o.product!.name : (o.product!.nameEn || `Product #${o.product!.id}`) }])).values()]
    const storeOff = await moduleGuard('store')
    const warrantyDevices = storeOff ? [] : await customerWarrantyDevices(user.id)
    return ok({ subscriptions: subscriptions.map(s => ({ id: s.id, name: planName(s.plan, locale), username: s.username, expiresAt: s.expiresAt })), products, orders: supportOrders.map(o => ({ id: o.id, createdAt: o.createdAt, status: o.status, lines: o.lines.map(line => ({ line: line.line, name: line.name, variantName: line.variantName, quantity: line.quantity })) })), warrantyDevices, departments: departments.map(d => ({ slug: d.slug, name: locale === 'fa' ? d.nameFa : d.nameEn, description: locale === 'fa' ? d.descriptionFa : d.descriptionEn, requiresSubscription: d.requiresSubscription, requiresProduct: d.requiresProduct, fields: parseFields(d.fields) })) })
  }
  const tickets = await db.ticket.findMany({
    where: { userId: user.id },
    include: { messages: true },
    orderBy: { updatedAt: 'desc' },
  })
  return ok(
    tickets.map((t) => ({
      id: t.id,
      subject: t.subject,
      status: t.status,
      priority: t.priority,
      department: t.department,
      subscriptionId: t.subscriptionId,
      productId: t.productId,
      customFields: t.customFields,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      messageCount: t.messages.length,
    }))
  )
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return err('unauthorized', 401)
  let body: any, files: Awaited<ReturnType<typeof parseTicketSubmission>>['files']
  try { ({ body, files } = await parseTicketSubmission(req)) }
  catch (error) { return error instanceof TicketUploadError ? err(error.message, error.status) : err('Could not read ticket / دریافت تیکت ممکن نشد') }
  const subject = String(body?.subject || '').trim()
  const message = sanitizeMessage(String(body?.message || '').trim())
  const priority = ['low', 'normal', 'high'].includes(body?.priority) ? body.priority : 'normal'
  const locale = await getUserLocale(user.id) || offeredLocale(req.cookies.get('lang')?.value)
  const L = (en: string, fa: string) => locale === 'fa' ? fa : en
  const department = body?.department === undefined && body?.subscriptionId !== undefined ? 'SUBSCRIPTION' : String(body?.department || '')
  const departmentConfig = await db.ticketDepartment.findUnique({ where: { slug: department } })
  if (!departmentConfig?.active) return err(L('Choose an active department.', 'یک دپارتمان فعال انتخاب کنید.'))
  let customFields: Record<string, string | boolean>
  try { customFields = validateAnswers(parseFields(departmentConfig.fields), body?.customFields) } catch (e) { return err(e instanceof Error ? e.message : L('Invalid fields.', 'فیلدها معتبر نیستند.')) }
  if (!subject || !richTextToPlain(message)) return err(L('Subject and message are required.', 'موضوع و متن پیام الزامی است.'))
  if (subject.length > 200 || message.length > 12000) return err('پیام بیش از حد طولانی است / Message too long')
  let report: { subscriptionId: number; subscriptionUsername: string; subscriptionLink: string; device: string; issueType: string } | undefined
  let productId: number | undefined
  let orderId: number | undefined
  let storeWarrantyDeviceId: number | undefined
  if (body?.storeWarrantyDeviceId != null) {
    const warrantyId = Number(body.storeWarrantyDeviceId)
    if (!Number.isSafeInteger(warrantyId) || warrantyId <= 0) return err(L('Warranty device not found.', 'دستگاه ضمانت پیدا نشد.'), 404)
    const warranty = await ownedWarrantyDeviceForSupport(user.id, warrantyId)
    if (!warranty || (body?.orderId != null && Number(body.orderId) !== warranty.orderId) || (body?.productId != null && Number(body.productId) !== warranty.productId)) return err(L('Warranty device not found.', 'دستگاه ضمانت پیدا نشد.'), 404)
    storeWarrantyDeviceId = warranty.id
    orderId = warranty.orderId
    productId = warranty.productId || undefined
  }
  if (body?.orderId != null) {
    if (!Number.isSafeInteger(body.orderId) || body.orderId <= 0) return err(L('Order not found.', 'سفارش پیدا نشد.'), 404)
    const order = await db.order.findFirst({
      where: { id: body.orderId, userId: user.id },
      select: { id: true, productId: true, lines: { select: { productId: true } } },
    })
    // The same response for missing and non-owned IDs avoids confirming another buyer's order.
    if (!order) return err(L('Order not found.', 'سفارش پیدا نشد.'), 404)
    if (orderId != null && orderId !== order.id) return err(L('Warranty device not found.', 'دستگاه ضمانت پیدا نشد.'), 404)
    orderId = order.id
    if (body?.productId != null && ![order.productId, ...order.lines.map(line => line.productId)].includes(body.productId)) return err(L('Select a product from this order.', 'یک محصول از همین سفارش انتخاب کنید.'))
  }
  if (departmentConfig.requiresSubscription) {
    if (!Number.isSafeInteger(body?.subscriptionId) || body.subscriptionId <= 0) return err(L('Select an active subscription.', 'یک اشتراک فعال انتخاب کنید.'))
    const subscription = await db.subscription.findFirst({ where: { id: body.subscriptionId, userId: user.id, status: 'ACTIVE', expiresAt: { gt: new Date() } }, select: { id: true, username: true, subToken: true } })
    if (!subscription) return err(L('Active subscription not found.', 'اشتراک فعال پیدا نشد.'), 404)
    const device = body?.device || 'other'
    const issueType = body?.issueType || 'other'
    if (!reportDevices.includes(device) || !issueTypes.includes(issueType)) return err(L('Invalid issue details.', 'جزئیات گزارش معتبر نیست.'))
    report = { subscriptionId: subscription.id, subscriptionUsername: subscription.username, subscriptionLink: await safeHappLink(subscription.subToken), device, issueType }
  } else if (departmentConfig.requiresProduct) {
    if (!Number.isSafeInteger(body?.productId) || body.productId <= 0) return err(L('Select a purchased product.', 'یک محصول خریداری‌شده انتخاب کنید.'))
    if (orderId != null) {
      if (productId != null && productId !== body.productId) return err(L('Select a product from this warranty device.', 'محصول باید با دستگاه ضمانت یکی باشد.'))
      productId = body.productId
    } else {
      const order = await db.order.findFirst({ where: { userId: user.id, productId: body.productId, status: 'PAID', product: { active: true } }, select: { id: true, productId: true } })
      if (!order?.productId) return err(L('Purchased active product not found.', 'محصول خریداری‌شدهٔ فعال پیدا نشد.'), 404)
      productId = order.productId
      orderId = order.id
    }
  } else if (body?.subscriptionId != null || body?.productId != null) {
    return err(L('This department does not require a service.', 'برای این دپارتمان انتخاب سرویس لازم نیست.'))
  }

  try { await saveTicketFiles(files) }
  catch { return err('Could not save attachments / ذخیرهٔ پیوست‌ها ممکن نشد', 500) }
  let ticket: { id: number; priority: string }
  try { ticket = await createSupportTicket({
    userId: user.id, subject, priority, department, customFields, orderId, productId, storeWarrantyDeviceId,
    ...report, message, attachments: ticketAttachmentRows(files),
  }) } catch {
    await removeTicketFiles(files)
    return err('Could not create ticket / ثبت تیکت ممکن نشد', 500)
  }
  return ok({ id: ticket.id })
}
