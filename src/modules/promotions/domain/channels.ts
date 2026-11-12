export type SaleChannel = 'ONLINE' | 'COUNTER'
export type DiscountChannel = SaleChannel | 'BOTH'
export const discountChannelAllows = (configured: string | undefined, channel: SaleChannel, fallback: DiscountChannel = 'ONLINE') => (configured || fallback) === 'BOTH' || (configured || fallback) === channel
