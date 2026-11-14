import { StoreError } from '@/modules/store/domain/store'
import { validateAddress, formatAddress, ShippingError } from '@/modules/shipping/domain/shipping'

export const DELIVERY_CHANGE_STATUSES = ['REQUESTED', 'APPROVED', 'REJECTED', 'WITHDRAWN'] as const
export type DeliveryChangeStatus = typeof DELIVERY_CHANGE_STATUSES[number]
export type DeliveryAddress = { recipient: string; phone: string; country: string; province: string; city: string; address: string; plaque: string; unit: string; postalCode: string; lat: number | null; lng: number | null }

export function cleanDeliveryAddress(raw: Record<string, unknown>): DeliveryAddress {
  try {
    const value = validateAddress(raw)
    return { recipient: value.recipient, phone: value.mobile, country: 'ایران', province: value.province, city: value.city, address: formatAddress(value), plaque: value.plaque, unit: value.unit, postalCode: value.postalCode, lat: value.lat ?? null, lng: value.lng ?? null }
  } catch (error) { if (error instanceof ShippingError) throw new StoreError(error.message, error.status, 'ADDRESS_INVALID'); throw error }
}

export const encodeAddress = (value: DeliveryAddress) => JSON.stringify(value)
export function decodeAddress(value: string): DeliveryAddress {
  try { return JSON.parse(value) as DeliveryAddress } catch { return { recipient: '', phone: '', country: 'ایران', province: '', city: '', address: '', plaque: '', unit: '', postalCode: '', lat: null, lng: null } }
}

export function assertFeeAcknowledged(fromFeeMinor: bigint, newFeeMinor: bigint, acknowledged: unknown) {
  if (fromFeeMinor !== newFeeMinor && acknowledged !== true) throw new StoreError('تفاوت هزینه ارسال را به‌عنوان هزینه فروشگاه تأیید کنید', 400, 'FEE_ACK_REQUIRED')
}
