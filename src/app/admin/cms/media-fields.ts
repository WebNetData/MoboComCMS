import type { MediaField } from './MediaCrud'

/** The same fields, shown together under one section heading of the form. */
export const inSection = (section: string, fields: MediaField[]): MediaField[] => fields.map((field) => ({ ...field, section }))

/** Shared admin field sets for the media library. */
export function commonFields(fa: boolean) {
  const access: MediaField = { key: 'access', label: fa ? 'دسترسی' : 'Access', type: 'select', options: [{ value: 'PUBLIC', label: fa ? 'عمومی' : 'Public' }, { value: 'MEMBERS', label: fa ? 'فقط اعضای VIP' : 'VIP members only' }], table: true }
  const status: MediaField = { key: 'status', label: fa ? 'وضعیت' : 'Status', type: 'select', options: [{ value: 'PUBLISHED', label: fa ? 'منتشر شده' : 'Published' }, { value: 'DRAFT', label: fa ? 'پیش‌نویس' : 'Draft' }], table: true }
  const featured: MediaField = { key: 'featured', label: fa ? 'ویژه (نمایش در اسلایدر/صفحه اول)' : 'Featured (hero / front page)', type: 'checkbox', table: true }
  const publishedAt: MediaField = { key: 'publishedAt', label: fa ? 'زمان انتشار' : 'Publish time', type: 'datetime', hint: fa ? 'خالی = همین حالا. زمان آینده = انتشار زمان‌بندی‌شده' : 'Empty = now. A future time schedules it.' }
  const slug: MediaField = { key: 'slug', label: fa ? 'نشانی (slug)' : 'Slug', dir: 'ltr', placeholder: fa ? 'خالی = از عنوان انگلیسی' : 'Empty = from English title' }
  return { access, status, featured, publishedAt, slug }
}
