export type DeviceIdentifier = { serial: string; imei: string }
/** Read only persisted device snapshots, never arbitrary object fields or private order inputs. */
export function deviceIdentifiers(raw: string | null | undefined): DeviceIdentifier[] {
  try { const value: unknown = JSON.parse(raw || '[]'); return Array.isArray(value) ? value.slice(0, 99).flatMap(item => item && typeof item === 'object' && typeof item.serial === 'string' && typeof item.imei === 'string' ? [{ serial: item.serial.slice(0, 80), imei: item.imei.slice(0, 15) }] : []) : [] } catch { return [] }
}
