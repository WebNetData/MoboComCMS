import { discountChannelAllows, type SaleChannel } from '@/modules/promotions/domain/channels'

/** A price advertised for one channel never lowers the regular price of the other channel. */
export function channelRegularMinor(amount: bigint, compareAt: bigint, configured?: string, channel: SaleChannel = 'ONLINE') {
  return compareAt > amount && !discountChannelAllows(configured, channel, 'BOTH') ? compareAt : amount
}
