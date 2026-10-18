import { validatePublicImage } from '@/shared/content/cover'
import { cleanRichText } from '@/shared/content/sanitize'

export class ArtistProfileError extends Error {
  constructor(message: string, public readonly status = 422) { super(message) }
}
/** Partial updates keep the existing import/admin contract. Only supplied fields change. */
export function artistProfilePatch(input: Record<string,unknown>, creating: boolean) {
  const data: Record<string,unknown> = {}
  if (creating && !Object.hasOwn(input,'name')) throw new ArtistProfileError('نام خواننده را وارد کنید')
  for (const field of ['name','nameEn'] as const) if (Object.hasOwn(input,field)) {
    if (typeof input[field] !== 'string') throw new ArtistProfileError('نام خواننده معتبر نیست')
    const name = input[field].replace(/\s+/g,' ').trim()
    if (name.length>160 || field==='name'&&!name || /[<>\u0000-\u001f]/.test(name)) throw new ArtistProfileError('نام باید حداکثر ۱۶۰ نویسه و بدون کد باشد')
    data[field]=name
  }
  for (const field of ['image','cover'] as const) if (Object.hasOwn(input,field)) {
    if (typeof input[field]!=='string') throw new ArtistProfileError('نشانی عکس معتبر نیست')
    try { data[field]=validatePublicImage(input[field]) } catch(error) { throw new ArtistProfileError(error instanceof Error?error.message:'نشانی عکس معتبر نیست') }
  }
  if (Object.hasOwn(input,'bio')) {
    if (typeof input.bio!=='string'||input.bio.length>20000) throw new ArtistProfileError('زندگی‌نامه حداکثر ۲۰ هزار نویسه است')
    data.bio=cleanRichText(input.bio)
  }
  return data
}
export function artistExpectedUpdate(input:Record<string,unknown>) {
  if (!Object.hasOwn(input,'expectedUpdatedAt')) return null
  const raw=input.expectedUpdatedAt
  if (typeof raw!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(raw)||!Number.isFinite(new Date(raw).getTime())) throw new ArtistProfileError('نسخهٔ فرم معتبر نیست؛ مشخصات را دوباره دریافت کنید')
  return new Date(raw)
}
export function artistProfileFilter(filter:string) {
  if (!filter) return {}
  if (filter==='missing-image') return {image:''}
  if (filter==='featured') return {featured:true}
  if (filter==='unlinked') return {albums:{none:{}},tracks:{none:{}}}
  throw new ArtistProfileError('فیلتر خواننده معتبر نیست')
}
