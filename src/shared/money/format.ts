import { BASE_CURRENCY } from '@/shared/money/base'

// Iranian currencies read "۱۲٬۵۰۰٬۰۰۰ ریال" / "۱٬۲۵۰ تومان": whole numbers with the unit after them.
const IRANIAN_UNITS: Record<string, { fa: string; en: string }> = {
  IRR: { fa: 'ریال', en: 'IRR' },
  IRT: { fa: 'تومان', en: 'Toman' },
  TMN: { fa: 'تومان', en: 'Toman' },
}

const CURRENCY_NAMES: Record<string, { fa: string; en: string }> = {
  IRT: { fa: 'تومان ایران', en: 'Iranian toman' }, TMN: { fa: 'تومان ایران', en: 'Iranian toman' }, IRR: { fa: 'ریال ایران', en: 'Iranian rial' },
  USD: { fa: 'دلار آمریکا', en: 'US dollar' }, EUR: { fa: 'یورو', en: 'Euro' }, GBP: { fa: 'پوند انگلیس', en: 'British pound' }, AED: { fa: 'درهم امارات', en: 'UAE dirham' }, TRY: { fa: 'لیر ترکیه', en: 'Turkish lira' }, USDT: { fa: 'تتر', en: 'Tether' },
}

/** A currency as a person reads it in a choice: "تومان ایران (IRT)", "ریال ایران (IRR)". */
export function currencyLabel(currency: string, locale = 'fa-IR') {
  const code = String(currency || '').trim().toUpperCase()
  const name = CURRENCY_NAMES[code]
  return name ? `${locale.startsWith('fa') ? name.fa : name.en} (${code === 'TMN' ? 'IRT' : code})` : code
}

export function iranianUnit(currency: string, locale = 'fa-IR') {
  const unit = IRANIAN_UNITS[String(currency || '').trim().toUpperCase()]
  return unit ? (locale.startsWith('fa') ? unit.fa : unit.en) : ''
}

export function formatAmount(amount: number, currency = BASE_CURRENCY, locale = 'en-US') {
  const code = String(currency || BASE_CURRENCY).trim().toUpperCase()
  const unit = iranianUnit(code, locale)
  if (unit) return `${Math.round(Number(amount) || 0).toLocaleString(locale)} ${unit}`
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: code }).format(Number(amount) || 0)
  } catch {
    return `${Number(amount || 0).toLocaleString(locale)} ${code}`
  }
}
