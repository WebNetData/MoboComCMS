import type { ListDefinition } from '@/modules/vocabulary/domain/vocabulary'

// The film section's managed lists. A title stores genre, country and language names (comma lists, as titles already
// store them). Each entry's English name is also how imports (IMDb, Cinemeta) name it: "Drama" is saved as «درام».

const GENRES: [string, string, string][] = [['درام', 'درام', 'Drama'], ['جنایی', 'جنایی', 'Crime'], ['اکشن', 'اکشن', 'Action'], ['کمدی', 'کمدی', 'Comedy'], ['هیجان‌انگیز', 'هیجان‌انگیز', 'Thriller'], ['علمی تخیلی', 'علمی تخیلی', 'Sci-Fi'], ['عاشقانه', 'عاشقانه', 'Romance'], ['ترسناک', 'ترسناک', 'Horror'], ['انیمیشن', 'انیمیشن', 'Animation'], ['ماجرایی', 'ماجرایی', 'Adventure'], ['فانتزی', 'فانتزی', 'Fantasy'], ['معمایی', 'معمایی', 'Mystery'], ['تاریخی', 'تاریخی', 'History'], ['زندگی‌نامه', 'زندگی‌نامه', 'Biography'], ['جنگی', 'جنگی', 'War'], ['خانوادگی', 'خانوادگی', 'Family'], ['مستند', 'مستند', 'Documentary'], ['موزیکال', 'موزیکال', 'Musical'], ['ورزشی', 'ورزشی', 'Sport'], ['وسترن', 'وسترن', 'Western']]
const COUNTRIES: [string, string, string][] = [['ایران', 'ایران', 'Iran'], ['آمریکا', 'آمریکا', 'United States'], ['انگلیس', 'انگلیس', 'United Kingdom'], ['فرانسه', 'فرانسه', 'France'], ['آلمان', 'آلمان', 'Germany'], ['ایتالیا', 'ایتالیا', 'Italy'], ['اسپانیا', 'اسپانیا', 'Spain'], ['کره جنوبی', 'کره جنوبی', 'South Korea'], ['ژاپن', 'ژاپن', 'Japan'], ['چین', 'چین', 'China'], ['هند', 'هند', 'India'], ['ترکیه', 'ترکیه', 'Turkey'], ['کانادا', 'کانادا', 'Canada'], ['استرالیا', 'استرالیا', 'Australia'], ['روسیه', 'روسیه', 'Russia'], ['مکزیک', 'مکزیک', 'Mexico']]
const LANGUAGES: [string, string, string][] = [['فارسی', 'فارسی', 'Persian'], ['انگلیسی', 'انگلیسی', 'English'], ['فرانسوی', 'فرانسوی', 'French'], ['آلمانی', 'آلمانی', 'German'], ['اسپانیایی', 'اسپانیایی', 'Spanish'], ['ایتالیایی', 'ایتالیایی', 'Italian'], ['کره‌ای', 'کره‌ای', 'Korean'], ['ژاپنی', 'ژاپنی', 'Japanese'], ['چینی', 'چینی', 'Mandarin'], ['هندی', 'هندی', 'Hindi'], ['ترکی', 'ترکی', 'Turkish'], ['عربی', 'عربی', 'Arabic'], ['روسی', 'روسی', 'Russian']]

export const CINEMA_LISTS: ListDefinition[] = [
  { section: 'cinema', list: 'GENRE', title: 'ژانرها', one: 'ژانر', icon: '🎭', codeRule: 'name', example: 'نوآر',
    hint: 'روی هر فیلم و سریال، قفسه‌ها و فیلتر ژانر. نام انگلیسی هر ژانر همان نامی است که ورود از IMDb می‌آورد.', codeHint: 'نامی که روی فیلم ذخیره و در سایت دیده می‌شود (مثلاً درام).', seeds: GENRES },
  { section: 'cinema', list: 'COUNTRY', title: 'کشورها', one: 'کشور', icon: '🌍', codeRule: 'name', example: 'سوئد',
    hint: 'کشور سازندهٔ هر اثر و فیلتر کشور. نام انگلیسی برای تطبیق ورود از IMDb است.', codeHint: 'نام کشور که روی فیلم ذخیره می‌شود (مثلاً ایران).', seeds: COUNTRIES },
  { section: 'cinema', list: 'LANGUAGE', title: 'زبان‌ها', one: 'زبان', icon: '🗣️', codeRule: 'name', example: 'سوئدی',
    hint: 'زبان هر اثر در مشخصات صفحه. نام انگلیسی برای تطبیق ورود از IMDb است.', codeHint: 'نام زبان که روی فیلم ذخیره می‌شود (مثلاً فارسی).', seeds: LANGUAGES },
]
