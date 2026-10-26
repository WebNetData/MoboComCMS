'use client'

import { useEffect, useState } from 'react'
import MediaCrud, { type MediaField } from '../../cms/MediaCrud'
import { commonFields } from '../../cms/media-fields'
import { useI18n } from '@/i18n/LocaleProvider'
import { CinemaShell } from '../shared'
import { structureOf, type CinemaFormat } from '@/modules/cinema/domain/formats'
import { useSectionLists } from '../../cms/useSectionLists'

type Format = CinemaFormat & { titles: number }

/** The managed formats (film, series, anime…) for the type list; an author reads them too. */
function useFormats() {
  const [formats, setFormats] = useState<Format[]>([])
  useEffect(() => {
    let alive = true
    fetch('/api/admin/cinema/formats', { cache: 'no-store' }).then((response) => (response.ok ? response.json() : null)).then((data) => { if (alive && data?.formats) setFormats(data.formats) }).catch(() => {})
    return () => { alive = false }
  }, [])
  return formats
}

export default function AdminCinemaPage() {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const L = (persian: string, english: string) => (fa ? persian : english)
  const formats = useFormats()
  const byId = new Map(formats.map((format) => [String(format.id), format]))
  const nameOf = (format: Format) => `${format.icon ? `${format.icon} ` : ''}${fa ? format.name : format.nameEn || format.name}`
  // A film's own fields and a series' own fields follow the chosen format's structure (or the kind, before one is
  // chosen); a hidden field keeps its value either way.
  const structure = (form: Record<string, unknown>) => byId.get(String(form.formatId ?? ''))?.structure ?? structureOf(form.kind)
  const isSeries = (form: Record<string, unknown>) => structure(form) === 'SERIES'
  const isFilm = (form: Record<string, unknown>) => structure(form) !== 'SERIES'
  const formatOptions = [
    { value: '', label: L('خودکار: فیلم یا سریال (طبق اطلاعات IMDb)', 'Automatic: film or series (from IMDb data)') },
    ...formats.map((format) => ({ value: String(format.id), label: `${nameOf(format)}${format.active ? '' : L(' (غیرفعال)', ' (inactive)')}` })),
  ]
  const formatCell = (row: Record<string, unknown>) => {
    const format = byId.get(String(row.formatId ?? ''))
    return <span className="mx-tag">{format ? nameOf(format) : row.kind === 'SERIES' ? L('سریال', 'Series') : L('فیلم سینمایی', 'Movie')}</span>
  }
  const { access, status, featured, publishedAt, slug } = commonFields(fa)
  // The owner's lists of genres, countries and languages (inactive ones listed for the titles that have them).
  const lists = useSectionLists('cinema', true)
  const listOptions = (list: string) => (lists[list] || []).map((entry) => ({ value: entry.code, alias: entry.nameEn, label: `${entry.icon ? `${entry.icon} ` : ''}${fa ? entry.name : entry.nameEn || entry.name}${entry.active ? '' : L(' (غیرفعال)', ' (inactive)')}` }))
  const S = {
    main: L('اطلاعات اصلی', 'Basics'),
    facts: L('امتیاز و مشخصات', 'Rating & details'),
    terms: L('دسته‌بندی و ژانر', 'Categories & genres'),
    people: L('عوامل', 'Cast & crew'),
    media: L('تصاویر و تریلر', 'Images & trailer'),
    story: L('خلاصهٔ داستان', 'Synopsis'),
    links: L('لینک‌های دانلود و پخش', 'Download & stream links'),
    seasons: L('فصل‌ها و قسمت‌ها', 'Seasons & episodes'),
    publish: L('انتشار و دسترسی', 'Publishing & access'),
  }
  const fields: MediaField[] = [
    { section: S.main, key: 'formatId', label: L('نوع', 'Type'), type: 'select', options: formatOptions, table: formatCell, hint: L('انواع تازه (انیمه، مستند…) را در زبانهٔ «انواع» بسازید.', 'Create new types (anime, documentary…) under Types.') },
    { section: S.main, key: 'title', label: L('عنوان فارسی', 'Title'), required: true, table: true },
    { section: S.main, key: 'titleEn', label: L('عنوان انگلیسی', 'English title'), dir: 'ltr' },
    { section: S.main, key: 'originalTitle', label: L('نام اصلی', 'Original title'), dir: 'ltr' },
    { section: S.main, key: 'year', label: L('سال ساخت', 'Year'), type: 'number', table: true },
    { section: S.main, key: 'releaseDate', label: L('تاریخ اکران', 'Release day'), type: 'date', when: isFilm, hint: L('برای تقویم اکران؛ اگر خالی بماند در تقویم نمی‌آید.', 'For the release calendar; empty = not listed.') },
    { section: S.main, key: 'endYear', label: L('سال پایان', 'End year'), type: 'number', when: isSeries },
    { section: S.main, key: 'seriesStatus', label: L('وضعیت پخش', 'Airing status'), type: 'select', when: isSeries, options: [{ value: '', label: '—' }, { value: 'ONGOING', label: L('در حال پخش', 'Ongoing') }, { value: 'ENDED', label: L('پایان یافته', 'Ended') }] },
    { section: S.facts, key: 'imdbRating', label: L('امتیاز IMDb', 'IMDb rating'), type: 'number', table: true },
    { section: S.facts, key: 'imdbId', label: L('شناسه یا لینک IMDb', 'IMDb ID or link'), dir: 'ltr', placeholder: 'tt0111161' },
    { section: S.facts, key: 'runtime', label: L('مدت (دقیقه)', 'Runtime (min)'), type: 'number', hint: L('برای سریال، مدت معمول هر قسمت.', 'For a series, the usual episode length.') },
    { section: S.facts, key: 'ageRating', label: L('رده سنی', 'Age rating'), placeholder: '+13' },
    { section: S.facts, key: 'quality', label: L('بهترین کیفیت', 'Best quality'), placeholder: '1080p BluRay', dir: 'ltr' },
    { section: S.facts, key: 'dubbed', label: L('دوبلهٔ فارسی دارد', 'Persian dub available'), type: 'checkbox', table: true },
    { section: S.facts, key: 'subtitle', label: L('زیرنویس فارسی دارد', 'Persian subtitles'), type: 'checkbox' },
    { section: S.terms, key: 'terms', label: L('دسته‌بندی و زیردسته', 'Categories'), type: 'terms', taxonomy: 'cinema' },
    { section: S.terms, key: 'genres', label: L('ژانرها', 'Genres'), type: 'chips', options: listOptions('GENRE'), hint: L('ژانرها، کشورها و زبان‌ها را در زبانهٔ «فهرست‌ها» مدیریت کنید؛ نام انگلیسی هر مورد، ورود از IMDb را به همان مورد می‌برد.', 'Manage genres, countries and languages under Lists; each entry\'s English name maps IMDb imports to it.') },
    { section: S.terms, key: 'countries', label: L('کشور سازنده', 'Countries'), type: 'chips', options: listOptions('COUNTRY') },
    { section: S.terms, key: 'languages', label: L('زبان', 'Languages'), type: 'chips', options: listOptions('LANGUAGE') },
    { section: S.people, key: 'director', label: L('کارگردان', 'Director'), type: 'people', people: 'line' },
    { section: S.people, key: 'producer', label: L('تهیه‌کننده', 'Producer'), type: 'people', people: 'line' },
    { section: S.people, key: 'cast', label: L('بازیگران', 'Cast'), type: 'people', people: 'cast', hint: L('افراد را از فهرست انتخاب کنید تا صفحهٔ هر نفر و جست‌وجو بر اساس بازیگر، کارگردان و تهیه‌کننده این اثر را پیدا کند. عکس هر نفر را در «بازیگران و کارگردان‌ها» مدیریت کنید.', 'Pick people from the list so their pages and the actor, director and producer filters find this title. Photos are managed under People.') },
    { section: S.media, key: 'poster', label: L('پوستر (عمودی)', 'Poster (portrait)'), type: 'image', table: true },
    { section: S.media, key: 'backdrop', label: L('تصویر پس‌زمینه (افقی، برای اسلایدر)', 'Backdrop (landscape, hero)'), type: 'image' },
    { section: S.media, key: 'trailerUrl', label: L('تریلر (لینک mp4 یا آپارات/یوتیوب)', 'Trailer (mp4 or YouTube/Aparat link)'), dir: 'ltr', wide: true },
    { section: S.story, key: 'summary', label: L('خلاصهٔ داستان', 'Synopsis'), type: 'richtext', wide: true, upload: 'cinema' },
    { section: S.links, key: 'links', label: L('لینک‌های فیلم', 'Film links'), type: 'links', upload: 'cinema', when: isFilm, hint: L('لینک‌ها فقط از مسیر امن سایت باز می‌شوند.', 'Links only open through the protected site endpoint.') },
    { section: S.seasons, key: 'seasons', label: L('فصل‌ها، قسمت‌ها و لینک هر قسمت', 'Seasons, episodes and episode links'), type: 'seasons', when: isSeries },
    { ...access, section: S.publish }, { ...status, section: S.publish }, { ...featured, section: S.publish }, { ...publishedAt, section: S.publish }, { ...slug, section: S.publish },
  ]
  return <CinemaShell><MediaCrud type="cinema-titles" paywall={{ ownerType: 'title', noun: 'این فیلم یا سریال' }} title={L('فیلم و سریال', 'Films & series')} subtitle={L('هر فیلم یا قسمت می‌تواند چند لینک با کیفیت، حجم، دوبله/زیرنویس داشته باشد.', 'Every movie or episode can carry several links with quality, size, dub/subtitle and VIP access.')} fields={fields} publicPath={(row) => (row.status === 'PUBLISHED' ? `/cinema/${row.slug}` : null)} /></CinemaShell>
}
