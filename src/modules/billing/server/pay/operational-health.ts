import { db } from '@/platform/database/prisma'
import { isModuleEnabled } from '@/extensions/server/modules'
import { overdueBotDeliveryWhere } from './bot/operations'

/** Aggregate-only signal for the existing Operations Monitor. */
export async function payOperationalHealth(now = new Date()) {
  if (!await isModuleEnabled('mobocom-pay')) return null
  const [botAttention, bankAttention] = await Promise.all([
    db.payBotDelivery.count({
      where: {
        payment: { status: 'PAID' },
        OR: [
          { status: { in: ['UNKNOWN', 'BLOCKED'] } },
          overdueBotDeliveryWhere(now),
        ],
      },
    }),
    db.payBaleCollection.count({
      where: {
        invoice: { status: 'UNPAID' },
        OR: [
          { status: 'REVIEW' },
          { status: 'UNDER_REVIEW', expiresAt: { lte: now } },
        ],
      },
    }),
  ])
  return { botAttention, bankAttention }
}
