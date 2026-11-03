import type { BundledTemplate } from './builder-templates'
import { center, col, doc, fx, items, sec, w } from './builder-template-kit'

// Landing pages and showcase sections that use the builder's effects: surfaces (aurora, glass, mesh, grid,
// dots, beam), heading effects, hovers, entrances and loops. Every part is an ordinary block the owner edits;
// prices, dates and links are placeholders to replace before publishing.

const up = { motion: 'up' } as const
const card = { radius: { t: 20, r: 20, b: 20, l: 20 }, padding: { t: 26, r: 24, b: 26, l: 24 } }

const heroAurora = (eyebrow: string, title: string, text: string, label: string, href: string, second: string, secondHref: string) =>
  fx(sec([col([fx(w('hero', { eyebrow, title, text, label, href, secondaryLabel: second, secondaryHref: secondHref }), { textFx: 'gradient', motion: 'blur' })])], { tone: 'dark', paddingY: 110 }), { surface: 'aurora', minHeight: 560 })

const featureRow = (rows: { icon: string; title: string; text: string }[], hover: 'tilt' | 'shine' | 'ring' | 'float' = 'tilt') =>
  sec(rows.map((row) => col([fx(w('icon-box', { icon: row.icon, title: row.title, text: row.text }), { ...card, surface: 'glass', hover, ...up })], Math.round(100 / rows.length))), { paddingY: 56 })

const title = (text: string, sub = '') => [fx(w('heading', { level: 'h2', text }, center), { textFx: 'gradient', motion: 'up' }), ...(sub ? [w('text', { html: `<p>${sub}</p>` }, center)] : [])]

const closing = (heading: string, text: string, label: string, href: string) =>
  fx(sec([col([w('cta', { title: heading, text, label, href })])], { tone: 'dark', paddingY: 72 }), { bg: '#4f46e5', bg2: '#06b6d4', bgAngle: 120, loop: 'gradient' })

export const LANDING_PAGE_TEMPLATES: BundledTemplate[] = [
  {
    id: 'page-saas', fa: 'لندینگ نرم‌افزار و اپلیکیشن', en: 'Software and app landing',
    descFa: 'سربرگ با شفق متحرک، آمار شیشه‌ای، ویژگی‌ها با کج‌شدن سه‌بعدی، مراحل، تعرفه‌ها، نظر مشتریان، پرسش‌ها و دعوت پایانی با گرادیان متحرک',
    descEn: 'Aurora header, glass figures, 3D-tilt features, steps, pricing, reviews, questions and a moving-gradient call',
    doc: doc([
      heroAurora('نسخهٔ تازه منتشر شد', 'کار تیم‌تان را ساده، سریع و دقیق کنید', 'همهٔ کارها، گزارش‌ها و گفت‌وگوها در یک جا؛ بدون نصب، روی هر دستگاه.', 'شروع رایگان', '/register', 'دیدن امکانات', '#features'),
      sec([col([fx(w('counters', { items: items([{ value: '12000', suffix: '+', label: 'کاربر فعال' }, { value: '99', suffix: '٪', label: 'زمان دسترس‌پذیری' }, { value: '4', suffix: 'x', label: 'سرعت بیشتر' }, { value: '24', suffix: '/7', label: 'پشتیبانی' }]) }), { ...card, surface: 'glass', motion: 'up' })])], { paddingY: 40 }),
      { ...sec([col(title('هر آنچه برای رشد لازم دارید', 'ابزارهایی که با هم کار می‌کنند و از روز اول آماده‌اند.'))], { paddingY: 48 }), anchor: 'features' },
      featureRow([{ icon: 'bolt', title: 'سریع و سبک', text: 'صفحه‌ها در یک چشم به هم زدن باز می‌شوند، حتی با اینترنت کند.' }, { icon: 'shield', title: 'امن از پایه', text: 'رمزگذاری، ورود دومرحله‌ای و نسخهٔ پشتیبان خودکار.' }, { icon: 'chart', title: 'گزارش‌های زنده', text: 'هر عدد مهم را لحظه‌ای ببینید و تصمیم بگیرید.' }]),
      featureRow([{ icon: 'users', title: 'کار گروهی', text: 'تقسیم کار، یادداشت و اعلان برای همهٔ اعضای تیم.' }, { icon: 'devices', title: 'روی هر دستگاه', text: 'موبایل، تبلت و دسکتاپ با یک حساب و همگام.' }, { icon: 'lifebuoy', title: 'پشتیبانی واقعی', text: 'پاسخ انسان، نه ربات؛ در ساعت‌های کاری و بیرون از آن.' }]),
      fx(sec([col([...title('در سه قدم شروع کنید'), fx(w('list', { items: items([{ icon: '۱', title: 'ثبت‌نام کنید', text: 'با شمارهٔ موبایل یا ایمیل، در کمتر از یک دقیقه.' }, { icon: '۲', title: 'تیم را دعوت کنید', text: 'با یک لینک همه را به فضای کارتان بیاورید.' }, { icon: '۳', title: 'کار را شروع کنید', text: 'قالب‌های آماده را انتخاب کنید یا از صفر بسازید.' }]) }), up)])], { paddingY: 64 }), { surface: 'dots' }),
      sec([col([...title('تعرفه‌ای که با شما بزرگ می‌شود'), fx(w('pricing', { items: items([{ title: 'شروع', price: 'رایگان', period: '', features: 'تا ۳ کاربر\nامکانات پایه\nپشتیبانی تیکتی', label: 'شروع رایگان', href: '/register', featured: '' }, { title: 'حرفه‌ای', price: '۴۹۰٬۰۰۰ تومان', period: 'ماهانه', features: 'کاربر نامحدود\nگزارش‌های پیشرفته\nپشتیبانی سریع', label: 'انتخاب پلن', href: '/register', featured: '1' }, { title: 'سازمانی', price: 'تماس بگیرید', period: '', features: 'میزبانی اختصاصی\nقرارداد سطح خدمت\nمدیر حساب', label: 'گفت‌وگو با فروش', href: '/contact', featured: '' }]) }), { hover: 'float', motion: 'up' })])], { tone: 'light', paddingY: 72 }),
      sec([col([fx(w('testimonials', { title: 'آن‌ها که از آن استفاده می‌کنند', items: items([{ quote: 'از وقتی تیم ما به این ابزار آمد، جلسه‌ها نصف شد و کارها زودتر تمام می‌شود.', name: 'نیلوفر', role: 'مدیر محصول', avatar: '' }, { quote: 'گزارش‌های لحظه‌ای کمک کرد تصمیم‌های فروش را با عدد بگیریم، نه با حدس.', name: 'آرش', role: 'مدیر فروش', avatar: '' }, { quote: 'پشتیبانی سریع و دقیق بود؛ همه‌چیز در یک روز راه افتاد.', name: 'مریم', role: 'بنیان‌گذار', avatar: '' }]) }), { motion: 'fade' })])], { paddingY: 72 }),
      sec([col([w('faq', { title: 'پرسش‌های پرتکرار', items: items([{ q: 'آیا نسخهٔ رایگان محدودیت زمانی دارد؟', a: 'خیر. پلن شروع همیشه رایگان است و هر وقت خواستید ارتقا می‌دهید.' }, { q: 'اطلاعات ما کجا نگهداری می‌شود؟', a: 'روی سرورهای امن با نسخهٔ پشتیبان روزانه؛ اطلاعات شما فقط در اختیار خودتان است.' }, { q: 'می‌توانم پلن را عوض کنم؟', a: 'بله، هر زمان و بدون از دست رفتن اطلاعات.' }]) })])], { paddingY: 64, width: 'narrow' }),
      closing('همین امروز رایگان شروع کنید', 'بدون کارت بانکی و بدون تعهد؛ در یک دقیقه آماده‌اید.', 'ساخت حساب رایگان', '/register'),
    ]),
  },
  {
    id: 'page-launch', fa: 'معرفی محصول با شمارش معکوس', en: 'Product launch with a countdown',
    descFa: 'سربرگ روی مش نورها، شمارش معکوس شیشه‌ای، ویژگی‌ها با حلقهٔ نوری، نظرها و دعوت پایانی با نور چرخان دور لبه',
    descEn: 'Mesh-light header, glass countdown, ring-hover features, reviews and a beam-edged call',
    doc: doc([
      fx(sec([col([fx(w('hero', { eyebrow: 'به‌زودی رونمایی می‌شود', title: 'نسل تازه، از همهٔ قبلی‌ها جلوتر', text: 'طراحی تازه، باتری بیشتر و قیمتی که انتظارش را ندارید. اولین نفری باشید که خبردار می‌شوید.', label: 'خبرم کن', href: '#notify', secondaryLabel: 'مشخصات', secondaryHref: '#features' }), { textFx: 'shimmer', motion: 'pop' })])], { tone: 'dark', paddingY: 110 }), { surface: 'mesh', minHeight: 540 }),
      sec([col([fx(w('countdown', { until: '', title: 'تا رونمایی', done: 'رونمایی شد!' }), { ...card, surface: 'glass', loop: 'breathe', motion: 'zoom' })])], { paddingY: 48, width: 'narrow' }),
      { ...sec([col(title('چرا منتظرش بمانید؟'))], { paddingY: 40 }), anchor: 'features' },
      featureRow([{ icon: 'bolt', title: 'دو برابر سریع‌تر', text: 'پردازندهٔ تازه کارهای سنگین را بی‌وقفه انجام می‌دهد.' }, { icon: 'clock', title: 'باتری دو روزه', text: 'یک شارژ برای دو روز کار و سرگرمی.' }, { icon: 'image', title: 'دوربین حرفه‌ای', text: 'عکس‌های شب روشن‌تر و ویدیوهای بی‌لرزش.' }], 'ring'),
      sec([col([fx(w('testimonials', { title: 'نظر آن‌ها که زودتر دیدند', items: items([{ quote: 'از نسخهٔ آزمایشی که دیدم، طراحی‌اش از همه چشم‌گیرتر است.', name: 'حمید', role: 'منتقد فناوری', avatar: '' }, { quote: 'سرعتش در کار روزانه کاملاً حس می‌شود.', name: 'سارا', role: 'کاربر آزمایشی', avatar: '' }]) }), { motion: 'fade' })])], { tone: 'light', paddingY: 64 }),
      { ...fx(sec([col([fx(w('cta', { title: 'زودتر از همه باخبر شوید', text: 'ایمیل یا شماره‌تان را ثبت کنید تا روز رونمایی با پیشنهاد ویژه به شما خبر بدهیم.', label: 'ثبت برای اطلاع‌رسانی', href: '/register' }), { ...card, surface: 'beam', hover: 'lift' })])], { paddingY: 72, width: 'narrow' }), { surface: 'grid' }), anchor: 'notify' },
    ]),
  },
  {
    id: 'page-course', fa: 'دورهٔ آموزشی و وبینار', en: 'Course and webinar',
    descFa: 'سربرگ روی شبکهٔ ظریف، آنچه یاد می‌گیرید با نوار پیشرفت، سرفصل‌ها، شمارش معکوس ثبت‌نام، تعرفه، نظر شرکت‌کنندگان و پرسش‌ها',
    descEn: 'Grid header, what you will learn as progress bars, syllabus, enrolment countdown, pricing, reviews and questions',
    doc: doc([
      fx(sec([col([fx(w('hero', { eyebrow: 'دورهٔ جامع آنلاین', title: 'از صفر تا حرفه‌ای، در هشت هفته', text: 'آموزش پروژه‌محور با مربی، تمرین هفتگی و گواهی پایان دوره.', label: 'ثبت‌نام در دوره', href: '#pricing', secondaryLabel: 'سرفصل‌ها', secondaryHref: '#syllabus' }), { textFx: 'gradient', motion: 'up' })])], { tone: 'dark', paddingY: 100 }), { surface: 'grid', minHeight: 520 }),
      sec([
        col([...title('آنچه یاد می‌گیرید'), fx(w('progress', { items: items([{ label: 'مبانی و ابزارها', value: '100' }, { label: 'پروژه‌های عملی', value: '90' }, { label: 'کار تیمی و ارائه', value: '75' }, { label: 'آمادگی بازار کار', value: '85' }]) }), up)], 50),
        col([fx(w('counters', { items: items([{ value: '48', suffix: '', label: 'جلسهٔ آموزشی' }, { value: '12', suffix: '', label: 'پروژهٔ عملی' }, { value: '3200', suffix: '+', label: 'دانش‌آموخته' }]) }), { ...card, surface: 'glass', motion: 'up' })], 50),
      ], { paddingY: 64 }),
      { ...sec([col([...title('سرفصل‌های دوره'), fx(w('list', { items: items([{ icon: '۱', title: 'هفتهٔ اول و دوم: پایه‌ها', text: 'مفاهیم اصلی، ابزارها و راه‌اندازی محیط کار.' }, { icon: '۲', title: 'هفتهٔ سوم و چهارم: ساختن', text: 'اولین پروژهٔ واقعی را از صفر می‌سازید.' }, { icon: '۳', title: 'هفتهٔ پنجم و ششم: حرفه‌ای شدن', text: 'الگوهای پیشرفته، بهینه‌سازی و کار تیمی.' }, { icon: '۴', title: 'هفتهٔ هفتم و هشتم: پروژهٔ نهایی', text: 'پروژهٔ پایانی، بازخورد مربی و ارائه.' }]) }), up)])], { tone: 'light', paddingY: 64 }), anchor: 'syllabus' },
      sec([col([fx(w('countdown', { until: '', title: 'تا پایان ثبت‌نام با تخفیف', done: 'ثبت‌نام با تخفیف تمام شد' }), { ...card, surface: 'glass', loop: 'pulse' })])], { paddingY: 40, width: 'narrow' }),
      { ...sec([col([...title('ثبت‌نام'), fx(w('pricing', { items: items([{ title: 'دورهٔ آنلاین', price: '۲٬۹۰۰٬۰۰۰ تومان', period: 'یک‌جا', features: 'دسترسی همیشگی به ویدیوها\nتمرین و پروژه\nگواهی پایان دوره', label: 'ثبت‌نام', href: '/register', featured: '1' }, { title: 'با منتور', price: '۴٬۹۰۰٬۰۰۰ تومان', period: 'یک‌جا', features: 'همهٔ امکانات دورهٔ آنلاین\nجلسهٔ هفتگی با منتور\nبازبینی پروژه‌ها', label: 'ثبت‌نام با منتور', href: '/register', featured: '' }]) }), { hover: 'float', motion: 'up' })])], { paddingY: 72 }), anchor: 'pricing' },
      sec([col([fx(w('testimonials', { title: 'از زبان شرکت‌کنندگان', items: items([{ quote: 'پروژه‌محور بودن دوره باعث شد بعد از دو ماه نمونه‌کار واقعی داشته باشم.', name: 'رضا', role: 'دانش‌آموختهٔ دوره', avatar: '' }, { quote: 'منتور هر هفته کارم را دقیق بررسی می‌کرد؛ همین فرق را ساخت.', name: 'الهام', role: 'دانش‌آموختهٔ دوره', avatar: '' }]) }), { motion: 'fade' })])], { tone: 'light', paddingY: 64 }),
      sec([col([w('faq', { title: 'پرسش‌ها', items: items([{ q: 'برای شروع پیش‌نیاز لازم است؟', a: 'خیر؛ دوره از صفر شروع می‌شود.' }, { q: 'اگر جلسه‌ای را از دست بدهم؟', a: 'ضبط همهٔ جلسه‌ها همیشه در دسترس است.' }, { q: 'گواهی دوره معتبر است؟', a: 'گواهی پایان دوره با کد رهگیری صادر می‌شود.' }]) })])], { paddingY: 64, width: 'narrow' }),
    ]),
  },
  {
    id: 'page-agency', fa: 'آژانس و خدمات خلاقانه', en: 'Creative agency and services',
    descFa: 'سربرگ با تیتر براق روی شفق، خدمات با برق‌زدن، عددها، روش کار، نظر مشتریان و دعوت پایانی',
    descEn: 'Shimmering title on aurora, shining services, figures, process, reviews and a closing call',
    doc: doc([
      heroAurora('استودیوی طراحی و توسعه', 'ایده‌تان را به برندی تبدیل می‌کنیم که دیده می‌شود', 'هویت بصری، وب‌سایت و کمپین؛ از اولین طرح تا راه‌اندازی، با یک تیم.', 'شروع پروژه', '/contact', 'نمونه‌کارها', '#work'),
      sec([col(title('خدماتی که ارائه می‌دهیم'))], { paddingY: 40 }),
      featureRow([{ icon: 'pen', title: 'هویت بصری', text: 'لوگو، رنگ و قلمی که برند شما را از دیگران جدا می‌کند.' }, { icon: 'code', title: 'طراحی و توسعهٔ وب', text: 'سایت سریع، زیبا و آماده برای موتورهای جست‌وجو.' }, { icon: 'megaphone', title: 'کمپین و تبلیغات', text: 'محتوایی که دیده می‌شود و مشتری می‌آورد.' }], 'shine'),
      fx(sec([col([fx(w('counters', { items: items([{ value: '180', suffix: '+', label: 'پروژهٔ انجام‌شده' }, { value: '95', suffix: '٪', label: 'مشتری بازگشتی' }, { value: '12', suffix: '', label: 'سال تجربه' }]) }), { motion: 'up' })])], { tone: 'dark', paddingY: 64 }), { surface: 'dots' }),
      { ...sec([col([...title('چطور کار می‌کنیم'), fx(w('tabs', { items: items([{ title: 'کشف', text: 'کسب‌وکار، مخاطب و رقبا را می‌شناسیم و هدف را روشن می‌کنیم.' }, { title: 'طراحی', text: 'چند مسیر طراحی می‌سازیم و با شما بهترین را انتخاب می‌کنیم.' }, { title: 'ساخت', text: 'طرح نهایی را دقیق و آزموده پیاده می‌کنیم.' }, { title: 'رشد', text: 'پس از راه‌اندازی، نتیجه را می‌سنجیم و بهتر می‌کنیم.' }]) }), up)])], { paddingY: 64 }), anchor: 'work' },
      sec([col([fx(w('testimonials', { title: 'مشتریان چه می‌گویند', items: items([{ quote: 'برند ما بعد از بازطراحی کاملاً حرفه‌ای دیده می‌شود؛ فروش آنلاین دو برابر شد.', name: 'کاوه', role: 'مدیر فروشگاه آنلاین', avatar: '' }, { quote: 'تیم دقیق و خوش‌قول بود؛ همه‌چیز سر موعد تحویل شد.', name: 'شیرین', role: 'مدیر بازاریابی', avatar: '' }]) }), { motion: 'fade' })])], { tone: 'light', paddingY: 64 }),
      closing('پروژهٔ بعدی شما را با هم بسازیم', 'یک جلسهٔ مشاورهٔ رایگان بگیرید و مسیر را روشن کنید.', 'رزرو جلسهٔ رایگان', '/contact'),
    ]),
  },
  {
    id: 'page-event', fa: 'رویداد و همایش', en: 'Event and conference',
    descFa: 'سربرگ با نقطه‌ها و تیتر درخشان، شمارش معکوس، برنامهٔ رویداد، سخنرانان، پرسش‌ها و ثبت‌نام',
    descEn: 'Dotted header with a glowing title, countdown, agenda, speakers, questions and registration',
    doc: doc([
      fx(sec([col([fx(w('hero', { eyebrow: 'همایش سالانه · تهران', title: 'آینده‌ای که امروز ساخته می‌شود', text: 'یک روز سخنرانی، کارگاه و شبکه‌سازی با فعالان صنعت.', label: 'خرید بلیت', href: '#tickets', secondaryLabel: 'برنامه', secondaryHref: '#agenda' }), { textFx: 'glow', motion: 'flip' })])], { tone: 'dark', paddingY: 110 }), { surface: 'dots', minHeight: 540 }),
      sec([col([fx(w('countdown', { until: '', title: 'تا شروع همایش', done: 'همایش آغاز شد' }), { ...card, surface: 'glass', motion: 'zoom' })])], { paddingY: 48, width: 'narrow' }),
      { ...sec([col([...title('برنامهٔ رویداد'), fx(w('list', { items: items([{ icon: '۹', title: 'پذیرش و آشنایی', text: 'ساعت ۹ تا ۱۰ — ثبت ورود و پذیرایی' }, { icon: '۱۰', title: 'سخنرانی افتتاحیه', text: 'ساعت ۱۰ تا ۱۱ — نگاهی به روندهای سال پیش رو' }, { icon: '۱۱', title: 'کارگاه‌های هم‌زمان', text: 'ساعت ۱۱ تا ۱۳ — سه کارگاه تخصصی' }, { icon: '۱۴', title: 'پنل گفت‌وگو و شبکه‌سازی', text: 'ساعت ۱۴ تا ۱۶ — پرسش و پاسخ با مهمانان' }]) }), up)])], { tone: 'light', paddingY: 64 }), anchor: 'agenda' },
      sec([col([fx(w('testimonials', { title: 'سخنرانان', items: items([{ quote: 'دربارهٔ هوش مصنوعی در کسب‌وکارهای کوچک.', name: 'دکتر نگار', role: 'پژوهشگر داده', avatar: '' }, { quote: 'دربارهٔ ساختن محصولی که مردم دوستش دارند.', name: 'مهندس امیر', role: 'مدیر محصول', avatar: '' }, { quote: 'دربارهٔ رشد پایدار استارتاپ‌ها.', name: 'بهار', role: 'سرمایه‌گذار', avatar: '' }]) }), { motion: 'up', hover: 'lift' })])], { paddingY: 64 }),
      { ...sec([col([...title('بلیت‌ها'), fx(w('pricing', { items: items([{ title: 'عادی', price: '۹۵۰٬۰۰۰ تومان', period: '', features: 'حضور در سخنرانی‌ها\nپذیرایی', label: 'خرید', href: '/register', featured: '' }, { title: 'ویژه', price: '۱٬۹۰۰٬۰۰۰ تومان', period: '', features: 'همهٔ سخنرانی‌ها و کارگاه‌ها\nناهار و شبکه‌سازی\nفایل ارائه‌ها', label: 'خرید بلیت ویژه', href: '/register', featured: '1' }]) }), { hover: 'float', motion: 'up' })])], { tone: 'light', paddingY: 72 }), anchor: 'tickets' },
      sec([col([w('faq', { title: 'پرسش‌ها', items: items([{ q: 'آیا بلیت قابل بازگشت است؟', a: 'تا یک هفته پیش از رویداد، با کسر کارمزد.' }, { q: 'آیا گواهی حضور داده می‌شود؟', a: 'بله، برای همهٔ شرکت‌کنندگان.' }]) })])], { paddingY: 64, width: 'narrow' }),
    ]),
  },
  {
    id: 'page-coming-soon', fa: 'صفحهٔ «به‌زودی»', en: 'Coming soon',
    descFa: 'یک صفحهٔ تمام‌قد با شفق، تیتر براق، شمارش معکوس، سه وعده و شبکه‌های اجتماعی',
    descEn: 'A full-height aurora page with a shimmering title, a countdown, three promises and social links',
    doc: doc([
      fx(sec([col([fx(w('heading', { level: 'h1', text: 'چیزی تازه در راه است' }, center), { textFx: 'shimmer', motion: 'blur', fontSize: 64, fontSizeM: 36 }), fx(w('text', { html: '<p>در حال ساختن تجربه‌ای تازه هستیم. به‌زودی برمی‌گردیم.</p>' }, center), { motion: 'up' })])], { tone: 'dark', paddingY: 140 }), { surface: 'aurora', minHeight: 620 }),
      sec([col([fx(w('countdown', { until: '', title: 'تا بازگشایی', done: 'بازگشایی شد' }), { ...card, surface: 'glass', loop: 'float' })])], { paddingY: 40, width: 'narrow' }),
      featureRow([{ icon: 'sparkles', title: 'طراحی تازه', text: 'ساده‌تر، سریع‌تر و زیباتر.' }, { icon: 'gift', title: 'پیشنهاد ویژه', text: 'هدیهٔ بازگشایی برای همراهان اولیه.' }, { icon: 'bell', title: 'خبرتان می‌کنیم', text: 'همین که آماده شد، اول شما می‌دانید.' }], 'float'),
      sec([col([w('heading', { level: 'h3', text: 'ما را دنبال کنید' }, center), fx(w('social', { items: items([{ network: 'telegram', href: '' }, { network: 'instagram', href: '' }, { network: 'x', href: '' }]) }, center), { hover: 'zoom' })])], { paddingY: 56 }),
    ]),
  },
]

export const LANDING_SECTION_TEMPLATES: BundledTemplate[] = [
  { id: 'fx-hero-aurora', fa: 'سربرگ با شفق متحرک', en: 'Aurora header', descFa: 'تیتر گرادیانی که از تاری ظاهر می‌شود، روی نورهای شفق', descEn: 'A gradient title that clears from blur, over aurora lights', doc: doc([heroAurora('تازه', 'تیتر اصلی صفحهٔ شما', 'یک جملهٔ کوتاه که ارزش کار را روشن می‌گوید.', 'شروع کنید', '/register', 'بیشتر بدانید', '#')]) },
  { id: 'fx-features-tilt', fa: 'ویژگی‌ها با کارت‌های شیشه‌ای', en: 'Glass feature cards', descFa: 'سه کارت شیشه‌ای که با نشانگر سه‌بعدی کج می‌شوند', descEn: 'Three glass cards that tilt in 3D under the pointer', doc: doc([featureRow([{ icon: 'bolt', title: 'ویژگی اول', text: 'توضیح کوتاه.' }, { icon: 'shield', title: 'ویژگی دوم', text: 'توضیح کوتاه.' }, { icon: 'heart', title: 'ویژگی سوم', text: 'توضیح کوتاه.' }])]) },
  { id: 'fx-stats-glass', fa: 'عددها روی شیشه', en: 'Figures on glass', descFa: 'شمارنده‌ها در یک نوار شیشه‌ای روی مش نورها', descEn: 'Counters on a glass band over mesh lights', doc: doc([fx(sec([col([fx(w('counters', { items: items([{ value: '1200', suffix: '+', label: 'مشتری' }, { value: '98', suffix: '٪', label: 'رضایت' }, { value: '24', suffix: '/7', label: 'پشتیبانی' }]) }), { ...card, surface: 'glass', motion: 'up' })])], { tone: 'dark', paddingY: 64 }), { surface: 'mesh' })]) },
  { id: 'fx-pricing-float', fa: 'تعرفه‌ها با کارت شناور', en: 'Floating pricing', descFa: 'جدول قیمت که کارت‌هایش با نشانگر بالا می‌آیند', descEn: 'Pricing whose cards rise under the pointer', doc: doc([sec([col([...title('تعرفه‌ها'), fx(w('pricing', {}), { hover: 'float', motion: 'up' })])], { tone: 'light', paddingY: 72 })]) },
  { id: 'fx-cta-beam', fa: 'دعوت با نور چرخان', en: 'Beam-edged call', descFa: 'کادری که نوری دور لبه‌اش می‌چرخد، روی شبکهٔ ظریف', descEn: 'A box with a light running round its edge, on a fine grid', doc: doc([fx(sec([col([fx(w('cta', { title: 'همین حالا شروع کنید', text: 'یک جملهٔ کوتاه دربارهٔ پیشنهاد.', label: 'شروع', href: '/register' }), { ...card, surface: 'beam', hover: 'lift' })])], { paddingY: 72, width: 'narrow' }), { surface: 'grid' })]) },
  { id: 'fx-cta-gradient', fa: 'دعوت با گرادیان متحرک', en: 'Moving-gradient call', descFa: 'نوار پایانی با گرادیانی که آرام جابه‌جا می‌شود', descEn: 'A closing band whose gradient drifts slowly', doc: doc([closing('آماده‌اید؟', 'یک جملهٔ کوتاه دربارهٔ قدم بعدی.', 'شروع کنید', '/register')]) },
]
