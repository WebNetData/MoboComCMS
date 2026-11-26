import { db } from '@/platform/database/prisma'
import { moveWallet } from '@/modules/wallet/server/wallet'
import { legacyNumber, normalizeCurrency } from '@/shared/money'
import { floorHour } from '@/modules/hosting/domain/services'
import { HostingError } from '@/modules/hosting/domain/catalog'
import { chargeHourlyService } from '@/modules/hosting/server/metering'

/** Power changes cannot reprice earlier hours. Any running part of this hour costs one running hour. */
export async function prepareHourlyPower(serviceId: number, command: string, now = new Date()) {
  await chargeHourlyService(serviceId, now, { includeCurrent: true })
  if (!['START', 'REBOOT'].includes(command)) return
  await db.$transaction(
    async (tx) => {
      const service = await tx.hostingService.findUniqueOrThrow({ where: { id: serviceId } })
      if (service.status !== 'ACTIVE' || service.cycle !== 'HOURLY') return
      const hourStart = floorHour(now),
        usage = await tx.hostingUsageCharge.findUnique({ where: { serviceId_hourStart: { serviceId, hourStart } } })
      if (!usage || usage.amountMinor >= service.priceMinor) return
      const delta = service.priceMinor - usage.amountMinor
      const claimed = await tx.hostingUsageCharge.updateMany({
        where: { id: usage.id, amountMinor: usage.amountMinor },
        data: { amountMinor: service.priceMinor, powerState: 'RUNNING' },
      })
      if (!claimed.count) throw new HostingError('هزینهٔ ساعت هم‌زمان تغییر کرد؛ دوباره تلاش کنید')
      const moved = await moveWallet(
        {
          userId: service.userId,
          currency: service.currency,
          amount: -legacyNumber(delta, normalizeCurrency(service.currency)),
          type: 'PURCHASE',
          description: 'تفاوت هزینهٔ ساعت روشن‌شدن سرور',
          idempotencyKey: 'hosting:power-hour:' + service.id + ':' + hourStart.toISOString(),
        },
        tx,
      )
      if (!moved.ok) throw new HostingError('موجودی برای هزینهٔ ساعت روشن‌شدن سرور کافی نیست')
    },
    { isolationLevel: 'Serializable' },
  )
}
