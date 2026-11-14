import { createHmac } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { authSecret } from '@/platform/config/env'
import { normalizeStoreSettings } from '@/modules/store/domain/store'

type Line = { productId: number | null; variantId: number | null; name: string; kind: string; quantity: number; totalMinor: bigint; unitPriceMinor: bigint; listPriceMinor: bigint; unitCostMinor: bigint | null; deviceIdentifiers?: string }
export async function counterPriceWarnings(tx: Prisma.TransactionClient, lines: Line[], subtotal: bigint, discount: bigint, currency: string) {
  const stored = await tx.setting.findUnique({ where: { key: 'store.merchandising.v1' }, select: { value: true } })
  const settings = normalizeStoreSettings(stored ? JSON.parse(stored.value) : {})
  const notices: string[] = []
  const net = subtotal > discount ? subtotal - discount : 0n
  for (const line of lines) {
    if (line.unitCostMinor !== null && subtotal > 0n && line.totalMinor * net < line.unitCostMinor * BigInt(line.quantity) * subtotal) notices.push(`«${line.name}» پس از تخفیف زیر بهای خرید ثبت‌شده فروخته می‌شود.`)
  }
  const listed = lines.reduce((sum, line) => sum + (line.listPriceMinor > line.unitPriceMinor ? line.listPriceMinor : line.unitPriceMinor) * BigInt(line.quantity), 0n)
  if (settings.counterDiscountWarningPercent > 0 && listed > 0n && (listed - net) * 100n >= listed * BigInt(settings.counterDiscountWarningPercent)) notices.push(`تخفیف این فروش به آستانهٔ ${settings.counterDiscountWarningPercent.toLocaleString('fa-IR')}٪ رسیده است.`)
  const priced = lines.map(line => ({ productId: line.productId, variantId: line.variantId, name: line.name, kind: line.kind, quantity: line.quantity, totalMinor: line.totalMinor, unitPriceMinor: line.unitPriceMinor, listPriceMinor: line.listPriceMinor, unitCostMinor: line.unitCostMinor, deviceIdentifiers: line.deviceIdentifiers || '[]' }))
  const warningFingerprint = notices.length ? createHmac('sha256', authSecret()).update(JSON.stringify({ lines: priced, subtotal, discount, currency, threshold: settings.counterDiscountWarningPercent }, (_key, value) => typeof value === 'bigint' ? value.toString() : value)).digest('hex') : ''
  return { warnings: notices, warningFingerprint }
}
