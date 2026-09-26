// Iranian currencies read "۱۲٬۵۰۰٬۰۰۰ ریال" / "۱٬۲۵۰ تومان": whole numbers with the unit after them.
const IRANIAN_UNITS: Record<string, { fa: string; en: string }> = {
  IRR: { fa: 'ریال', en: 'IRR' },
  IRT: { fa: 'تومان', en: 'Toman' },
  TMN: { fa: 'تومان', en: 'Toman' },
}

export function iranianUnit(currency: string, locale = 'fa-IR') {
  const unit = IRANIAN_UNITS[String(currency || '').trim().toUpperCase()]
  return unit ? (locale.startsWith('fa') ? unit.fa : unit.en) : ''
}

export function formatAmount(amount: number, currency = 'USD', locale = 'en-US') {
  const code = String(currency || 'USD').trim().toUpperCase()
  const unit = iranianUnit(code, locale)
  if (unit) return `${Math.round(Number(amount) || 0).toLocaleString(locale)} ${unit}`
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: code }).format(Number(amount) || 0)
  } catch {
    return `${Number(amount || 0).toLocaleString(locale)} ${code}`
  }
}
