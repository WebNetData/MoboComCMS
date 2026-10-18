export function validateCover(value: unknown): string {
  if (value === undefined || value === '') return ''
  if (typeof value !== 'string' || value.length > 2048 || /[\s\\<>]/.test(value)) throw new Error('نشانی تصویر معتبر نیست')
  if (/^\/(?!\/)/.test(value)) return value
  try { if (['https:', 'http:'].includes(new URL(value).protocol)) return value } catch { /* Invalid URL. */ }
  throw new Error('نشانی تصویر باید آدرس وب یا مسیر تصویر سایت باشد')
}

/** Curated public portraits must never point at private application routes. No server fetch. */
export function validatePublicImage(value: unknown): string {
  const image = validateCover(value)
  if (image.startsWith('/')) {
    if (!/^\/(?:files\/|images\/|demo\/|api\/media\/(?:covers\/|transfers\/))/.test(image) || /(?:^|\/)\.{1,2}(?:\/|$)|%2e|%2f|%5c/i.test(image)) throw new Error('تصویر باید از مسیر عمومی کتابخانه یا تصاویر سایت باشد')
  } else if (image) {
    const url = new URL(image)
    if (url.username || url.password) throw new Error('نشانی تصویر نباید اطلاعات ورود داشته باشد')
  }
  return image
}
