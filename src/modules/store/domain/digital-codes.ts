// Codes a virtual product delivers by itself (gift cards, licence keys): the rules that need no database.

export const DIGITAL_MODES = ['MANUAL', 'CODES', 'FILES'] as const
export type DigitalMode = (typeof DIGITAL_MODES)[number]
export const normalizeDigitalMode = (value: unknown): DigitalMode => (value === 'CODES' ? 'CODES' : value === 'FILES' ? 'FILES' : 'MANUAL')

/**
 * When the shelf of a code product is empty (owner 2026-11-12, «a ready ChatGPT Plus account»): STOP selling, as before
 * (stock is the codes on the shelf), or keep selling without limit (STAFF): a code is delivered when there is one, and
 * an order the shelf cannot serve goes to a specialist, who takes it, makes the account and delivers it by hand.
 */
export const CODES_WHEN_EMPTY = ['STOP', 'STAFF'] as const
export type CodesWhenEmpty = (typeof CODES_WHEN_EMPTY)[number]
export const normalizeCodesWhenEmpty = (value: unknown): CodesWhenEmpty => (value === 'STAFF' ? 'STAFF' : 'STOP')

export const MAX_CODE_LENGTH = 500
export const MAX_CODES_PER_REQUEST = 2000

/** How a code is compared: surrounding space does not make it a different code. */
export const normalizeCode = (value: string) => value.replace(/\s+/g, ' ').trim()

/**
 * Splits pasted text into codes, one per line. Empty lines are skipped, a code repeated in the text is
 * taken once and reported, and a line that is too long or carries markup is refused as a whole request,
 * because a silently dropped code would be a code the owner believes is in stock.
 */
export function parseCodes(text: unknown): { codes: string[]; repeated: number } {
  const lines = String(text ?? '').split(/\r?\n/).map(normalizeCode).filter(Boolean)
  if (lines.length > MAX_CODES_PER_REQUEST) throw new Error(`حداکثر ${MAX_CODES_PER_REQUEST.toLocaleString('fa-IR')} کد در هر بار`)
  const seen = new Set<string>()
  for (const [index, line] of lines.entries()) {
    if (line.length > MAX_CODE_LENGTH) throw new Error(`کد خط ${(index + 1).toLocaleString('fa-IR')} بیش از حد طولانی است`)
    if (/[<>]/.test(line)) throw new Error(`کد خط ${(index + 1).toLocaleString('fa-IR')} نویسهٔ غیرمجاز دارد`)
    seen.add(line)
  }
  return { codes: [...seen], repeated: lines.length - seen.size }
}

/** What staff see of a code on the shelf: enough to recognise it, not enough to use it. */
export function maskCode(code: string): string {
  const text = normalizeCode(code)
  if (text.length <= 4) return '•'.repeat(text.length)
  return `${'•'.repeat(Math.min(12, text.length - 4))}${text.slice(-4)}`
}

export interface DeliveredLine { name: string; variantName: string; codes: string[] }

/** The text stored as the order's digital delivery: each item with its codes, one per line. */
export function composeDelivery(lines: readonly DeliveredLine[]): string {
  return lines.filter((line) => line.codes.length).map((line) => `${line.name}${line.variantName ? ` (${line.variantName})` : ''}\n${line.codes.join('\n')}`).join('\n\n')
}

/** Units of a line still without a code. */
export const missingCodes = (quantity: number, assigned: number) => Math.max(0, Math.max(1, quantity) - assigned)

/** A virtual product is "instant" only when it delivers codes by itself and has one to give. */
export const deliversInstantly = (product: { kind: string; digitalMode: string; stock: number }) => product.kind === 'VIRTUAL' && product.digitalMode === 'CODES' && product.stock > 0
