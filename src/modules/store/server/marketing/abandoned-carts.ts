import { db } from '@/platform/database/prisma'
import { logEvent } from '@/platform/observability/logger'
import { createInboxEvent } from '@/modules/notifications/server/inbox'
import { cartView } from '@/modules/store/server/cart'
import { minorToNumber, toMinor } from '@/shared/money'
import { dueStep, tomanOf, type RecoverySettings } from '@/modules/store/domain/marketing'
import { getRecoverySettings } from '@/modules/store/server/marketing/core'

/**
 * Sends the due reminder of every abandoned (signed-in) cart. Each step selects
 * only the carts that are due for it, so carts waiting for a later step never
 * hold back the ones that are due, and one failing cart does not stop the rest.
 */
export async function runCartRecovery(now = new Date(), limit = 200) {
  const settings = await getRecoverySettings()
  if (!settings.enabled) return { sent: 0 }
  const oldest = new Date(now.getTime() - settings.maxAgeDays * 86_400_000)
  const handled = new Set<number>()
  let sent = 0
  for (const [step, current] of settings.steps.entries()) {
    const carts = await db.cart.findMany({
      where: { userId: { not: null }, reminderCount: step, updatedAt: { gte: oldest, lte: new Date(now.getTime() - current.afterHours * 3_600_000) }, lines: { some: {} } },
      orderBy: { updatedAt: 'asc' }, take: limit,
    })
    for (const cart of carts) {
      // At most one reminder per cart in a run, as before.
      if (handled.has(cart.id) || dueStep(settings, cart, now) !== step || !cart.userId) continue
      handled.add(cart.id)
      try {
        if (await remindCart({ ...cart, userId: cart.userId }, step, current, settings, now)) sent++
      } catch (error) {
        logEvent('warn', 'store.cart_reminder_failed', { cartId: cart.id, step, error: String(error) })
      }
    }
  }
  return { sent }
}

async function remindCart(cart: { id: number; userId: number; reminderCount: number; updatedAt: Date }, step: number, current: RecoverySettings['steps'][number], settings: RecoverySettings, now: Date) {
  const unchanged = { id: cart.id, reminderCount: step, updatedAt: cart.updatedAt }
  const stop = () => db.cart.updateMany({ where: unchanged, data: { reminderCount: settings.steps.length, updatedAt: cart.updatedAt } })
  // Bought since the cart last changed: nothing to remind about.
  if (await db.order.count({ where: { userId: cart.userId, createdAt: { gte: cart.updatedAt }, status: { notIn: ['FAILED', 'CANCELLED', 'EXPIRED'] } } })) { await stop(); return false }
  const view = await cartView({ userId: cart.userId, token: null })
  const valueMinor = toMinor(view.itemsTotal, view.currency)
  if (!view.lines.some((line) => !line.issue) || tomanOf(valueMinor, view.currency) < BigInt(settings.minValueToman)) { await stop(); return false }
  const items = view.lines.filter((line) => !line.issue)
  const names = items.slice(0, 2).map((line) => line.name).join('، ') + (items.length > 2 ? ` و ${(items.length - 2).toLocaleString('fa-IR')} کالای دیگر` : '')
  // The inbox event is deduplicated, so it is written first: a failed write leaves the step due for the next run.
  await createInboxEvent({
    userId: cart.userId, kind: 'CART_REMINDER', dedupeKey: `cart:${cart.id}:${step}:${cart.updatedAt.getTime()}`,
    titleFa: 'سبد خرید شما منتظر شماست', titleEn: 'Your cart is waiting',
    bodyFa: `${current.message} ${names}.${current.couponCode ? ` با کد تخفیف ${current.couponCode} خریدتان را کامل کنید.` : ''}`.slice(0, 300), bodyEn: 'Items are still in your cart.',
    href: '/cart',
  })
  // Claim the step (updatedAt kept, so the schedule is measured from the customer's last change).
  return db.$transaction(async (tx) => {
    const claimed = await tx.cart.updateMany({ where: unchanged, data: { reminderCount: step + 1, remindedAt: now, updatedAt: cart.updatedAt } })
    if (!claimed.count) return false
    await tx.cartReminder.create({ data: { cartId: cart.id, userId: cart.userId, step, valueMinor, currency: view.currency, couponCode: current.couponCode, sentAt: now } })
    return true
  })
}

/** Credits the latest reminder with the order placed from the cart. */
export async function markCartRecovered(userId: number, orderId: number) {
  const settings = await getRecoverySettings()
  const reminder = await db.cartReminder.findFirst({ where: { userId, recoveredOrderId: null, sentAt: { gte: new Date(Date.now() - settings.maxAgeDays * 86_400_000) } }, orderBy: { sentAt: 'desc' } })
  if (reminder) await db.cartReminder.update({ where: { id: reminder.id }, data: { recoveredOrderId: orderId, recoveredAt: new Date() } })
}

export async function adminCartRecovery() {
  const since = new Date(Date.now() - 30 * 86_400_000)
  const [settings, reminders, recovered, open] = await Promise.all([
    getRecoverySettings(),
    db.cartReminder.count({ where: { sentAt: { gte: since } } }),
    db.cartReminder.findMany({ where: { sentAt: { gte: since }, recoveredOrderId: { not: null } }, select: { recoveredOrderId: true } }),
    db.cart.findMany({ where: { userId: { not: null }, lines: { some: {} }, updatedAt: { lte: new Date(Date.now() - 3_600_000), gte: since } }, orderBy: { updatedAt: 'desc' }, take: 60, include: { user: { select: { id: true, name: true, email: true, phone: true } }, lines: { include: { product: { select: { name: true, priceMinor: true, currency: true } } } } } }),
  ])
  const orders = await db.order.findMany({ where: { id: { in: recovered.map((row) => row.recoveredOrderId!) } }, select: { id: true, status: true, totalMinor: true, currency: true } })
  const paid = orders.filter((order) => order.status !== 'PENDING' && order.status !== 'FAILED' && order.status !== 'CANCELLED')
  const carts = open.map((cart) => ({
    id: cart.id, updatedAt: cart.updatedAt, reminders: cart.reminderCount, remindedAt: cart.remindedAt,
    user: cart.user ? { id: cart.user.id, name: cart.user.name, email: cart.user.email, phone: cart.user.phone } : null,
    items: cart.lines.reduce((sum, line) => sum + line.quantity, 0),
    value: minorToNumber(cart.lines.reduce((sum, line) => sum + line.product.priceMinor * BigInt(line.quantity), 0n), cart.lines[0]?.product.currency || 'IRT'),
    currency: cart.lines[0]?.product.currency || 'IRT',
    names: cart.lines.slice(0, 3).map((line) => line.product.name),
  }))
  return {
    settings, reminders30: reminders, recovered30: recovered.length, recoveredPaid30: paid.length,
    recoveredValue30: paid.reduce((sum, order) => sum + Number(tomanOf(order.totalMinor, order.currency)), 0),
    carts,
  }
}
