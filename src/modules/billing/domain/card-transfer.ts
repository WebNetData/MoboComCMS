// Card-to-card and bank transfer rules (pure): Iranian card and Sheba checks,
// bank detection, and validation of bank accounts and customer receipts.

import { latinDigits } from '@/shared/text/digits'

export { latinDigits }

const digitsOnly = (value: unknown) => latinDigits(value).replace(/\D/g, '')

/** Luhn checksum (Shetab cards follow it). */
export function luhnValid(digits: string): boolean {
  if (!/^\d{12,19}$/.test(digits)) return false
  let sum = 0
  for (let index = 0; index < digits.length; index++) {
    let digit = Number(digits[digits.length - 1 - index])
    if (index % 2 === 1) { digit *= 2; if (digit > 9) digit -= 9 }
    sum += digit
  }
  return sum % 10 === 0
}

export function cleanCard(value: unknown): string {
  const digits = digitsOnly(value)
  return digits.length === 16 ? digits : ''
}

export const validCard = (value: unknown) => luhnValid(cleanCard(value))

/** 6037 9911 2345 6789 — always left-to-right. */
export function formatCard(card: string): string {
  const digits = digitsOnly(card)
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim()
}

export function cleanSheba(value: unknown): string {
  const raw = latinDigits(value).toUpperCase().replace(/[\s-]/g, '')
  const digits = raw.replace(/^IR/, '')
  return /^\d{24}$/.test(digits) ? `IR${digits}` : ''
}

/** ISO 13616 mod-97 check of an Iranian IBAN (Sheba). */
export function validSheba(value: unknown): boolean {
  const sheba = cleanSheba(value)
  if (!sheba) return false
  // Move "IR" + check digits to the end; I=18, R=27.
  const rearranged = `${sheba.slice(4)}1827${sheba.slice(2, 4)}`
  let remainder = 0
  for (const char of rearranged) remainder = (remainder * 10 + Number(char)) % 97
  return remainder === 1
}

export function formatSheba(sheba: string): string {
  const clean = cleanSheba(sheba)
  return clean ? clean.replace(/(.{4})(?=.)/g, '$1 ') : sheba
}

// Card BIN (first six digits) → bank.
const CARD_BANKS: Record<string, string> = {
  '603799': 'ملی', '589210': 'سپه', '627648': 'توسعه صادرات', '207177': 'توسعه صادرات', '627961': 'صنعت و معدن',
  '603770': 'کشاورزی', '639217': 'کشاورزی', '628023': 'مسکن', '627760': 'پست بانک', '502908': 'توسعه تعاون',
  '627412': 'اقتصاد نوین', '622106': 'پارسیان', '639194': 'پارسیان', '627884': 'پارسیان', '502229': 'پاسارگاد', '639347': 'پاسارگاد',
  '627488': 'کارآفرین', '502910': 'کارآفرین', '621986': 'سامان', '639346': 'سینا', '639607': 'سرمایه', '636214': 'آینده',
  '502806': 'شهر', '504706': 'شهر', '502938': 'دی', '603769': 'صادرات', '610433': 'ملت', '991975': 'ملت',
  '627353': 'تجارت', '585983': 'تجارت', '589463': 'رفاه', '627381': 'سپه', '639370': 'مهر اقتصاد',
  '505785': 'ایران زمین', '636795': 'مرکزی', '606373': 'قرض‌الحسنه مهر ایران', '505416': 'گردشگری', '505801': 'کوثر',
  '606256': 'ملل', '639599': 'سپه', '585947': 'خاورمیانه', '507677': 'نور', '504172': 'رسالت', '636949': 'سپه',
}

// Sheba bank code (digits 5–7) → bank.
const SHEBA_BANKS: Record<string, string> = {
  '010': 'مرکزی', '011': 'صنعت و معدن', '012': 'ملت', '013': 'رفاه', '014': 'مسکن', '015': 'سپه', '016': 'کشاورزی',
  '017': 'ملی', '018': 'تجارت', '019': 'صادرات', '020': 'توسعه صادرات', '021': 'پست بانک', '022': 'توسعه تعاون',
  '053': 'کارآفرین', '054': 'پارسیان', '055': 'اقتصاد نوین', '056': 'سامان', '057': 'پاسارگاد', '058': 'سرمایه',
  '059': 'سینا', '060': 'قرض‌الحسنه مهر ایران', '061': 'شهر', '062': 'آینده', '063': 'سپه', '064': 'گردشگری',
  '066': 'دی', '069': 'ایران زمین', '070': 'رسالت', '078': 'خاورمیانه',
}

export const bankFromCard = (card: unknown) => CARD_BANKS[cleanCard(card).slice(0, 6)] || ''
export const bankFromSheba = (sheba: unknown) => SHEBA_BANKS[cleanSheba(sheba).slice(4, 7)] || ''

/** Bank names offered in the "source bank" dropdown. */
export const IRANIAN_BANKS = [...new Set([...Object.values(SHEBA_BANKS), ...Object.values(CARD_BANKS)])].sort((a, b) => a.localeCompare(b, 'fa'))

const text = (value: unknown, max: number) => String(value ?? '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)

export class TransferError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

export interface BankAccountInput {
  bankName: string
  holderName: string
  cardNumber: string
  sheba: string
  accountNumber: string
  note: string
  active: boolean
  sortOrder: number
}

/** Validates an admin bank account: at least one of card, Sheba or account number, all checksummed. */
export function normalizeBankAccount(input: Record<string, unknown>): BankAccountInput {
  const cardNumber = cleanCard(input.cardNumber)
  const sheba = cleanSheba(input.sheba)
  const accountNumber = latinDigits(input.accountNumber).replace(/[^\d.-]/g, '').slice(0, 30)
  if (String(input.cardNumber || '').trim() && !luhnValid(cardNumber)) throw new TransferError('شماره کارت معتبر نیست (۱۶ رقم)')
  if (String(input.sheba || '').trim() && !validSheba(sheba)) throw new TransferError('شماره شبا معتبر نیست (IR و ۲۴ رقم)')
  if (!cardNumber && !sheba && !accountNumber) throw new TransferError('حداقل یکی از شماره کارت، شبا یا شماره حساب را وارد کنید')
  const holderName = text(input.holderName, 80)
  if (holderName.length < 3) throw new TransferError('نام صاحب حساب را وارد کنید')
  const bankName = text(input.bankName, 60) || bankFromCard(cardNumber) || bankFromSheba(sheba)
  if (!bankName) throw new TransferError('نام بانک را وارد کنید')
  return {
    bankName, holderName, cardNumber, sheba, accountNumber,
    note: text(input.note, 300),
    active: input.active !== false,
    sortOrder: Number.isSafeInteger(Number(input.sortOrder)) ? Number(input.sortOrder) : 0,
  }
}

export const TRANSFER_METHODS = [
  { id: 'CARD', label: 'کارت به کارت' },
  { id: 'PAYA', label: 'انتقال پایا' },
  { id: 'SATNA', label: 'انتقال ساتنا' },
  { id: 'ACCOUNT', label: 'انتقال حساب به حساب / موبایل‌بانک' },
] as const

export interface ReceiptInput {
  method: string
  bankAccountId: number | null
  payerName: string
  payerBank: string
  payerCard: string
  trackingCode: string
  paidAt: Date
}

/** Customer receipt fields. Only the last four digits of the source card are kept. */
export function normalizeReceipt(input: Record<string, unknown>, now = new Date()): ReceiptInput {
  const method = TRANSFER_METHODS.some((item) => item.id === input.method) ? String(input.method) : 'CARD'
  const payerName = text(input.payerName, 80)
  if (payerName.length < 3) throw new TransferError('نام صاحب کارت یا حساب مبدأ را وارد کنید')
  const payerBank = text(input.payerBank, 60)
  if (!payerBank) throw new TransferError('بانک مبدأ را انتخاب کنید')
  const card = digitsOnly(input.payerCard)
  if (method === 'CARD' && card.length !== 4 && card.length !== 16) throw new TransferError('چهار رقم آخر کارت مبدأ را وارد کنید')
  const trackingCode = latinDigits(input.trackingCode).replace(/[^\w-]/g, '').slice(0, 40)
  if (trackingCode.length < 4) throw new TransferError('شمارهٔ پیگیری یا ارجاع تراکنش را وارد کنید')
  const paidAt = input.paidAt ? new Date(String(input.paidAt)) : now
  if (Number.isNaN(paidAt.getTime()) || paidAt.getTime() > now.getTime() + 10 * 60_000 || paidAt.getTime() < now.getTime() - 30 * 86_400_000) {
    throw new TransferError('تاریخ و ساعت پرداخت معتبر نیست')
  }
  const bankAccountId = Number(input.bankAccountId)
  return {
    method, payerName, payerBank, trackingCode, paidAt,
    payerCard: card.slice(-4),
    bankAccountId: Number.isSafeInteger(bankAccountId) && bankAccountId > 0 ? bankAccountId : null,
  }
}

/** The amount a customer transfers, in Rial and Toman, for a Rial/Toman invoice. */
export function transferAmounts(dueMinor: bigint, currency: string): { rial: bigint; toman: bigint } | null {
  const code = currency.toUpperCase()
  if (code === 'IRR') return { rial: dueMinor, toman: dueMinor / 10n }
  if (code === 'IRT' || code === 'TMN') return { rial: dueMinor * 10n, toman: dueMinor }
  return null
}
