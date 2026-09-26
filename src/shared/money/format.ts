export function formatAmount(amount: number, currency = 'USD', locale = 'en-US') {
  const code = String(currency || 'USD').trim().toUpperCase()
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: code }).format(Number(amount) || 0)
  } catch {
    return `${Number(amount || 0).toLocaleString(locale)} ${code}`
  }
}
