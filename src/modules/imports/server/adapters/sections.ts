import type { FieldDef } from '@/modules/imports/domain/types'
import { LINK_HINT, mediaAdapter, STATUS_ENUM } from '@/modules/imports/server/adapters/media'

/**
 * Films, series, games and software: the fields each section's real model
 * has (CinemaTitle, CinemaSeason/CinemaEpisode, GameTitle, SoftwareTitle).
 * Fields a source may have but these models do not (writers, producers,
 * studio, architecture…) are deliberately not offered.
 */

const common = (section: string): FieldDef[] => [
  { key: 'externalId', label: 'شناسهٔ خارجی', type: 'text', group: 'meta', updatable: false, synonyms: ['id', 'external_id', 'source_id', 'provider_id', 'tmdb_id', 'شناسه'] },
  { key: 'title', label: 'عنوان', type: 'text', group: 'main', requiredOnCreate: true, updateByDefault: false, synonyms: ['title', 'name', 'عنوان', 'نام', `${section}_title`] },
  { key: 'titleEn', label: 'عنوان انگلیسی', type: 'text', group: 'main', synonyms: ['title_en', 'english_title', 'name_en', 'عنوان انگلیسی'] },
  { key: 'slug', label: 'نامک (slug)', type: 'slug', group: 'main', updatable: false, synonyms: ['slug', 'url_key', 'permalink'] },
]
const tail: FieldDef[] = [
  { key: 'categories', label: 'دسته‌های بخش', type: 'category', group: 'relations', synonyms: ['category', 'categories', 'category_path', 'دسته', 'دسته‌بندی'] },
  { key: 'links', label: 'لینک‌های دانلود', type: 'json', group: 'relations', synonyms: ['links', 'download_links', 'downloads', 'download_url', 'download', 'لینک', 'لینک دانلود'], hint: LINK_HINT },
  { key: 'status', label: 'وضعیت انتشار', type: 'enum', group: 'meta', enum: STATUS_ENUM, synonyms: ['status', 'published', 'وضعیت'] },
  { key: 'featured', label: 'ویژه', type: 'bool', group: 'meta', synonyms: ['featured', 'ویژه'] },
  { key: 'publishedAt', label: 'تاریخ انتشار در سایت', type: 'date', group: 'meta', synonyms: ['published_at', 'publish_date', 'date', 'تاریخ انتشار'] },
]

const cinemaFields = (series: boolean): FieldDef[] => [
  ...common(series ? 'series' : 'movie'),
  { key: 'originalTitle', label: 'عنوان اصلی', type: 'text', group: 'main', synonyms: ['original_title', 'originaltitle', 'original_name', 'عنوان اصلی'] },
  { key: 'imdbId', label: 'شناسهٔ IMDb', type: 'text', group: 'meta', updatable: false, synonyms: ['imdb_id', 'imdbid', 'imdb', 'tt'] },
  { key: 'summary', label: 'خلاصه / توضیحات', type: 'html', group: 'content', synonyms: ['summary', 'description', 'overview', 'plot', 'synopsis', 'خلاصه', 'داستان'] },
  { key: 'summaryEn', label: 'خلاصهٔ انگلیسی', type: 'longtext', group: 'content', synonyms: ['summary_en', 'overview_en', 'plot_en'] },
  { key: 'poster', label: 'پوستر', type: 'image', group: 'media', synonyms: ['poster', 'poster_url', 'poster_path', 'cover', 'image', 'پوستر'] },
  { key: 'backdrop', label: 'تصویر پس‌زمینه', type: 'image', group: 'media', synonyms: ['backdrop', 'backdrop_url', 'backdrop_path', 'fanart', 'background', 'بک‌دراپ'] },
  { key: 'year', label: 'سال ساخت', type: 'int', group: 'main', synonyms: ['year', 'release_year', 'سال', 'سال ساخت'] },
  ...(series ? [{ key: 'endYear', label: 'سال پایان', type: 'int', group: 'main', synonyms: ['end_year', 'last_year'] } as FieldDef, { key: 'seriesStatus', label: 'وضعیت پخش', type: 'enum', group: 'main', enum: [{ value: 'ONGOING', label: 'در حال پخش' }, { value: 'ENDED', label: 'پایان‌یافته' }], synonyms: ['series_status', 'airing_status', 'status_series'] } as FieldDef] : []),
  { key: 'runtime', label: 'مدت (دقیقه)', type: 'int', group: 'main', synonyms: ['runtime', 'duration', 'length', 'مدت'] },
  { key: 'ageRating', label: 'رده‌بندی سنی', type: 'text', group: 'main', synonyms: ['age_rating', 'rating_mpaa', 'certification', 'mpaa', 'رده سنی'] },
  { key: 'genres', label: 'ژانرها', type: 'list', group: 'relations', synonyms: ['genres', 'genre', 'ژانر'] },
  { key: 'countries', label: 'کشورها', type: 'list', group: 'relations', synonyms: ['countries', 'country', 'production_countries', 'کشور'] },
  { key: 'languages', label: 'زبان‌ها', type: 'list', group: 'relations', synonyms: ['languages', 'language', 'spoken_languages', 'زبان'] },
  { key: 'director', label: 'کارگردان', type: 'text', group: 'relations', synonyms: ['director', 'directors', 'کارگردان'] },
  { key: 'cast', label: 'بازیگران', type: 'json', group: 'relations', synonyms: ['cast', 'actors', 'stars', 'بازیگران'], hint: 'فهرست نام‌ها یا [{name, role, image}]' },
  { key: 'imdbRating', label: 'امتیاز IMDb', type: 'number', group: 'meta', synonyms: ['imdb_rating', 'rating', 'vote_average', 'امتیاز'] },
  { key: 'trailerUrl', label: 'تریلر', type: 'url', group: 'media', synonyms: ['trailer', 'trailer_url', 'تریلر'] },
  { key: 'quality', label: 'کیفیت', type: 'text', group: 'main', synonyms: ['quality', 'کیفیت'] },
  { key: 'dubbed', label: 'دوبله فارسی', type: 'bool', group: 'main', synonyms: ['dubbed', 'dub', 'دوبله'] },
  { key: 'subtitle', label: 'زیرنویس فارسی', type: 'bool', group: 'main', synonyms: ['subtitle', 'subbed', 'زیرنویس'] },
  ...tail,
  ...(series ? [{ key: 'episodes', label: 'فصل‌ها و قسمت‌ها', type: 'json', group: 'relations', implicit: true } as FieldDef] : []),
]

export const moviesImporter = mediaAdapter({
  id: 'movies', label: 'فیلم', description: 'فیلم‌های سینمایی با پوستر، ژانر، بازیگران، امتیاز IMDb، دسته‌ها و لینک‌های دانلود', entity: 'فیلم', module: 'cinema',
  resource: 'cinema-titles', model: 'cinemaTitle', taxonomy: 'cinema', linkOwner: 'title', naturalKey: 'imdbId', fixed: { kind: 'MOVIE' }, slugPrefix: 'movie',
  fields: cinemaFields(false),
})

export const seriesImporter = mediaAdapter({
  id: 'series', label: 'سریال', description: 'سریال‌ها با فصل‌ها و قسمت‌ها (تو در تو یا ردیف به ازای هر قسمت)؛ فصل و قسمت تکراری ساخته نمی‌شود', entity: 'سریال', module: 'cinema',
  resource: 'cinema-titles', model: 'cinemaTitle', taxonomy: 'cinema', linkOwner: 'title', naturalKey: 'imdbId', fixed: { kind: 'SERIES' }, slugPrefix: 'series', episodes: true,
  fields: cinemaFields(true),
})

export const gamesImporter = mediaAdapter({
  id: 'games', label: 'بازی', description: 'بازی‌ها با کاور، اسکرین‌شات، پلتفرم، سازنده، ناشر، سیستم مورد نیاز، دسته‌ها و لینک‌ها', entity: 'بازی', module: 'games',
  resource: 'games', model: 'gameTitle', taxonomy: 'games', linkOwner: 'game', slugPrefix: 'game',
  fields: [
    ...common('game'),
    { key: 'summary', label: 'خلاصه', type: 'longtext', group: 'content', synonyms: ['summary', 'short_description', 'excerpt', 'خلاصه'] },
    { key: 'content', label: 'متن کامل', type: 'html', group: 'content', synonyms: ['content', 'description', 'description_html', 'body', 'توضیحات'] },
    { key: 'cover', label: 'کاور', type: 'image', group: 'media', synonyms: ['cover', 'cover_url', 'poster', 'image', 'thumbnail', 'کاور'] },
    { key: 'backdrop', label: 'تصویر پس‌زمینه', type: 'image', group: 'media', synonyms: ['backdrop', 'background', 'hero', 'banner'] },
    { key: 'screenshots', label: 'اسکرین‌شات‌ها', type: 'images', group: 'media', synonyms: ['screenshots', 'gallery', 'images', 'اسکرین شات'] },
    { key: 'platforms', label: 'پلتفرم‌ها', type: 'list', group: 'relations', synonyms: ['platforms', 'platform', 'پلتفرم'] },
    { key: 'genres', label: 'ژانرها', type: 'list', group: 'relations', synonyms: ['genres', 'genre', 'ژانر'] },
    { key: 'developer', label: 'سازنده', type: 'text', group: 'relations', synonyms: ['developer', 'developers', 'studio', 'سازنده'] },
    { key: 'publisher', label: 'ناشر', type: 'text', group: 'relations', synonyms: ['publisher', 'publishers', 'ناشر'] },
    { key: 'releaseDate', label: 'تاریخ انتشار بازی', type: 'date', group: 'main', synonyms: ['release_date', 'released', 'first_release_date', 'تاریخ عرضه'] },
    { key: 'version', label: 'نسخه', type: 'text', group: 'main', synonyms: ['version', 'build', 'نسخه'] },
    { key: 'gameSize', label: 'حجم', type: 'text', group: 'main', synonyms: ['size', 'game_size', 'file_size', 'حجم'] },
    { key: 'engine', label: 'موتور بازی', type: 'text', group: 'main', synonyms: ['engine', 'game_engine'] },
    { key: 'requirements', label: 'سیستم مورد نیاز', type: 'json', group: 'content', synonyms: ['requirements', 'system_requirements', 'سیستم مورد نیاز'], hint: '{min: {...}, rec: {...}}' },
    { key: 'score', label: 'امتیاز منتقدان (۰ تا ۱۰۰)', type: 'int', group: 'meta', synonyms: ['score', 'metascore', 'critic_score'] },
    { key: 'userScore', label: 'امتیاز کاربران (۰ تا ۱۰)', type: 'number', group: 'meta', synonyms: ['user_score', 'user_rating'] },
    { key: 'ageRating', label: 'رده‌بندی سنی', type: 'text', group: 'main', synonyms: ['age_rating', 'esrb', 'pegi'] },
    { key: 'trailerUrl', label: 'تریلر', type: 'url', group: 'media', synonyms: ['trailer', 'trailer_url'] },
    { key: 'seoTitle', label: 'عنوان سئو', type: 'text', group: 'seo', synonyms: ['seo_title', 'meta_title'] },
    { key: 'seoDescription', label: 'توضیح سئو', type: 'longtext', group: 'seo', synonyms: ['seo_description', 'meta_description'] },
    ...tail,
  ],
})

export const softwareImporter = mediaAdapter({
  id: 'software', label: 'نرم‌افزار', description: 'نرم‌افزارها با نسخه، سازنده، مجوز، سیستم‌عامل، تغییرات نسخه، آیکون، اسکرین‌شات، دسته‌ها و لینک‌ها', entity: 'نرم‌افزار', module: 'software',
  resource: 'software', model: 'softwareTitle', taxonomy: 'software', linkOwner: 'software', slugPrefix: 'app',
  fields: [
    ...common('software'),
    { key: 'version', label: 'نسخه', type: 'text', group: 'main', synonyms: ['version', 'latest_version', 'نسخه'] },
    { key: 'developer', label: 'سازنده', type: 'text', group: 'relations', synonyms: ['developer', 'publisher', 'author', 'vendor', 'سازنده'] },
    { key: 'license', label: 'نوع مجوز', type: 'enum', group: 'main', enum: [{ value: 'FREE', label: 'رایگان' }, { value: 'FREEMIUM', label: 'فریمیوم' }, { value: 'TRIAL', label: 'آزمایشی' }, { value: 'PAID', label: 'پولی' }, { value: 'OPEN_SOURCE', label: 'متن‌باز' }], synonyms: ['license', 'licence', 'license_type', 'مجوز'] },
    { key: 'platforms', label: 'سیستم‌عامل / پلتفرم', type: 'list', group: 'relations', synonyms: ['platforms', 'platform', 'os', 'operating_system', 'سیستم عامل'] },
    { key: 'size', label: 'حجم', type: 'text', group: 'main', synonyms: ['size', 'file_size', 'حجم'] },
    { key: 'website', label: 'وب‌سایت سازنده', type: 'url', group: 'main', synonyms: ['website', 'homepage', 'url', 'سایت'] },
    { key: 'requirements', label: 'سیستم مورد نیاز', type: 'longtext', group: 'content', synonyms: ['requirements', 'system_requirements', 'سیستم مورد نیاز'] },
    { key: 'icon', label: 'آیکون', type: 'image', group: 'media', synonyms: ['icon', 'logo', 'icon_url', 'آیکون'] },
    { key: 'cover', label: 'کاور', type: 'image', group: 'media', synonyms: ['cover', 'image', 'banner', 'کاور'] },
    { key: 'screenshots', label: 'اسکرین‌شات‌ها', type: 'images', group: 'media', synonyms: ['screenshots', 'gallery', 'images', 'اسکرین شات'] },
    { key: 'summary', label: 'خلاصه', type: 'longtext', group: 'content', synonyms: ['summary', 'short_description', 'excerpt', 'خلاصه'] },
    { key: 'content', label: 'توضیحات کامل', type: 'html', group: 'content', synonyms: ['content', 'description', 'description_html', 'body', 'توضیحات'] },
    { key: 'changelog', label: 'تغییرات نسخه', type: 'html', group: 'content', synonyms: ['changelog', 'release_notes', 'whats_new', 'تغییرات'] },
    { key: 'features', label: 'ویژگی‌ها', type: 'html', group: 'content', synonyms: ['features', 'ویژگی ها'] },
    { key: 'installGuide', label: 'راهنمای نصب', type: 'html', group: 'content', synonyms: ['install_guide', 'installation', 'راهنمای نصب'] },
    { key: 'releasedAt', label: 'تاریخ انتشار نسخه', type: 'date', group: 'main', synonyms: ['released_at', 'release_date', 'updated', 'تاریخ انتشار نسخه'] },
    ...tail,
  ],
})
