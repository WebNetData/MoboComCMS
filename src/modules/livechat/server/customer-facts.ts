import { db } from '@/platform/database/prisma'
import { minorToNumber } from '@/shared/money'

/** What the assistant may know about a signed-in customer (their own data only). */
export async function customerFacts(userId: number | null) {
  if (!userId) return ''
  const [user, orders, tickets, wallets] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { name: true } }),
    db.order.findMany({ where: { userId, productId: { not: null } }, orderBy: { id: 'desc' }, take: 3, select: { id: true, status: true, createdAt: true, totalMinor: true, currency: true, productDelivery: { select: { status: true } }, shipment: { select: { trackingCode: true, carrierName: true } }, lines: { select: { name: true }, take: 3 } } }),
    db.ticket.count({ where: { userId, status: { not: 'CLOSED' } } }),
    db.walletAccount.findMany({ where: { userId }, select: { currency: true, balanceMinor: true } }),
  ])
  const status: Record<string, string> = { PENDING: 'در انتظار پرداخت', PAID: 'پرداخت‌شده', FAILED: 'ناموفق', REFUNDED: 'بازپرداخت‌شده', CANCELLED: 'لغوشده' }
  const delivery: Record<string, string> = { PENDING: 'در صف پردازش', PROCESSING: 'در حال آماده‌سازی', PACKED: 'بسته‌بندی شد', SHIPPED: 'ارسال شد', DELIVERED: 'تحویل شد', RETURNED: 'مرجوع شد', CANCELLED: 'لغو شد' }
  return [
    `نام: ${user?.name || '—'}`,
    orders.length ? `آخرین سفارش‌ها:\n${orders.map((order) => `- سفارش ${order.id} (${order.createdAt.toLocaleDateString('fa-IR')}): ${order.lines.map((line) => line.name).join('، ')} — ${status[order.status] || order.status}${order.productDelivery ? ` / ${delivery[order.productDelivery.status] || order.productDelivery.status}` : ''}${order.shipment?.trackingCode ? ` / کد رهگیری ${order.shipment.trackingCode} (${order.shipment.carrierName})` : ''}`).join('\n')}` : 'سفارشی ندارد.',
    `تیکت باز: ${tickets}`,
    wallets.length ? `موجودی کیف پول: ${wallets.map((w) => `${minorToNumber(w.balanceMinor, w.currency).toLocaleString('fa-IR')} ${w.currency === 'IRT' ? 'تومان' : w.currency}`).join('، ')}` : '',
  ].filter(Boolean).join('\n')
}
