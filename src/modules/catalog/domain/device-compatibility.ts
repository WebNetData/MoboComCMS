export const DEVICE_COMPATIBILITY_STATUSES = ['COMPATIBLE', 'INCOMPATIBLE', 'CONDITIONAL'] as const
export type DeviceCompatibilityStatus = typeof DEVICE_COMPATIBILITY_STATUSES[number]

export type DeviceCompatibilityInput = {
  deviceModel: string
  normalizedModel: string
  status: DeviceCompatibilityStatus
  note: string
  source: string
}

/** Normalize common Persian/Arabic keyboard variants while retaining exact model matching. */
export function normalizeDeviceModel(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('fa')
    .replace(/[ك]/g, 'ک')
    .replace(/[يى]/g, 'ی')
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x6f0))
    .replace(/\s+/g, ' ')
}

const boundedText = (value: unknown, limit: number) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, limit)

export function parseDeviceCompatibilityRows(value: unknown): DeviceCompatibilityInput[] {
  if (value == null) return []
  if (!Array.isArray(value) || value.length > 100) throw new Error('Invalid device compatibility list')
  const rows = value.map((item): DeviceCompatibilityInput => {
    if (!item || typeof item !== 'object') throw new Error('Invalid device compatibility row')
    const row = item as Record<string, unknown>
    const deviceModel = boundedText(row.deviceModel, 120)
    const normalizedModel = normalizeDeviceModel(deviceModel)
    const status = String(row.status ?? 'COMPATIBLE') as DeviceCompatibilityStatus
    if (!deviceModel || !normalizedModel || !DEVICE_COMPATIBILITY_STATUSES.includes(status)) throw new Error('Enter a device model and valid compatibility status')
    return {
      deviceModel,
      normalizedModel,
      status,
      note: boundedText(row.note, 500),
      source: boundedText(row.source, 240),
    }
  })
  if (new Set(rows.map((row) => row.normalizedModel)).size !== rows.length) throw new Error('Device models must be unique after normalization')
  return rows
}
