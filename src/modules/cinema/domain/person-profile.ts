import { normalizePersonName } from './people'
import { validateCover } from '@/shared/content/cover'
import { cleanRichText } from '@/shared/content/sanitize'

export class PersonProfileError extends Error {
  constructor(message: string, public readonly status = 422) { super(message) }
}
export function personProfileInput(input: Record<string, unknown>) {
  const name = typeof input.name === 'string' ? input.name.replace(/\s+/g, ' ').trim() : ''
  if (name.length > 120 || /[<>\u0000-\u001f]/.test(name) || normalizePersonName(name).length < 2) throw new PersonProfileError('نام باید بین ۲ تا ۱۲۰ نویسه باشد')
  if (typeof input.bio !== 'string' || input.bio.length > 30000) throw new PersonProfileError('زندگی‌نامه حداکثر ۳۰ هزار نویسه است')
  if (typeof input.imageLocked !== 'boolean') throw new PersonProfileError('وضعیت حفظ عکس را مشخص کنید')
  if (typeof input.image !== 'string') throw new PersonProfileError('نشانی عکس را مشخص کنید؛ برای حذف آن فیلد را خالی بگذارید')
  let image: string
  try { image = validateCover(input.image) } catch { throw new PersonProfileError('نشانی تصویر معتبر نیست') }
  if (image.startsWith('/')) {
    if (!/^\/(?:files\/|images\/|demo\/|api\/media\/(?:covers\/|transfers\/))/.test(image) || /(?:^|\/)\.{1,2}(?:\/|$)|%2e|%2f|%5c/i.test(image)) throw new PersonProfileError('عکس باید از مسیر عمومی کتابخانه یا تصاویر سایت باشد')
  } else if (image) {
    const url = new URL(image)
    if (url.username || url.password) throw new PersonProfileError('نشانی تصویر نباید اطلاعات ورود داشته باشد')
  }
  return { name, displayNameKey: normalizePersonName(name), bio: cleanRichText(input.bio), image, imageLocked: input.imageLocked }
}
