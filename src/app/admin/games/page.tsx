'use client'

import MediaCrud, { type MediaField } from '../cms/MediaCrud'
import { commonFields } from '../cms/media-fields'
import { useI18n } from '@/i18n/LocaleProvider'

export default function AdminGamesPage() {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const { access, status, featured, publishedAt, slug } = commonFields(fa)
  const fields: MediaField[] = [
    { key: 'title', label: fa ? 'نام بازی' : 'Title', required: true, table: true },
    { key: 'titleEn', label: fa ? 'نام انگلیسی' : 'English title', dir: 'ltr' },
    { key: 'platforms', label: fa ? 'پلتفرم‌ها (با ویرگول)' : 'Platforms (comma separated)', placeholder: 'PC, PS5, Xbox Series', dir: 'ltr', table: true },
    { key: 'terms', label: fa ? 'دسته‌بندی و زیردسته' : 'Categories', type: 'terms', taxonomy: 'games' },
    { key: 'genres', label: fa ? 'سبک‌ها' : 'Genres', placeholder: fa ? 'اکشن، نقش‌آفرینی' : 'Action, RPG' },
    { key: 'developer', label: fa ? 'سازنده' : 'Developer' },
    { key: 'publisher', label: fa ? 'ناشر' : 'Publisher' },
    { key: 'releaseDate', label: fa ? 'تاریخ انتشار' : 'Release date', type: 'date' },
    { key: 'score', label: fa ? 'نمره منتقدان (۰ تا ۱۰۰)' : 'Critic score (0–100)', type: 'number', table: true },
    { key: 'userScore', label: fa ? 'نمره کاربران (۰ تا ۱۰)' : 'User score (0–10)', type: 'number' },
    { key: 'ageRating', label: fa ? 'رده سنی' : 'Age rating', placeholder: 'PEGI 16' },
    { key: 'cover', label: fa ? 'کاور (عمودی)' : 'Cover (portrait)', type: 'image', table: true },
    { key: 'backdrop', label: fa ? 'تصویر پس‌زمینه (افقی)' : 'Backdrop (landscape)', type: 'image' },
    { key: 'trailerUrl', label: fa ? 'تریلر' : 'Trailer URL', dir: 'ltr', wide: true },
    { key: 'summary', label: fa ? 'خلاصه' : 'Summary', type: 'textarea' },
    { key: 'content', label: fa ? 'نقد و بررسی (HTML مجاز)' : 'Review (HTML allowed)', type: 'textarea' },
    { key: 'pros', label: fa ? 'نقاط قوت' : 'Pros', type: 'records', recordKeys: [{ key: 'text', label: fa ? 'نقطه قوت' : 'Pro', wide: true }] },
    { key: 'cons', label: fa ? 'نقاط ضعف' : 'Cons', type: 'records', recordKeys: [{ key: 'text', label: fa ? 'نقطه ضعف' : 'Con', wide: true }] },
    { key: 'screenshots', label: fa ? 'اسکرین‌شات‌ها' : 'Screenshots', type: 'records', recordKeys: [{ key: 'src', label: fa ? 'نشانی تصویر' : 'Image URL', dir: 'ltr', wide: true }] },
    { key: 'requirements', label: fa ? 'سیستم مورد نیاز' : 'System requirements', type: 'requirements' },
    { key: 'links', label: fa ? 'لینک‌های دانلود' : 'Download links', type: 'links' },
    access, status, featured, publishedAt, slug,
  ]
  return <MediaCrud type="games" title={fa ? 'بازی‌ها' : 'Games'} subtitle={fa ? 'نقد، نمره، سیستم مورد نیاز، اسکرین‌شات و لینک دانلود با دسترسی VIP.' : 'Reviews, scores, requirements, screenshots and VIP-aware downloads.'} fields={fields} publicPath={(row) => (row.status === 'PUBLISHED' ? `/games/${row.slug}` : null)} />
}
