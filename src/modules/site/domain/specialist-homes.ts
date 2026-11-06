import type { BundledTemplate } from './builder-templates'
import { col, doc, fx, items, sec, w } from './builder-template-kit'

type SpecialistHome = BundledTemplate & { module: string }
const reveal = { motion: 'up' } as const
const title = (text: string, sub: string) => [w('heading', { level: 'h2', text }), w('text', { html: `<p>${sub}</p>` })]
const intro = (eyebrow: string, heading: string, text: string, label: string, href: string, surface: 'grid' | 'aurora' | 'mesh' | 'dots') =>
  fx(sec([col([fx(w('hero', { eyebrow, title: heading, text, label, href, secondaryLabel: 'تازه‌ترین‌ها', secondaryHref: '#latest' }), reveal)])], { tone: 'dark', paddingY: 96 }), { surface, minHeight: 440 })
const links = (rows: [string, string, string, string][]) => sec(rows.map(([icon, heading, text, href]) => col([fx(w('icon-box', { icon, title: heading, text, href, layout: 'side' }), { hover: 'lift', motion: 'up', surface: 'glass', radius: { t: 20, r: 20, b: 20, l: 20 }, padding: { t: 24, r: 24, b: 24, l: 24 } })], 100 / rows.length)), { paddingY: 40 })
const media = (source: string, heading: string, limit = '8') => fx(w('media', { source, title: heading, limit }), reveal)
const shelf = (source: string, heading: string, limit = '8') => sec([col([media(source, heading, limit)])], { paddingY: 48 })
const latest = (section: ReturnType<typeof sec>) => ({ ...section, anchor: 'latest' })
const cta = (heading: string, text: string, label: string, href: string) => fx(sec([col([w('cta', { title: heading, text, label, href })])], { tone: 'accent', paddingY: 64 }), { surface: 'grid', motion: 'fade' })

/** Real, editable compositions. Data comes from existing public owners; no demo products, prices or testimonials. */
export const SPECIALIST_HOMES: SpecialistHome[] = [
  { id: 'home-hosting', module: 'hosting', fa: 'خانهٔ زیرساخت و میزبانی', en: 'Hosting and infrastructure home', descFa: 'ورودی چهار خانوادهٔ خدمات، پلن‌های واقعی، مسیر انتخاب سرویس و دامنه؛ شبکهٔ ظریف و کارت‌های شیشه‌ای.', descEn: 'Service families, real plans and domains.', doc: doc([
    intro('میزبانی · سرور · دامنه', 'زیرساخت سایت شما، در یک داشبورد', 'از انتخاب میزبانی تا مدیریت سرویس و دامنه، مسیرتان را از اینجا شروع کنید.', 'انتخاب سرویس', '/hosting', 'grid'),
    links([['layers', 'میزبانی وب', 'پلن‌ها و امکانات میزبانی را کنار هم بررسی کنید.', '/hosting'], ['code', 'سرور', 'سرور مجازی، اختصاصی و گزینه‌های ابری.', '/servers'], ['globe', 'دامنه', 'نام اینترنتی مناسب کسب‌وکارتان را جست‌وجو کنید.', '/domains'], ['user', 'سرویس‌های من', 'پیگیری، تمدید و مدیریت از حساب خودتان.', '/dashboard/hosting']]),
    latest(sec([col([...title('پلن‌های قابل سفارش', 'قیمت و امکانات از کاتالوگ فعال سایت خوانده می‌شوند.'), w('hosting', { title: 'میزبانی و سرور', group: 'all' })])], { paddingY: 64 })),
    fx(sec([col([w('steps', { layout: 'row', items: items([{ title: 'سرویس مناسب را انتخاب کنید', text: 'منابع، دوره و امکانات هر پلن را بررسی کنید.', icon: 'layers' }, { title: 'سفارش را بررسی کنید', text: 'مشخصات و مبلغ نهایی را در فرایند سفارش ببینید.', icon: 'check' }, { title: 'از حساب خودتان پیگیری کنید', text: 'وضعیت آماده‌سازی، تمدید و پشتیبانی کنار سرویس است.', icon: 'user' }]) })])], { paddingY: 64 }), { surface: 'dots' }),
    cta('نام بعدی شما در اینترنت', 'برای شروع یک پروژهٔ تازه، نام و پسوند دامنه را بررسی کنید.', 'جست‌وجوی دامنه', '/domains'),
  ]) },
  { id: 'home-journal', module: 'journal', fa: 'خانهٔ مجله و خبر', en: 'Editorial news home', descFa: 'سربرگ تحریریه با ترکیب نامتقارن، شبکهٔ خبر زنده و مسیر آرشیو؛ خوانایی و فاصله‌های تحریریه‌ای.', descEn: 'Editorial masthead, live news grid and archive.', doc: doc([
    fx(sec([col([w('hero', { eyebrow: 'خبر · گزارش · دیدگاه', title: 'روایت روشن‌تری از آنچه می‌گذرد', text: 'تازه‌ترین نوشته‌ها، گزارش‌ها و راهنماهای این مجله را در یک نگاه دنبال کنید.', label: 'ورود به آرشیو', href: '/blog', secondaryLabel: 'آخرین نوشته‌ها', secondaryHref: '#latest' })], 65), col([fx(w('icon-box', { icon: 'book', title: 'برای خواندن، برای فکرکردن', text: 'از خبرهای کوتاه تا گزارش‌ها و یادداشت‌های مفصل؛ نوشتهٔ بعدی‌تان را پیدا کنید.', href: '/blog' }), { surface: 'glass', padding: { t: 40, r: 32, b: 40, l: 32 }, motion: 'fade' })], 35)], { paddingY: 80, tone: 'dark' }), { surface: 'dots' }),
    latest(sec([col([...title('تازه از تحریریه', 'آخرین مطالب منتشرشده؛ آرشیو همیشه در دسترس است.'), w('posts', { title: '', limit: '12', category: '' })])], { paddingY: 64 })),
    links([['book', 'همهٔ مطالب', 'خبرها و نوشته‌های منتشرشده را مرور کنید.', '/blog'], ['heart', 'برای بعد نگه دارید', 'نوشته‌های موردعلاقه را از حساب خودتان دنبال کنید.', '/favorites'], ['user', 'حساب خواننده', 'پیگیری و مدیریت حساب در یک مکان.', '/dashboard']]),
    cta('از تیترها جلوتر بروید', 'برای یافتن موضوع بعدی، در آرشیو مجله بگردید.', 'مرور مجله', '/blog'),
  ]) },
  { id: 'home-store', module: 'store', fa: 'خانهٔ فروشگاه', en: 'Commerce home', descFa: 'ویترین محصول زنده، ورودی خرید و پیگیری سفارش؛ ترکیب روشن، کارت‌های شناور و دعوت خرید.', descEn: 'Live product storefront and order navigation.', doc: doc([
    intro('انتخاب · مقایسه · خرید', 'ویترینی برای انتخاب‌های شما', 'محصولات، مشخصات و قیمت‌های جاری را ببینید و با آگاهی انتخاب کنید.', 'مشاهدهٔ فروشگاه', '/products', 'mesh'),
    links([['bag', 'کاتالوگ فروشگاه', 'مشخصات و قیمت هر محصول را ببینید.', '/products'], ['cart', 'سبد خرید', 'انتخاب‌ها و مبلغ سفارش را پیش از پرداخت بررسی کنید.', '/cart'], ['box', 'پیگیری سفارش', 'وضعیت سفارش‌های خودتان را دنبال کنید.', '/dashboard/orders']]),
    latest(sec([col([...title('ویترین امروز', 'محصولات فعال و قیمت‌های ثبت‌شدهٔ فروشگاه.'), fx(w('products', { title: '', limit: '12', category: '', kind: '' }), reveal)])], { paddingY: 64 })),
    cta('انتخاب بعدی در انتظار شماست', 'برای جست‌وجو، فیلتر و مقایسه به فروشگاه بروید.', 'مرور همهٔ محصولات', '/products'),
  ]) },
  { id: 'home-music', module: 'music', fa: 'خانهٔ موزیک', en: 'Music discovery home', descFa: 'فضای شنیداری با هیروی شفق، آهنگ‌های تازه با پخش واقعی، ریل آلبوم‌ها و جدول محبوب‌ها.', descEn: 'New tracks, playable music, albums and charts.', doc: doc([
    intro('تازه بشنوید', 'صدایی برای لحظهٔ بعدی شما', 'آهنگ‌های تازه، آلبوم‌ها و قطعه‌های پرشنونده را کشف کنید.', 'کشف موزیک', '/music', 'aurora'),
    latest(shelf('music-new', 'تازه منتشرشده', '12')),
    fx(shelf('music-albums', 'یک آلبوم، یک جهان', '8'), { surface: 'dots' }),
    shelf('music-top', 'بیشتر شنیده‌شده‌ها', '8'),
    links([['music', 'همهٔ موزیک‌ها', 'آرشیو و هنرمندان را دنبال کنید.', '/music'], ['heart', 'منتخب‌های شما', 'از حساب خودتان به علاقه‌مندی‌ها برگردید.', '/favorites'], ['user', 'حساب شنونده', 'یک حساب برای همهٔ تجربه‌های شما.', '/dashboard']]),
  ]) },
  { id: 'home-cinema', module: 'cinema', fa: 'خانهٔ فیلم و سریال', en: 'Cinema and series home', descFa: 'سربرگ سینمایی تیره، ریل پوستر فیلم و سریال به‌صورت مجزا و آثار دارای امتیاز؛ نمایش از کاتالوگ واقعی.', descEn: 'Cinematic masthead, movies, series and rated titles.', doc: doc([
    intro('فیلم · سریال · داستان', 'امشب، داستان دیگری را شروع کنید', 'تازه‌های فیلم و سریال را با پوستر، مشخصات و امتیازهای ثبت‌شده مرور کنید.', 'ورود به سینما', '/cinema', 'mesh'),
    latest(shelf('cinema-movies', 'روی پردهٔ خانهٔ شما', '12')),
    fx(shelf('cinema-series', 'داستان ادامه دارد', '12'), { surface: 'grid' }),
    shelf('cinema-top', 'آثار دارای امتیاز', '8'),
    cta('چیزی برای تماشا پیدا کنید', 'فیلم و سریال مناسب سلیقه‌تان را در کاتالوگ جست‌وجو کنید.', 'کاتالوگ فیلم و سریال', '/cinema'),
  ]) },
  { id: 'home-software', module: 'software', fa: 'خانهٔ دانلود نرم‌افزار', en: 'Software downloads home', descFa: 'مسیر کشف ابزار، نرم‌افزارهای تازه و محبوب با اطلاعات نسخه و پلتفرم؛ شبکهٔ فنی و چیدمان فشرده.', descEn: 'Software discovery, current versions and popular apps.', doc: doc([
    intro('ابزار مناسب، کار ساده‌تر', 'ابزار بعدی کارتان را پیدا کنید', 'نرم‌افزارها را با اطلاعات نسخه، پلتفرم و مجوز ثبت‌شده بررسی کنید؛ فایل‌ها در صفحهٔ هر نرم‌افزار هستند.', 'مرور نرم‌افزارها', '/software', 'grid'),
    links([['devices', 'انتخاب پلتفرم', 'از فیلترهای آرشیو برای دستگاه خودتان استفاده کنید.', '/software'], ['code', 'مشخصات نسخه', 'نسخه‌ها، تغییرات و روش دریافت را در صفحهٔ هر ابزار بخوانید.', '/software'], ['heart', 'ابزارهای منتخب', 'علاقه‌مندی‌هایتان را در حساب خود نگه دارید.', '/favorites']]),
    latest(shelf('software-new', 'تازه‌های نرم‌افزار', '12')),
    shelf('software-top', 'بیشتر دریافت‌شده‌ها', '8'),
    cta('یک ابزار برای مسئلهٔ بعدی', 'آرشیو را بر اساس نیاز و پلتفرم خودتان مرور کنید.', 'رفتن به مرکز دانلود', '/software'),
  ]) },
  { id: 'home-games', module: 'games', fa: 'خانهٔ بازی', en: 'Games discovery home', descFa: 'ورودی کشف بازی با مش نوری، کارت‌های عریض تازه‌ها و رتبه‌بندی واقعی؛ دسترسی مستقیم به کاتالوگ.', descEn: 'Game discovery, new releases and rated games.', doc: doc([
    intro('یک جهان تازه پیش روی شماست', 'بازی بعدی‌تان را پیدا کنید', 'تازه‌ها، پلتفرم‌ها و امتیازهای ثبت‌شده را کنار هم ببینید و انتخاب کنید.', 'کاتالوگ بازی', '/games', 'aurora'),
    latest(shelf('games-new', 'تازه به آرشیو رسیده', '12')),
    fx(shelf('games-top', 'بازی‌های دارای امتیاز', '8'), { surface: 'grid' }),
    links([['gamepad', 'همهٔ بازی‌ها', 'برای دیدن مشخصات، تصاویر و فایل‌ها وارد کاتالوگ شوید.', '/games'], ['heart', 'لیست علاقه‌مندی', 'بازی‌های انتخابی خودتان را نگه دارید.', '/favorites'], ['user', 'حساب بازیکن', 'مدیریت حساب و پیگیری دسترسی‌ها.', '/dashboard']]),
    cta('جهان بعدی را انتخاب کنید', 'آرشیو بازی‌ها را بر اساس سلیقه و پلتفرم خودتان بگردید.', 'کشف بازی‌ها', '/games'),
  ]) },
]
