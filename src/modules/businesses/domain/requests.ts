import { BusinessError, normalizeBusinessWebsite } from './businesses'
import { businessId } from './profiles'
import { plainText } from '@/shared/text/plain'

export function normalizeBusinessRequest(input: Record<string, unknown>) {
  if (input.kind !== 'SUGGESTION' && input.kind !== 'CLAIM') throw new BusinessError('نوع درخواست معتبر نیست')
  const clean = (value: unknown, maximum: number) => {
    if (typeof value !== 'string') throw new BusinessError('اطلاعات درخواست کامل نیست')
    const result = plainText(value).trim()
    if (result.length > maximum) throw new BusinessError('متن درخواست بیش از حد طولانی است')
    return result
  }
  const note = clean(input.note, 1000)
  if (note.length < 20) throw new BusinessError('دلیل درخواست را در حداقل ۲۰ نویسه بنویسید')
  if (input.kind === 'CLAIM') return { kind: 'CLAIM' as const, businessId: businessId(input.businessId), name: '', category: '', domain: '', website: '', note }
  const name = clean(input.name, 120), category = clean(input.category || '', 80)
  if (name.length < 2) throw new BusinessError('نام کسب‌وکار را وارد کنید')
  return { kind: 'SUGGESTION' as const, businessId: null, name, category, ...normalizeBusinessWebsite(input.website), note }
}
