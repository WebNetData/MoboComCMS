import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { DEFAULT_ORDER_PAUSE_NOTICE, StoreError, type StoreSettings } from '@/modules/store/domain/store'

export function orderPauseMessage(settings: Pick<StoreSettings, 'ordersPaused' | 'orderPauseNotice'>): string {
  return settings.ordersPaused ? settings.orderPauseNotice || DEFAULT_ORDER_PAUSE_NOTICE : ''
}

/** Read authoritative state without a fallback/cache before accepting a new online Store order. */
export async function assertStoreAcceptsOrders(client: Prisma.TransactionClient = db): Promise<void> {
  const stored = await client.setting.findUnique({ where: { key: 'store.merchandising.v1' }, select: { value: true } })
  if (!stored) return
  let value: unknown
  try { value = JSON.parse(stored.value) } catch { throw new StoreError('تنظیمات پذیرش سفارش در دسترس نیست؛ کمی بعد دوباره تلاش کنید', 503, 'STORE_SETTINGS_UNAVAILABLE') }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new StoreError('تنظیمات پذیرش سفارش نیاز به بررسی دارد', 503, 'STORE_SETTINGS_UNAVAILABLE')
  const settings = value as Record<string, unknown>
  if (settings.ordersPaused === true) {
    const notice = typeof settings.orderPauseNotice === 'string' ? settings.orderPauseNotice.replace(/[<>\u0000-\u001f]/g, ' ').trim().slice(0, 300) : ''
    throw new StoreError(notice || DEFAULT_ORDER_PAUSE_NOTICE, 409, 'STORE_ORDERS_PAUSED')
  }
}
