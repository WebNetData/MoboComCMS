import { normalizePersonName } from './people'
import { validatePublicImage } from '@/shared/content/cover'
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
  try { image = validatePublicImage(input.image) } catch (error) { throw new PersonProfileError(error instanceof Error ? error.message : 'نشانی تصویر معتبر نیست') }
  // The English (Latin) name is optional; sent empty it is cleared, not sent it stays as it was.
  let english: { nameEn: string; normalizedNameEn: string } | Record<string, never> = {}
  if (input.nameEn !== undefined) {
    const nameEn = typeof input.nameEn === 'string' ? input.nameEn.replace(/\s+/g, ' ').trim() : null
    if (nameEn === null || nameEn.length > 120 || /[<>\u0000-\u001f\u0600-\u06FF]/.test(nameEn) || nameEn && !/[A-Za-z]/.test(nameEn)) throw new PersonProfileError('نام انگلیسی را با حروف لاتین و حداکثر ۱۲۰ نویسه بنویسید')
    english = { nameEn, normalizedNameEn: nameEn ? normalizePersonName(nameEn) : '' }
  }
  return { name, displayNameKey: normalizePersonName(name), ...english, bio: cleanRichText(input.bio), image, imageLocked: input.imageLocked }
}
