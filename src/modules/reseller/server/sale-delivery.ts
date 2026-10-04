import { db } from '@/platform/database/prisma'
import { safeHappLink } from '@/modules/subscriptions/server/happ-protocol'
import { say, localized } from '@/modules/reseller/server/bot-messages'


export async function deliverResellerSale(orderId: number) {
  const sale = await db.resellerSale.findFirst({ where: { orderId }, include: { offer: true } })
  if (!sale || sale.deliveredAt) return
  const row = await db.resellerBot.findUnique({ where: { id: sale.botId } })
  const sub = await db.subscription.findFirst({ where: { orderId } })
  if (!row?.active || !sub || sub.status !== 'ACTIVE') return
  const link = await safeHappLink(sub.subToken)
  if (!link) return
  const claimed = await db.resellerSale.updateMany({ where: { id: sale.id, deliveredAt: null, OR: [{ status: 'PROVISIONING' }, { status: 'DELIVERING', updatedAt: { lt: new Date(Date.now() - 5 * 60_000) } }] }, data: { status: 'DELIVERING' } })
  if (!claimed.count) return
  const sent = await say(row, sale.telegramChatId, localized(sale.locale === 'fa', `Order #${sale.id} is ready.\n${link}\nKeep this link private.`, `سفارش #${sale.id} آماده است.\n${link}\nاین لینک را محرمانه نگه دارید.`))
  if (sent.ok) await db.resellerSale.updateMany({ where: { id: sale.id, deliveredAt: null }, data: { status: 'FULFILLED', subscriptionId: sub.id, deliveredAt: new Date(), lastError: '' } })
  else await db.resellerSale.update({ where: { id: sale.id }, data: { status: 'PROVISIONING', subscriptionId: sub.id, lastError: sent.description || 'Telegram delivery failed' } })
}


export async function retryResellerDeliveries(limit = 20) {
  const pending = await db.resellerSale.findMany({ where: { status: { in: ['PROVISIONING', 'DELIVERING'] }, orderId: { not: null }, deliveredAt: null, updatedAt: { lt: new Date(Date.now() - 5 * 60_000) } }, select: { orderId: true }, orderBy: { updatedAt: 'asc' }, take: Math.max(1, Math.min(100, limit)) })
  for (const sale of pending) if (sale.orderId) await deliverResellerSale(sale.orderId)
  return pending.length
}
