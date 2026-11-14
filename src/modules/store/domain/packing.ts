export const PACKING_CHECKS = [
  { key: 'model', label: 'مدل کالا مطابق سفارش است' },
  { key: 'variant', label: 'رنگ و گونه مطابق سفارش است' },
  { key: 'quantity', label: 'تعداد کنترل شد' },
  { key: 'devices', label: 'سریال یا IMEI موجود کنترل شد' },
  { key: 'accessories', label: 'لوازم همراه کنترل شد' },
] as const
export type PackingCheckKey = typeof PACKING_CHECKS[number]['key']
export type PackingChecks = { line: number } & Record<PackingCheckKey, boolean>
export type PackingLine = { line: number; name: string; variant: string; quantity: number; devices: { serial: string; imei: string }[] }
export type PackingView = {
  required: boolean; editable: boolean; snapshot: string; revision: string | null
  lines: PackingLine[]; checks: PackingChecks[]; note: string
  completed: { name: string; at: string; current: boolean } | null
}
