import {
  createSection, createWidget, validateBuilderDoc,
  type BuilderColumn, type BuilderDoc, type BuilderSection, type BuilderWidget, type WidgetType, type WidgetStyle,
} from './builder'

export type BundledTemplate = { id: string; fa: string; en: string; descFa: string; descEn: string; doc: BuilderDoc }

function w(type: WidgetType, props: Record<string, string>, style: Partial<WidgetStyle> = {}): BuilderWidget {
  const base = createWidget(type)
  return { ...base, props: { ...base.props, ...props }, style: { ...base.style, ...style } }
}

function col(widgets: BuilderWidget[], width = 100): BuilderColumn {
  return { id: `c-${Math.random().toString(36).slice(2, 10)}`, width, widgets }
}

function sec(columns: BuilderColumn[], opts: Partial<BuilderSection['style']> = {}): BuilderSection {
  const base = createSection(1)
  return { ...base, columns, style: { ...base.style, paddingY: 72, ...opts } }
}

function doc(sections: BuilderSection[]): BuilderDoc {
  return validateBuilderDoc({ v: 2, mode: 'builder', code: { html: '', css: '', js: '', advanced: false }, sections })
}

const center: Partial<WidgetStyle> = { align: 'center' }

const items = (rows: Record<string, string>[]) => JSON.stringify(rows)

export const BUNDLED_TEMPLATES: BundledTemplate[] = [
  {
    id: 'hero-split',
    fa: 'سرصفحه دو ستونه',
    en: 'Split hero',
    descFa: 'تیتر و متن و دو دکمه کنار تصویر',
    descEn: 'Headline, copy and two CTAs beside an image',
    doc: doc([
      sec([col([
        w('heading', { level: 'h1', text: 'اینترنت آزاد، با یک کلیک', textEn: 'The open internet, one click away' }),
        w('text', { html: '<p>اتصال امن و پرسرعت به بیش از ۶۰ کشور؛ بدون قطعی، بدون ثبت لاگ، با پشتیبانی واقعی.</p>', htmlEn: '<p>Fast, private connections to 60+ countries. No logs, no throttling, real human support.</p>' }),
        w('button', { label: 'شروع رایگان', labelEn: 'Start free', href: '/plans', variant: 'primary', secondaryLabel: 'مشاهده پلن‌ها', secondaryLabelEn: 'See plans', secondaryHref: '/plans' }),
      ], 58), col([
        w('image', { src: '', alt: 'هپ‌وی‌پی‌ان در حال اجرا', label: 'ورود به پنل', labelEn: 'Open dashboard', href: '/dashboard' }, { radius: 24 }),
      ], 42)], { paddingY: 96 }),
    ]),
  },
  {
    id: 'hero-center-stats',
    fa: 'سرصفحه وسط‌چین + آمار',
    en: 'Centered hero + stats',
    descFa: 'هیرو وسط‌چین با دکمه اصلی و نوار آمار تیره',
    descEn: 'Centered hero with primary CTA and a dark stats band',
    doc: doc([
      sec([col([
        w('heading', { level: 'h1', text: 'VPN ایمن برای همه دستگاه‌های شما', textEn: 'One secure VPN for every device' }, center),
        w('text', { html: '<p>یک اشتراک، همه‌جا. ویندوز، اندروید، iOS، مک و روتر — همگی پوشش داده شده‌اند.</p>', htmlEn: '<p>One subscription, everywhere. Windows, Android, iOS, macOS and routers — all covered.</p>' }, { ...center, width: 76 }),
        w('button', { label: 'همین حالا شروع کنید', labelEn: 'Get started now', href: '/plans', variant: 'primary', secondaryLabel: 'اکانت تست رایگان', secondaryLabelEn: 'Free trial', secondaryHref: '/trial' }, center),
      ])], { paddingY: 104 }),
      sec([col([
        w('stats', { items: items([
          { value: '۶۰+', label: 'کشور', labelEn: 'Countries' },
          { value: '۹۹۹۹+', label: 'سرور', labelEn: 'Servers' },
          { value: '۲۴/۷', label: 'پشتیبانی', labelEn: 'Support' },
          { value: '۰', label: 'لاگ ذخیره‌شده', labelEn: 'Logs stored' },
        ]) }, { ...center, color: '#ffffff' }),
      ])], { tone: 'dark', paddingY: 56 }),
    ]),
  },
  {
    id: 'features-6',
    fa: 'شبکه ویژگی‌ها (۶ کارت)',
    en: 'Feature grid (6 cards)',
    descFa: 'تیتر وسط‌چین و شش کارت ویژگی',
    descEn: 'Centered heading with six feature cards',
    doc: doc([
      sec([col([
        w('heading', { level: 'h2', text: 'چرا هپ‌وی‌پی‌ان؟', textEn: 'Why MoboComCMS?' }, center),
        w('text', { html: '<p>هر آنچه برای یک اتصال امن و سریع لازم دارید، در یک برنامه.</p>', htmlEn: '<p>Everything you need for a fast, private connection — in one app.</p>' }, center),
        w('list', { title: '', titleEn: '', items: items([
          { title: 'سرعت بدون محدودیت', titleEn: 'Unlimited speed', text: 'پروتکل‌های مدرن WireGuard و OpenVPN با بهینه‌سازی مسیر.', textEn: 'Modern WireGuard and OpenVPN protocols with route optimization.', icon: '⚡' },
          { title: 'بدون ثبت فعالیت', titleEn: 'No activity logs', text: 'سیاست عدم نگهداری لاگ، مستقل توسط مراجع ثالث حسابرسی شده.', textEn: 'A strict no-logs policy, audited by independent third parties.', icon: '🛡️' },
          { title: 'همه‌جا متصل', titleEn: 'Works everywhere', text: 'برای ویندوز، مک، اندروید، iOS، تلویزیون و روتر.', textEn: 'Apps for Windows, macOS, Android, iOS, TV and routers.', icon: '🌍' },
          { title: 'خرید ایرانی', titleEn: 'Local payments', text: 'پرداخت ریالی با درگاه‌های داخلی و تحویل آنی.', textEn: 'IRT payments via local gateways, delivered instantly.', icon: '💳' },
          { title: 'پشتیبانی واقعی', titleEn: 'Real support', text: 'تیم پشتیبانی فارسی‌زبان، هفت روز هفته پاسخگو.', textEn: 'Persian-speaking support team, seven days a week.', icon: '💬' },
          { title: 'قیمت منصفانه', titleEn: 'Fair pricing', text: 'تعرفه شفاف، بدون تمدید خودکار پنهان.', textEn: 'Transparent pricing with no hidden renewals.', icon: '✨' },
        ]) }, { align: 'center' }),
      ])], { paddingY: 88 }),
    ]),
  },
  {
    id: 'pricing-faq',
    fa: 'پلن‌های زنده + پرسش و پاسخ',
    en: 'Live pricing + FAQ',
    descFa: 'جدول پلن‌های واقعی فروشگاه به‌همراه پرسش‌های متداول',
    descEn: 'Your real store plans plus an FAQ block',
    doc: doc([
      sec([col([
        w('heading', { level: 'h2', text: 'پلن‌ها و قیمت‌ها', textEn: 'Plans & pricing' }, center),
        w('plans', { title: '', titleEn: '', limit: '3' }, center),
      ])], { paddingY: 88 }),
      sec([col([
        w('heading', { level: 'h2', text: 'پرسش‌های متداول', textEn: 'Frequently asked questions' }),
        w('faq', { items: items([
          { q: 'آیا امکان بازگشت وجه وجود دارد؟', qEn: 'Is there a money-back guarantee?', a: 'بله، تا ۳۰ روز پس از خرید بدون سؤال بازگشت کامل دارید.', aEn: 'Yes — a full refund within 30 days, no questions asked.' },
          { q: 'چند دستگاه هم‌زمان؟', qEn: 'How many simultaneous devices?', a: 'بسته به پلن بین ۳ تا ۱۰ اتصال هم‌زمان.', aEn: 'Between 3 and 10 simultaneous connections, depending on the plan.' },
          { q: 'روی چه دستگاه‌هایی کار می‌کند؟', qEn: 'Which devices are supported?', a: 'ویندوز، مک، اندروید، iOS، تلویزیون و روتر.', aEn: 'Windows, macOS, Android, iOS, TVs and routers.' },
          { q: 'سرعت من تغییر می‌کند؟', qEn: 'Will my speed drop?', a: 'پروتکل WireGuard مسیر بهینه را انتخاب می‌کند؛ معمولاً کمتر از ۱۰٪ افت.', aEn: 'WireGuard picks the optimal route; typically under 10% overhead.' },
        ]) }),
      ])], { tone: 'light', paddingY: 88 }),
    ]),
  },
  {
    id: 'steps-cta',
    fa: 'سه قدم تا اتصال + دعوت',
    en: '3 steps + CTA',
    descFa: 'راهنمای سه‌مرحله‌ای و بلوک دعوت به اقدام',
    descEn: 'Three-step walkthrough and a call-to-action',
    doc: doc([
      sec([col([
        w('heading', { level: 'h2', text: 'در سه قدم وصل شوید', textEn: 'Connected in three steps' }, center),
        w('list', { items: items([
          { title: '۱. ثبت‌نام', titleEn: '1. Sign up', text: 'ایمیل و رمز عبور، تمام. بدون فرم‌های طولانی.', textEn: 'Email and password. That is all.', icon: '1' },
          { title: '۲. نصب برنامه', titleEn: '2. Install the app', text: 'دانلود برای سیستم‌عامل خودتان از صفحه دانلود.', textEn: 'Download the app for your platform.', icon: '2' },
          { title: '۳. اتصال', titleEn: '3. Connect', text: 'یک کلیک، آی‌پی عوض شد. تمام.', textEn: 'One click and your IP has changed.', icon: '3' },
        ]) }, { align: 'center' }),
      ])], { paddingY: 80 }),
      sec([col([
        w('cta', { title: 'آماده‌اید امتحان کنید؟', titleEn: 'Ready to try it?', text: '۷ روز ضمانت بازگشت وجه. بدون ریسک.', textEn: '7-day money-back guarantee. Zero risk.', label: 'خرید اشتراک', labelEn: 'Get a subscription', href: '/plans' }, center),
      ])], { tone: 'accent', paddingY: 64 }),
    ]),
  },
  {
    id: 'journal-4',
    fa: 'مجله (مطالب اخیر)',
    en: 'Journal (latest posts)',
    descFa: 'چهار مقاله آخر وبلاگ به‌صورت زنده',
    descEn: 'Your four latest journal entries, live',
    doc: doc([
      sec([col([
        w('heading', { level: 'h2', text: 'از مجله هپ‌وی‌پی‌ان', textEn: 'From the MoboComCMS journal' }),
        w('posts', { title: '', titleEn: '', limit: '4' }),
      ])], { paddingY: 80 }),
    ]),
  },
  {
    id: 'compare-table',
    fa: 'جدول مقایسه',
    en: 'Comparison table',
    descFa: 'مقایسه ویژگی‌ها در قالب جدول',
    descEn: 'Feature comparison as a table',
    doc: doc([
      sec([col([
        w('heading', { level: 'h2', text: 'هپ‌وی‌پی‌ان یا رقبا؟', textEn: 'MoboComCMS vs. the rest' }, center),
        w('text', { html: '<table><thead><tr><th>ویژگی</th><th>هپ‌وی‌پی‌ان</th><th>رایج</th></tr></thead><tbody><tr><td>پروتکل WireGuard</td><td>بله</td><td>بعضی</td></tr><tr><td>بدون ثبت لاگ</td><td>بله</td><td>خیر</td></tr><tr><td>پرداخت ریالی</td><td>بله</td><td>خیر</td></tr><tr><td>پشتیبانی فارسی</td><td>بله</td><td>خیر</td></tr></tbody></table>', htmlEn: '<table><thead><tr><th>Feature</th><th>MoboComCMS</th><th>Typical</th></tr></thead><tbody><tr><td>WireGuard protocol</td><td>Yes</td><td>Sometimes</td></tr><tr><td>No-logs</td><td>Yes</td><td>No</td></tr><tr><td>Local payments</td><td>Yes</td><td>No</td></tr><tr><td>Local-language support</td><td>Yes</td><td>No</td></tr></tbody></table>' }, { width: 88, align: 'center' }),
      ])], { paddingY: 80 }),
    ]),
  },
  {
    id: 'trust-quotes',
    fa: 'نظرات مشتریان + اعتماد',
    en: 'Testimonials + trust',
    descFa: 'سه نظر مشتری و نوار آمار اعتماد',
    descEn: 'Three customer quotes with a trust stats band',
    doc: doc([
      sec([col([
        w('heading', { level: 'h2', text: 'مشتریان چه می‌گویند؟', textEn: 'What customers say' }, center),
        w('list', { items: items([
          { title: '«بعد از مهاجرت، پینگ بازی نصف شد.»', titleEn: '"My game ping halved after switching."', text: 'سعید، گیمر', textEn: 'Saeed, gamer', icon: '★' },
          { title: '«روی تلویزیون هم وصل شد، فقط با یک تنظیم.»', titleEn: '"It even works on my TV — one setting."', text: 'نگین، مهندس نرم‌افزار', textEn: 'Negin, software engineer', icon: '★' },
          { title: '«پشتیبانی واقعاً جواب می‌دهد؛ همان شب حل شد.»', titleEn: '"Support actually answers — fixed the same night."', text: 'امیر، فریلنسر', textEn: 'Amir, freelancer', icon: '★' },
        ]) }, { align: 'center' }),
      ])], { tone: 'light', paddingY: 80 }),
      sec([col([
        w('stats', { items: items([
          { value: '۱۲۰K+', label: 'کاربر فعال', labelEn: 'Active users' },
          { value: '۴٫۸/۵', label: 'رضایت', labelEn: 'Satisfaction' },
          { value: '۹۹٫۹٪', label: 'آپ‌تایم', labelEn: 'Uptime' },
        ]) }, { ...center, color: '#ffffff' }),
      ])], { tone: 'dark', paddingY: 56 }),
    ]),
  },
  {
    id: 'faq-cta',
    fa: 'پرسش و پاسخ + دعوت پایانی',
    en: 'FAQ + closing CTA',
    descFa: 'پرسش‌های متداول و بلوک پایانی صفحه',
    descEn: 'FAQ block and a closing call-to-action',
    doc: doc([
      sec([col([
        w('heading', { level: 'h2', text: 'سؤالی دارید؟', textEn: 'Questions?' }),
        w('faq', { items: items([
          { q: 'اشتراک را چطور لغو کنم؟', qEn: 'How do I cancel?', a: 'از پنل کاربری، بخش اشتراک‌ها، یک کلیک.', aEn: 'From your panel, subscriptions — one click.' },
          { q: 'ضمانت بازگشت وجه یعنی چه؟', qEn: 'What does the guarantee mean?', a: 'تا ۳۰ روز کامل بازگشت وجه، بدون سؤال.', aEn: 'Full refund within 30 days, no questions.' },
        ]) }),
      ])], { paddingY: 72 }),
      sec([col([
        w('cta', { title: 'به جمع کاربران بپیوندید', titleEn: 'Join the community', text: 'همین امروز شروع کنید؛ اگر نپسندیدید، بازمی‌گردد.', textEn: 'Start today — if it is not for you, you get your money back.', label: 'خرید', labelEn: 'Buy now', href: '/plans' }, center),
      ])], { tone: 'dark', paddingY: 64 }),
    ]),
  },
]

/** Built-in single-post layouts — chosen per post, each hosts the article body slot. */
export const POST_TEMPLATES: BundledTemplate[] = [
  {
    id: 'post-classic',
    fa: 'کلاسیک — تیتر، کاور، متن',
    en: 'Classic — header, cover, body',
    descFa: 'چیدمان مجله‌ای استاندارد با هدر کامل و متن تک‌ستونه',
    descEn: 'Standard editorial layout with a full header and single-column body',
    doc: doc([
      sec([col([w('post-header', {})])], { paddingY: 64 }),
      sec([col([w('post-cover', {})])], { paddingY: 0 }),
      sec([col([w('content', {})])], { paddingY: 48 }),
      sec([col([w('post-footer', {})])], { tone: 'light', paddingY: 56 }),
    ]),
  },
  {
    id: 'post-magazine',
    fa: 'مجله‌ای — ستون اصلی + کناری',
    en: 'Magazine — main + sidebar',
    descFa: 'هدر رنگی، متن در کنار ستون کناری با آخرین مطالب',
    descEn: 'Tinted header with the article beside a latest-posts sidebar',
    doc: doc([
      sec([col([w('post-header', {})], 100)], { tone: 'accent', paddingY: 72 }),
      sec([
        col([w('post-cover', {}), w('content', {})], 68),
        col([
          w('heading', { level: 'h3', text: 'مطالب دیگر', textEn: 'More stories' }),
          w('posts', { title: '', titleEn: '', limit: '3' }),
          w('cta', { title: 'اشتراک خبرنامه', titleEn: 'Newsletter', text: 'هر هفته یک ایمیل، بدون شلوغ‌کاری.', textEn: 'One email a week, no noise.', label: 'عضویت', labelEn: 'Subscribe', href: '/newsletter' }),
        ], 32),
      ], { paddingY: 40 }),
      sec([col([w('post-footer', {})])], { tone: 'light', paddingY: 56 }),
    ]),
  },
  {
    id: 'post-minimal',
    fa: 'ساده و خوانا — ستون باریک',
    en: 'Minimal — narrow reading column',
    descFa: 'تمرکز روی متن؛ ستون محدود با فاصله کم و بدون حواس‌پرتی',
    descEn: 'Text-first: constrained column, tight spacing, zero distractions',
    doc: doc([
      sec([col([w('post-header', {})])], { paddingY: 40 }),
      sec([col([w('post-cover', {})])], { paddingY: 0 }),
      sec([col([w('content', {}, { width: 72 })])], { paddingY: 32 }),
      sec([col([w('post-footer', {})])], { paddingY: 40 }),
    ]),
  },
  {
    id: 'post-landing',
    fa: 'خبری — هیروی تیره + CTA',
    en: 'News — dark hero + CTA',
    descFa: 'سرمقاله تیره تمام‌عرض، متن کامل و دعوت پایانی',
    descEn: 'Full-width dark editorial hero, full body and a closing CTA',
    doc: doc([
      sec([col([w('post-header', {})], 100)], { tone: 'dark', paddingY: 96 }),
      sec([col([w('post-cover', {})])], { paddingY: 0 }),
      sec([col([
        w('content', {}),
        w('cta', { title: 'ادامه را در پلن ببینید', titleEn: 'See it in a plan', text: 'همین امروز شروع کنید؛ ۷ روز ضمانت بازگشت وجه.', textEn: 'Start today — 7-day money-back guarantee.', label: 'مشاهده پلن‌ها', labelEn: 'See plans', href: '/plans' }, center),
      ])], { paddingY: 56 }),
      sec([col([w('post-footer', {})])], { tone: 'light', paddingY: 56 }),
    ]),
  },
]


// Genre layouts for the journal (film, series, music, gaming) — all host the article slot.
POST_TEMPLATES.push(
  {
    id: 'post-film',
    fa: 'فیلم و سریال — سینمایی',
    en: 'Film & series — cinematic',
    descFa: 'هدر تیره تمام‌عرض، کاور بزرگ و ستون کناری «مشخصات اثر»',
    descEn: 'Dark full-width header, big cover and a “title facts” sidebar',
    doc: doc([
      sec([col([w('post-header', {})])], { tone: 'dark', paddingY: 88, width: 'narrow' }),
      sec([col([w('post-cover', {})])], { tone: 'dark', paddingY: 0 }),
      sec([
        col([w('content', {})], 68),
        col([
          w('list', { title: 'مشخصات اثر', titleEn: 'Title facts', items: items([
            { icon: '🎬', title: 'کارگردان', titleEn: 'Director', text: '—', textEn: '—' },
            { icon: '⭐', title: 'امتیاز منتقد', titleEn: 'Critic score', text: '—', textEn: '—' },
            { icon: '📅', title: 'سال انتشار', titleEn: 'Release year', text: '—', textEn: '—' },
          ]) }, { tone: 'dark', radius: 18 }),
          w('posts', { title: 'نقدهای دیگر', titleEn: 'More reviews', limit: '3', category: '' }),
        ], 32),
      ], { paddingY: 48, valign: 'start' }),
      sec([col([w('post-footer', {})])], { tone: 'light', paddingY: 56 }),
    ]),
  },
  {
    id: 'post-music',
    fa: 'موزیک — آلبوم و ترک',
    en: 'Music — album & track',
    descFa: 'کاور مربعی کنار تیتر، متن باریک و بلوک پخش ویدیو/موزیک',
    descEn: 'Square cover beside the headline, narrow body and a player block',
    doc: doc([
      sec([
        col([w('post-cover', {}, { radius: 24 })], 40),
        col([w('post-header', {})], 60),
      ], { tone: 'accent', paddingY: 72, valign: 'center' }),
      sec([col([
        w('video', { url: '', title: 'پخش' }),
        w('content', {}),
      ])], { paddingY: 48, width: 'narrow' }),
      sec([col([w('post-footer', {})])], { paddingY: 48 }),
    ]),
  },
  {
    id: 'post-gaming',
    fa: 'گیمینگ — نقد و بررسی',
    en: 'Gaming — review',
    descFa: 'هدر نئونی، جعبهٔ امتیاز بازی، متن و بازی‌های مرتبط',
    descEn: 'Neon header, score box, body and related games',
    doc: doc([
      sec([col([w('post-header', {})])], { tone: 'dark', paddingY: 96 }),
      sec([col([w('post-cover', {})])], { paddingY: 0, width: 'full' }),
      sec([
        col([w('content', {})], 66),
        col([
          w('stats', { items: items([
            { value: '۹٫۲', label: 'امتیاز کلی', labelEn: 'Overall' },
            { value: '۸٫۵', label: 'گرافیک', labelEn: 'Graphics' },
            { value: '۹٫۰', label: 'گیم‌پلی', labelEn: 'Gameplay' },
          ]) }, { tone: 'dark', radius: 18 }),
          w('list', { title: 'نقاط قوت و ضعف', titleEn: 'Pros & cons', items: items([
            { icon: '✅', title: 'نقطهٔ قوت', titleEn: 'Pro', text: '—', textEn: '—' },
            { icon: '⚠️', title: 'نقطهٔ ضعف', titleEn: 'Con', text: '—', textEn: '—' },
          ]) }),
        ], 34),
      ], { paddingY: 48 }),
      sec([col([
        w('posts', { title: 'بازی‌های مرتبط', titleEn: 'Related games', limit: '4', category: '' }),
        w('post-footer', {}),
      ])], { tone: 'light', paddingY: 56 }),
    ]),
  },
)

/** Built-in single-product layouts. */
export const PRODUCT_TEMPLATES: BundledTemplate[] = [
  {
    id: 'product-classic',
    fa: 'کلاسیک فروشگاه',
    en: 'Classic store',
    descFa: 'همان چیدمان پیش‌فرض: گالری، مشخصات، باکس خرید، مزایا و تب‌ها',
    descEn: 'The default layout: gallery, details, buy box, benefits and tabs',
    doc: doc([
      sec([col([w('product-hero', {}), w('product-usp', {}), w('product-tabs', {})])], { paddingY: 24 }),
    ]),
  },
  {
    id: 'product-split',
    fa: 'دو ستونه — تمرکز روی خرید',
    en: 'Split — purchase focused',
    descFa: 'گالری بزرگ در یک ستون، مشخصات و خرید چسبیده در ستون دیگر',
    descEn: 'Large gallery on one side, details and buy box on the other',
    doc: doc([
      sec([
        col([w('product-gallery', {})], 55),
        col([w('product-info', {}), w('product-purchase', {})], 45),
      ], { paddingY: 32, valign: 'start' }),
      sec([col([w('product-usp', {}), w('product-tabs', {})])], { paddingY: 24 }),
    ]),
  },
  {
    id: 'product-landing',
    fa: 'لندینگ محصول مجازی',
    en: 'Digital product landing',
    descFa: 'هیروی رنگی با خرید، مزایا، پلن‌ها و پرسش‌های متداول',
    descEn: 'Tinted hero with the buy box, benefits, plans and FAQ',
    doc: doc([
      sec([
        col([w('product-info', {})], 58),
        col([w('product-purchase', {})], 42),
      ], { tone: 'accent', paddingY: 64, valign: 'center' }),
      sec([col([w('product-usp', {})])], { paddingY: 32 }),
      sec([col([w('product-gallery', {}), w('product-tabs', {})])], { paddingY: 32 }),
      sec([col([
        w('faq', { title: 'پرسش‌های متداول', titleEn: 'FAQ', items: items([
          { q: 'تحویل چقدر طول می‌کشد؟', qEn: 'How fast is delivery?', a: 'بلافاصله پس از پرداخت در حساب شما فعال می‌شود.', aEn: 'It activates in your account right after payment.' },
        ]) }),
      ])], { tone: 'light', paddingY: 56 }),
    ]),
  },
]

/** Starting points offered when a new theme template is created. */
export const THEME_PRESETS: Record<'header' | 'footer' | 'page', BundledTemplate[]> = {
  header: [
    {
      id: 'header-default-bar', fa: 'هدر سایت + نوار اطلاع‌رسانی', en: 'Site header + announcement bar',
      descFa: 'یک نوار پیام بالای هدر پیش‌فرض', descEn: 'A message bar above the default header',
      doc: doc([
        sec([col([w('text', { html: '<p>🎉 تخفیف ویژه این هفته — <a href="/plans">مشاهده پلن‌ها</a></p>', htmlEn: '<p>🎉 Special offer this week — <a href="/plans">see plans</a></p>' }, { align: 'center' })])], { tone: 'accent', paddingY: 8 }),
        sec([col([w('site-header', {})])], { paddingY: 0, width: 'full' }),
      ]),
    },
    {
      id: 'header-minimal', fa: 'هدر مینیمال', en: 'Minimal header',
      descFa: 'لوگو و منو در یک ردیف با دکمهٔ خرید', descEn: 'Logo and menu on one row with a buy button',
      doc: doc([
        sec([
          col([w('nav', {})], 78),
          col([w('button', { label: 'خرید اشتراک', labelEn: 'Get a plan', href: '/plans', variant: 'primary' }, { align: 'end' })], 22),
        ], { paddingY: 8, valign: 'center', width: 'full' }),
      ]),
    },
  ],
  footer: [
    {
      id: 'footer-default-cta', fa: 'فوتر سایت + دعوت پایانی', en: 'Site footer + closing CTA',
      descFa: 'بلوک دعوت به خرید بالای فوتر پیش‌فرض', descEn: 'A call-to-action above the default footer',
      doc: doc([
        sec([col([w('cta', { title: 'آماده‌اید؟', titleEn: 'Ready?', text: 'همین حالا یک پلن انتخاب کنید.', textEn: 'Pick a plan now.', label: 'مشاهده پلن‌ها', labelEn: 'See plans', href: '/plans' })])], { paddingY: 48 }),
        sec([col([w('site-footer', {})])], { paddingY: 0, width: 'full' }),
      ]),
    },
    {
      id: 'footer-columns', fa: 'فوتر چهارستونه', en: 'Four-column footer',
      descFa: 'درباره، لینک‌ها، مجله و تماس', descEn: 'About, links, journal and contact',
      doc: doc([
        sec([
          col([w('heading', { level: 'h4', text: 'MoboComCMS', textEn: 'MoboComCMS' }), w('text', { html: '<p>اینترنت آزاد و امن برای همه.</p>', htmlEn: '<p>A free and secure internet for everyone.</p>' })], 30),
          col([w('heading', { level: 'h4', text: 'دسترسی سریع', textEn: 'Quick links' }), w('text', { html: '<p><a href="/plans">پلن‌ها</a><br><a href="/products">فروشگاه</a><br><a href="/blog">مجله</a></p>', htmlEn: '<p><a href="/plans">Plans</a><br><a href="/products">Shop</a><br><a href="/blog">Journal</a></p>' })], 22),
          col([w('heading', { level: 'h4', text: 'حساب کاربری', textEn: 'Account' }), w('text', { html: '<p><a href="/dashboard">پنل کاربری</a><br><a href="/trial">اکانت تست</a></p>', htmlEn: '<p><a href="/dashboard">Dashboard</a><br><a href="/trial">Free trial</a></p>' })], 22),
          col([w('heading', { level: 'h4', text: 'پشتیبانی', textEn: 'Support' }), w('text', { html: '<p>پاسخ‌گویی ۲۴ ساعته از طریق تیکت.</p>', htmlEn: '<p>24/7 answers through tickets.</p>' })], 26),
        ], { tone: 'dark', paddingY: 56 }),
      ]),
    },
  ],
  page: [
    {
      id: 'page-section-hub', fa: 'صفحهٔ بخش (مثل گیمینگ)', en: 'Section hub (e.g. gaming)',
      descFa: 'هیرو، آخرین مطالب همین بخش و دعوت پایانی', descEn: 'Hero, latest posts of this section and a closing CTA',
      doc: doc([
        sec([col([w('hero', { eyebrow: 'HAPP / SECTION', eyebrowEn: 'HAPP / SECTION', title: 'عنوان بخش', titleEn: 'Section title', text: 'توضیح کوتاه دربارهٔ این بخش.', textEn: 'A short intro for this section.' })])], { tone: 'dark', paddingY: 96 }),
        sec([col([w('posts', { title: 'تازه‌ترین‌ها', titleEn: 'Latest', limit: '9', category: '@section' })])], { paddingY: 64 }),
        sec([col([w('cta', { title: 'عضو خبرنامه شوید', titleEn: 'Join the newsletter', text: 'هر هفته بهترین مطالب این بخش.', textEn: 'The best of this section every week.', label: 'عضویت', labelEn: 'Subscribe', href: '/newsletter' })])], { tone: 'accent', paddingY: 56 }),
      ]),
    },
    {
      id: 'page-magazine-home', fa: 'صفحه اصلی مجله', en: 'Journal landing',
      descFa: 'تیتر شاخص، شبکهٔ مطالب و مطالب هر دسته', descEn: 'Headline, post grid and per-category rows',
      doc: doc([
        sec([col([w('heading', { level: 'h1', text: 'مجله', textEn: 'Journal' }), w('posts', { title: '', titleEn: '', limit: '6', category: '' })])], { paddingY: 64 }),
        sec([col([w('posts', { title: 'پیشنهاد سردبیر', titleEn: "Editor's picks", limit: '4', category: '' })])], { tone: 'light', paddingY: 56 }),
      ]),
    },
    {
      id: 'page-landing', fa: 'لندینگ فروش', en: 'Sales landing',
      descFa: 'هیرو، ویژگی‌ها، پلن‌ها و پرسش‌ها', descEn: 'Hero, features, plans and FAQ',
      doc: doc([
        ...BUNDLED_TEMPLATES[0].doc.sections,
        ...BUNDLED_TEMPLATES[2].doc.sections,
        ...BUNDLED_TEMPLATES[3].doc.sections,
      ]),
    },
  ],
}

export const POST_TEMPLATE_IDS = POST_TEMPLATES.map((template) => template.id)
