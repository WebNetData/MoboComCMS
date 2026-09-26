'use client'

import MediaCrud, { type MediaField } from '../cms/MediaCrud'
import { commonFields } from '../cms/media-fields'
import { useI18n } from '@/i18n/LocaleProvider'

export default function AdminCinemaPage() {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const { access, status, featured, publishedAt, slug } = commonFields(fa)
  const fields: MediaField[] = [
    { key: 'kind', label: fa ? 'نوع' : 'Type', type: 'select', options: [{ value: 'MOVIE', label: fa ? 'فیلم سینمایی' : 'Movie' }, { value: 'SERIES', label: fa ? 'سریال' : 'Series' }], table: true },
    { key: 'title', label: fa ? 'عنوان فارسی' : 'Title', required: true, table: true },
    { key: 'titleEn', label: fa ? 'عنوان انگلیسی' : 'English title', dir: 'ltr' },
    { key: 'originalTitle', label: fa ? 'نام اصلی' : 'Original title', dir: 'ltr' },
    { key: 'year', label: fa ? 'سال ساخت' : 'Year', type: 'number', table: true },
    { key: 'endYear', label: fa ? 'سال پایان (سریال)' : 'End year (series)', type: 'number' },
    { key: 'seriesStatus', label: fa ? 'وضعیت پخش سریال' : 'Series status', type: 'select', options: [{ value: '', label: '—' }, { value: 'ONGOING', label: fa ? 'در حال پخش' : 'Ongoing' }, { value: 'ENDED', label: fa ? 'پایان یافته' : 'Ended' }] },
    { key: 'imdbRating', label: fa ? 'امتیاز IMDb' : 'IMDb rating', type: 'number', table: true },
    { key: 'imdbId', label: 'IMDb ID', dir: 'ltr', placeholder: 'tt0111161' },
    { key: 'runtime', label: fa ? 'مدت (دقیقه)' : 'Runtime (min)', type: 'number' },
    { key: 'ageRating', label: fa ? 'رده سنی' : 'Age rating', placeholder: '+13' },
    { key: 'genres', label: fa ? 'ژانرها (با ویرگول)' : 'Genres (comma separated)', placeholder: fa ? 'درام، جنایی' : 'Drama, Crime' },
    { key: 'countries', label: fa ? 'کشور سازنده' : 'Countries' },
    { key: 'languages', label: fa ? 'زبان' : 'Languages' },
    { key: 'director', label: fa ? 'کارگردان' : 'Director' },
    { key: 'quality', label: fa ? 'بهترین کیفیت' : 'Best quality', placeholder: '1080p BluRay', dir: 'ltr' },
    { key: 'dubbed', label: fa ? 'دوبله فارسی دارد' : 'Persian dub available', type: 'checkbox', table: true },
    { key: 'subtitle', label: fa ? 'زیرنویس فارسی دارد' : 'Persian subtitles', type: 'checkbox' },
    { key: 'poster', label: fa ? 'پوستر (عمودی)' : 'Poster (portrait)', type: 'image', table: true },
    { key: 'backdrop', label: fa ? 'تصویر پس‌زمینه (افقی، برای اسلایدر)' : 'Backdrop (landscape, hero)', type: 'image' },
    { key: 'trailerUrl', label: fa ? 'تریلر (لینک ویدیو mp4 یا آپارات/یوتیوب)' : 'Trailer (mp4 or YouTube/Aparat link)', dir: 'ltr', wide: true },
    { key: 'summary', label: fa ? 'خلاصه داستان' : 'Synopsis', type: 'textarea' },
    { key: 'summaryEn', label: fa ? 'خلاصه انگلیسی' : 'English synopsis', type: 'textarea', dir: 'ltr' },
    { key: 'cast', label: fa ? 'بازیگران' : 'Cast', type: 'records', recordKeys: [{ key: 'name', label: fa ? 'نام' : 'Name' }, { key: 'role', label: fa ? 'نقش' : 'Role' }, { key: 'image', label: fa ? 'عکس (URL)' : 'Photo URL', dir: 'ltr', wide: true }] },
    { key: 'links', label: fa ? 'لینک‌های دانلود / پخش فیلم' : 'Download / stream links (movie)', type: 'links', hint: fa ? 'برای سریال، لینک هر قسمت را در بخش فصل‌ها وارد کنید. لینک‌ها فقط از مسیر امن سایت باز می‌شوند.' : 'For series, add links per episode below. Links only open through the protected site endpoint.' },
    { key: 'seasons', label: fa ? 'فصل‌ها و قسمت‌ها (سریال)' : 'Seasons & episodes (series)', type: 'seasons' },
    access, status, featured, publishedAt, slug,
  ]
  return <MediaCrud type="cinema-titles" title={fa ? 'فیلم و سریال' : 'Films & series'} subtitle={fa ? 'هر فیلم یا قسمت می‌تواند چند لینک با کیفیت، حجم، دوبله/زیرنویس و دسترسی VIP داشته باشد.' : 'Every movie or episode can carry several links with quality, size, dub/subtitle and VIP access.'} fields={fields} publicPath={(row) => (row.status === 'PUBLISHED' ? `/cinema/${row.slug}` : null)} />
}
