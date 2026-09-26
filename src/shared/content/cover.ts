export function validateCover(value: unknown): string {
  if (value === undefined || value === '') return ''
  if (typeof value !== 'string' || value.length > 2048 || /[\s\\<>]/.test(value)) throw new Error('نشانی تصویر معتبر نیست')
  if (/^\/(?!\/)/.test(value)) return value
  try { if (['https:', 'http:'].includes(new URL(value).protocol)) return value } catch { /* Invalid URL. */ }
  throw new Error('نشانی تصویر باید آدرس وب یا مسیر تصویر سایت باشد')
}
