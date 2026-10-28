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

/** `postStyle`: on an article template, the magazine page style its header and reading column wear. */
function doc(sections: BuilderSection[], postStyle = ''): BuilderDoc {
  return validateBuilderDoc({ v: 2, mode: 'builder', code: { html: '', css: '', js: '', advanced: false }, sections, layout: { header: 'default', footer: 'default', postStyle } })
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
      sec([col([w('post-footer', {})])], { paddingY: 56 }),
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
      sec([col([w('post-footer', {})])], { paddingY: 56 }),
    ]),
  },
  {
    id: 'post-minimal',
    fa: 'ساده و خوانا — بدون حواس‌پرتی',
    en: 'Minimal — no distractions',
    descFa: 'تمرکز روی متن؛ فاصلهٔ کم و بدون حواس‌پرتی',
    descEn: 'Text-first: tight spacing, zero distractions',
    doc: doc([
      sec([col([w('post-header', {})])], { paddingY: 40 }),
      sec([col([w('post-cover', {})])], { paddingY: 0 }),
      sec([col([w('content', {})])], { paddingY: 32 }),
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
      sec([col([w('post-footer', {})])], { paddingY: 56 }),
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
      sec([col([w('post-header', {})])], { tone: 'dark', paddingY: 88 }),
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
      sec([col([w('post-footer', {})])], { paddingY: 56 }),
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
      ])], { paddingY: 48 }),
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
      ])], { paddingY: 56 }),
    ]),
  },
)

// Designed article templates (owner, 2026-10-28): a structure of live blocks around the article, worn with one of the
// magazine's page styles. Nothing in them is one article's content, so any article may take them.
const newsletter = (tone: 'light' | 'dark' | 'accent' = 'dark') => sec([col([
  w('cta', { title: 'هر هفته، بهترین‌های مجله در ایمیل شما', titleEn: 'The best of the magazine, weekly', text: 'یک ایمیل در هفته؛ بدون تبلیغ مزاحم، هر وقت خواستید لغو کنید.', textEn: 'One email a week, no clutter; leave any time.', label: 'عضویت در خبرنامه', labelEn: 'Subscribe', href: '/newsletter' }, center),
])], { tone, paddingY: 56 })
const headerOnly = (cover = false) => [sec([col([w('post-header', {}), ...(cover ? [w('post-cover', {})] : [])])], { paddingY: 8 })]
const closing = (title: string, titleEn: string) => [
  sec([col([w('posts', { title, titleEn, limit: '3', category: '' })])], { paddingY: 48 }),
  sec([col([w('post-footer', {})])], { paddingY: 48 }),
]

POST_TEMPLATES.push(
  {
    id: 'post-pro-cinema',
    fa: 'نقد سینمایی حرفه‌ای',
    en: 'Pro film review',
    descFa: 'استایل سینمایی؛ متن کنار ستون «برترین‌های سینما» و نقدهای دیگر، دعوت به خبرنامه',
    descEn: 'Cinematic style; the review beside top films and more reviews, a newsletter call',
    doc: doc([
      ...headerOnly(),
      sec([
        col([w('content', {})], 66),
        col([
          w('media', { source: 'cinema-top', title: 'برترین‌های سینما', titleEn: 'Top films', limit: '4' }),
          w('posts', { title: 'نقدهای دیگر', titleEn: 'More reviews', limit: '3', category: '' }),
        ], 34),
      ], { paddingY: 40, valign: 'start' }),
      newsletter('dark'),
      sec([col([w('post-footer', {})])], { paddingY: 48 }),
    ], 'ps-cinematic'),
  },
  {
    id: 'post-pro-guide',
    fa: 'راهنمای گام‌به‌گام',
    en: 'Step-by-step guide',
    descFa: 'استایل سردبیری؛ سه راه کمک (پشتیبانی، آموزش‌ها، تالار) و آموزش‌های بعدی',
    descEn: 'Editorial style; three ways to get help and the next guides',
    doc: doc([
      ...headerOnly(),
      sec([col([w('content', {})])], { paddingY: 32 }),
      sec([col([w('heading', { level: 'h2', text: 'هنوز سؤالی دارید؟', textEn: 'Still have a question?' }, center)])], { tone: 'light', paddingY: 40 }),
      sec([
        col([w('icon-box', { icon: 'lifebuoy', title: 'پشتیبانی', titleEn: 'Support', text: 'سؤالتان را در تیکت بنویسید؛ همکاران ما پاسخ می‌دهند.', textEn: 'Write us a ticket; our team answers.', href: '/dashboard/tickets', layout: 'top' }, center)], 33),
        col([w('icon-box', { icon: 'book', title: 'آموزش‌های بیشتر', titleEn: 'More guides', text: 'همهٔ راهنماها و آموزش‌های مجله در یک‌جا.', textEn: 'Every guide in the magazine in one place.', href: '/blog', layout: 'top' }, center)], 34),
        col([w('icon-box', { icon: 'chat', title: 'تالار گفت‌وگو', titleEn: 'Forum', text: 'از تجربهٔ دیگران بپرسید و تجربهٔ خودتان را بگویید.', textEn: 'Ask others and share what you learnt.', href: '/forum', layout: 'top' }, center)], 33),
      ], { tone: 'light', paddingY: 32 }),
      ...closing('آموزش‌های بعدی', 'Next guides'),
    ], 'ps-editorial'),
  },
  {
    id: 'post-pro-feature',
    fa: 'ویژه‌نامهٔ تمام‌رنگ',
    en: 'Full-colour feature',
    descFa: 'استایل ویژه‌نامه؛ کارت رنگی با جلد شناور، متن تمام‌عرض و مطالب همین ویژه‌نامه',
    descEn: 'Spotlight style; a colour card with the cover on it, a full body and more from the feature',
    doc: doc([
      ...headerOnly(true),
      sec([col([w('content', {})])], { paddingY: 32 }),
      newsletter('accent'),
      sec([col([w('posts', { title: 'از همین ویژه‌نامه', titleEn: 'More from this feature', limit: '6', category: '' })])], { paddingY: 48 }),
      sec([col([w('post-footer', {})])], { paddingY: 48 }),
    ], 'ps-spotlight'),
  },
  {
    id: 'post-pro-newsdesk',
    fa: 'میز خبر',
    en: 'News desk',
    descFa: 'استایل روزنامه‌ای؛ خبر کنار ستون «تازه‌ترین خبرها» و عضویت در خبرنامه',
    descEn: 'Broadsheet style; the story beside the latest news and a newsletter call',
    doc: doc([
      ...headerOnly(true),
      sec([
        col([w('content', {})], 68),
        col([
          w('heading', { level: 'h3', text: 'تازه‌ترین خبرها', textEn: 'Latest news' }),
          w('posts', { title: '', titleEn: '', limit: '6', category: '' }),
          w('cta', { title: 'خبرنامهٔ روزانه', titleEn: 'Daily briefing', text: 'مهم‌ترین خبرها، هر صبح.', textEn: 'The news that matters, every morning.', label: 'عضویت', labelEn: 'Subscribe', href: '/newsletter' }),
        ], 32),
      ], { paddingY: 36, valign: 'start' }),
      sec([col([w('post-footer', {})])], { paddingY: 48 }),
    ], 'ps-paper'),
  },
  {
    id: 'post-pro-tech',
    fa: 'بررسی فناوری و محصول',
    en: 'Tech & product review',
    descFa: 'استایل نئون؛ بررسی کنار محصولات مرتبط فروشگاه و بررسی‌های دیگر',
    descEn: 'Neon style; the review beside related products and more reviews',
    doc: doc([
      ...headerOnly(true),
      sec([
        col([w('content', {})], 66),
        col([
          w('products', { title: 'محصولات مرتبط', titleEn: 'Related products', limit: '3', category: '', kind: '' }),
          w('button', { label: 'رفتن به فروشگاه', labelEn: 'Visit the shop', href: '/products', variant: 'primary', secondaryLabel: '', secondaryLabelEn: '', secondaryHref: '' }, center),
        ], 34),
      ], { paddingY: 40, valign: 'start' }),
      ...closing('بررسی‌های دیگر', 'More reviews'),
    ], 'ps-neon'),
  },
  {
    id: 'post-pro-portrait',
    fa: 'پرتره و گفت‌وگو',
    en: 'Portrait & interview',
    descFa: 'استایل قاب لوکس؛ جلد عمودی در قاب و گفت‌وگوهای دیگر',
    descEn: 'Luxe frame style; a portrait cover, more interviews',
    doc: doc([
      ...headerOnly(),
      sec([col([w('content', {})])], { paddingY: 32 }),
      ...closing('گفت‌وگوهای دیگر', 'More interviews'),
    ], 'ps-frame'),
  },
  {
    id: 'post-pro-story',
    fa: 'روایت شفق',
    en: 'Aurora story',
    descFa: 'استایل شفق؛ نورهای رنگی پشت تیتر، دعوت رنگی و روایت‌های دیگر',
    descEn: 'Aurora style; colour lights behind the title, more stories',
    doc: doc([
      ...headerOnly(),
      sec([col([w('content', {})])], { paddingY: 32 }),
      newsletter('accent'),
      ...closing('روایت‌های دیگر', 'More stories'),
    ], 'ps-aurora'),
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

/** A section that a link on the same page can jump to (#order, #faq). */
const anchored = (anchor: string, section: BuilderSection): BuilderSection => ({ ...section, anchor })

/**
 * Whole pages to start from (owner, 2026-10-28: "design any page with ready blocks, no code — e.g. a foreign payment
 * page with a professional order form"). Every part stays a normal block to edit, move or delete. A form block names a
 * form of «فرم‌ها و پاسخ‌ها» by its address; the builder makes a missing one from the form builder's template, as a draft.
 */
export const PAGE_TEMPLATES: BundledTemplate[] = [
  {
    id: 'page-foreign-payment',
    fa: 'صفحهٔ پرداخت سایت خارجی',
    en: 'Foreign site payment page',
    descFa: 'معرفی خدمت، سه مزیت، مراحل کار، فرم سفارش با محاسبهٔ نرخ روز، پرسش‌ها و دعوت پایانی',
    descEn: 'Service intro, three benefits, steps, an order form priced at the day rate, questions and a closing call',
    doc: doc([
      sec([col([
        w('hero', { eyebrow: 'خدمات ارزی موبوکام', eyebrowEn: 'MoboCom currency services', title: 'پرداخت در هر سایت خارجی، بدون کارت بین‌المللی', titleEn: 'Pay any foreign website without an international card', text: 'اشتراک، دامنه و هاست، ثبت‌نام آزمون، خرید اپلیکیشن یا هر پرداخت دیگری؛ مبلغ دلاری یا یورویی را وارد کنید، مبلغ تومانی را با نرخ روز ببینید و سفارش را ثبت کنید.', textEn: 'Subscriptions, domains, exam fees or app purchases: enter the amount in USD or EUR, see it in toman at the day rate and place the order.', label: 'ثبت سفارش پرداخت', labelEn: 'Place an order', href: '#order', secondaryLabel: 'پرسش‌های پرتکرار', secondaryLabelEn: 'Questions', secondaryHref: '#faq' }),
      ])], { paddingY: 64 }),
      sec([
        col([w('icon-box', { icon: 'wallet', title: 'محاسبهٔ شفاف', titleEn: 'Clear pricing', text: 'مبلغ تومانی با نرخ روز و کارمزد مشخص، پیش از پرداخت روبه‌روی شماست؛ هزینهٔ پنهانی در کار نیست.', textEn: 'The toman amount at the day rate and a stated fee is shown before you pay.', layout: 'top' }, center)], 33.34),
        col([w('icon-box', { icon: 'bolt', title: 'انجام سریع', titleEn: 'Done fast', text: 'سفارش‌ها در ساعت کاری و به ترتیب ثبت انجام می‌شوند و نتیجه در حساب کاربری شما ثبت می‌شود.', textEn: 'Orders are done in working hours, in the order received, with the result in your account.', layout: 'top' }, center)], 33.33),
        col([w('icon-box', { icon: 'chat', title: 'پیگیری و پشتیبانی', titleEn: 'Follow-up and support', text: 'از ثبت سفارش تا انجام پرداخت، وضعیت را در حساب کاربری ببینید و از مرکز پشتیبانی بپرسید.', textEn: 'See the status in your account and ask the support centre at any step.', layout: 'top' }, center)], 33.33),
      ], { paddingY: 48 }),
      sec([col([
        w('heading', { level: 'h2', text: 'چطور کار می‌کند؟', textEn: 'How it works' }, center),
        w('list', { items: items([
          { icon: '۱', title: 'مبلغ و سایت را وارد کنید', titleEn: 'Enter the amount and site', text: 'نشانی سایت، مبلغ ارزی و توضیح خرید را در فرم سفارش بنویسید.', textEn: 'Write the site, the foreign amount and what you are buying.' },
          { icon: '۲', title: 'مبلغ تومانی را ببینید', titleEn: 'See the toman amount', text: 'فرم مبلغ قابل پرداخت را با نرخ روز و کارمزد محاسبه می‌کند.', textEn: 'The form works out the amount at the day rate plus the fee.' },
          { icon: '۳', title: 'پرداخت کنید', titleEn: 'Pay', text: 'از درگاه بانکی یا کیف پول پرداخت کنید؛ سفارش پس از پرداخت ثبت می‌شود.', textEn: 'Pay by bank gateway or wallet; the order is placed once paid.' },
          { icon: '۴', title: 'نتیجه را دریافت کنید', titleEn: 'Get the result', text: 'پس از انجام پرداخت در سایت مقصد، نتیجه در حساب کاربری شما ثبت می‌شود.', textEn: 'Once paid on the site, the result appears in your account.' },
        ]) }),
      ])], { tone: 'light', paddingY: 64 }),
      anchored('order', sec([
        col([w('form', { title: 'فرم سفارش پرداخت', titleEn: 'Payment order form', slug: 'foreign-payment' })], 62),
        col([
          w('heading', { level: 'h3', text: 'پیش از سفارش بدانید', textEn: 'Before you order' }),
          w('text', { html: '<ul><li>اطلاعات سایت مقصد و مبلغ را دقیق وارد کنید؛ پرداخت با اطلاعات نادرست قابل بازگشت نیست.</li><li>قوانین سایت مقصد را بخوانید؛ فروشنده و مسئول کالا یا خدمت، همان سایت است.</li><li>اگر سایت مقصد یا بانک پرداخت را رد کند و پرداخت انجام نشود، مبلغ شما بازگردانده می‌شود.</li><li>از پرداخت برای موارد غیرقانونی یا قمار خودداری می‌شود.</li></ul><p><a href="/p/terms">قوانین و شرایط کامل</a></p>', htmlEn: '<ul><li>Enter the site and amount exactly; a payment made with wrong details cannot be returned.</li><li>The destination site is the seller; read its rules.</li><li>If the site or bank refuses and nothing is paid, your money is returned.</li></ul>' }),
        ], 38),
      ], { paddingY: 72 })),
      anchored('faq', sec([col([
        w('faq', { title: 'پرسش‌های پرتکرار', titleEn: 'Frequently asked', items: items([
          { q: 'مبلغ تومانی چطور حساب می‌شود؟', qEn: 'How is the toman amount worked out?', a: 'مبلغ ارزی با نرخ روز به تومان تبدیل می‌شود و کارمزد اعلام‌شده به آن اضافه می‌شود. همان مبلغی که پیش از پرداخت می‌بینید، مبلغ نهایی است.', aEn: 'The amount is converted at the day rate and the stated fee is added; what you see before paying is final.' },
          { q: 'چه مدت طول می‌کشد؟', qEn: 'How long does it take?', a: 'سفارش‌ها در ساعت کاری و به ترتیب ثبت انجام می‌شوند. زمان دقیق به سایت مقصد و حجم سفارش‌ها بستگی دارد.', aEn: 'Orders are done in working hours, in the order received; timing depends on the site.' },
          { q: 'اگر سایت مقصد پرداخت را نپذیرد چه می‌شود؟', qEn: 'What if the site refuses the payment?', a: 'اگر پرداخت انجام نشود، مبلغ پرداختی شما طبق قوانین و شرایط بازگردانده می‌شود. پس از انجام موفق پرداخت، بازگرداندن وجه تابع قوانین سایت مقصد است.', aEn: 'If nothing is paid, your money is returned as the terms say; after a successful payment, refunds follow the site rules.' },
          { q: 'برای چه سایت‌هایی می‌شود پرداخت کرد؟', qEn: 'Which sites can I pay?', a: 'بیشتر سایت‌هایی که با ویزا یا مستر کارت پرداخت می‌گیرند. پرداخت برای موارد غیرقانونی، قمار یا خدمات تحریمی انجام نمی‌شود.', aEn: 'Most sites that take Visa or Mastercard; nothing illegal, gambling or sanctioned.' },
          { q: 'اطلاعات حساب من کجا نگهداری می‌شود؟', qEn: 'Where is my account information kept?', a: 'اطلاعاتی که برای انجام سفارش می‌دهید رمزگذاری‌شده نگهداری و پس از انجام سفارش در مهلت اعلام‌شده پاک می‌شود.', aEn: 'What you give us for the order is kept encrypted and erased after the stated period.' },
        ]) }),
      ])], { paddingY: 64 })),
      sec([col([
        w('cta', { title: 'سؤالی پیش از سفارش دارید؟', titleEn: 'A question before ordering?', text: 'تیم پشتیبانی موبوکام پیش از ثبت سفارش راهنمایی‌تان می‌کند.', textEn: 'MoboCom support will help before you order.', label: 'تماس با ما', labelEn: 'Contact us', href: '/p/contact' }),
      ])], { tone: 'accent', paddingY: 56 }),
    ]),
  },
  {
    id: 'page-service',
    fa: 'صفحهٔ معرفی خدمت',
    en: 'Service page',
    descFa: 'سرصفحه دو ستونه، شش ویژگی، آمار، نظر مشتریان، پلن‌ها، پرسش‌ها و دعوت پایانی',
    descEn: 'Split hero, six features, figures, testimonials, plans, questions and a closing call',
    doc: doc([
      sec([col([
        w('heading', { level: 'h1', text: 'خدمتی که کار شما را ساده می‌کند', textEn: 'A service that makes your work simple' }),
        w('text', { html: '<p>در یک جمله بگویید این خدمت چه مشکلی را حل می‌کند و چرا انتخاب شما همین است.</p>', htmlEn: '<p>Say in one sentence what this service solves and why it is the one to choose.</p>' }),
        w('button', { label: 'شروع کنید', labelEn: 'Get started', href: '#plans', variant: 'primary', secondaryLabel: 'بیشتر بدانید', secondaryLabelEn: 'Learn more', secondaryHref: '#features' }),
      ], 56), col([w('image', { src: '', alt: 'تصویر خدمت' }, { radius: 24 })], 44)], { paddingY: 88 }),
      anchored('features', sec([
        col([w('icon-box', { icon: 'bolt', title: 'سریع', titleEn: 'Fast', text: 'ویژگی اول را کوتاه و روشن بنویسید.', textEn: 'Describe the first feature.' }), w('icon-box', { icon: 'shield', title: 'امن', titleEn: 'Secure', text: 'ویژگی چهارم را کوتاه و روشن بنویسید.', textEn: 'Describe the fourth feature.' })], 33.34),
        col([w('icon-box', { icon: 'star', title: 'باکیفیت', titleEn: 'Quality', text: 'ویژگی دوم را کوتاه و روشن بنویسید.', textEn: 'Describe the second feature.' }), w('icon-box', { icon: 'chat', title: 'پشتیبانی', titleEn: 'Support', text: 'ویژگی پنجم را کوتاه و روشن بنویسید.', textEn: 'Describe the fifth feature.' })], 33.33),
        col([w('icon-box', { icon: 'wallet', title: 'مقرون‌به‌صرفه', titleEn: 'Affordable', text: 'ویژگی سوم را کوتاه و روشن بنویسید.', textEn: 'Describe the third feature.' }), w('icon-box', { icon: 'globe', title: 'همه‌جا', titleEn: 'Everywhere', text: 'ویژگی ششم را کوتاه و روشن بنویسید.', textEn: 'Describe the sixth feature.' })], 33.33),
      ], { paddingY: 64 })),
      sec([col([w('counters', { items: items([{ value: '1200', suffix: '+', label: 'سفارش انجام‌شده', labelEn: 'Orders done' }, { value: '98', suffix: '٪', label: 'رضایت مشتریان', labelEn: 'Satisfaction' }, { value: '24', suffix: '/7', label: 'پشتیبانی', labelEn: 'Support' }]) }, center)])], { tone: 'dark', paddingY: 56 }),
      sec([col([w('testimonials', { title: 'مشتریان چه می‌گویند', titleEn: 'What customers say', items: items([{ quote: 'نظر واقعی یک مشتری را اینجا بگذارید.', name: 'نام مشتری', role: 'سمت یا شهر' }, { quote: 'نظر واقعی یک مشتری دیگر را اینجا بگذارید.', name: 'نام مشتری', role: 'سمت یا شهر' }]) })])], { paddingY: 64 }),
      anchored('plans', sec([col([w('pricing', { title: 'پلن‌ها', titleEn: 'Plans', items: items([
        { title: 'پایه', price: '۲۹۰٬۰۰۰', period: 'تومان', features: 'ویژگی اول\nویژگی دوم', href: '/products' },
        { title: 'حرفه‌ای', price: '۴۹۰٬۰۰۰', period: 'تومان', features: 'همهٔ ویژگی‌های پایه\nویژگی سوم\nویژگی چهارم', href: '/products', featured: '1' },
        { title: 'سازمانی', price: 'تماس بگیرید', period: '', features: 'نیاز ویژه\nپشتیبانی اختصاصی', href: '/p/contact' },
      ]) })])], { tone: 'light', paddingY: 64 })),
      sec([col([w('faq', { title: 'پرسش‌های پرتکرار', titleEn: 'Questions', items: items([{ q: 'پرسش اول؟', a: 'پاسخ روشن و کوتاه.' }, { q: 'پرسش دوم؟', a: 'پاسخ روشن و کوتاه.' }, { q: 'پرسش سوم؟', a: 'پاسخ روشن و کوتاه.' }]) })])], { paddingY: 56 }),
      sec([col([w('cta', { title: 'آماده‌اید شروع کنید؟', titleEn: 'Ready to start?', text: 'یک جملهٔ دعوت کوتاه بنویسید.', textEn: 'A short invitation.', label: 'شروع کنید', labelEn: 'Start', href: '#plans' })])], { tone: 'accent', paddingY: 56 }),
    ]),
  },
  {
    id: 'page-campaign',
    fa: 'کمپین و فروش ویژه',
    en: 'Campaign and sale',
    descFa: 'سرصفحه پررنگ، شمارش معکوس، محصولات منتخب، سه مزیت و دعوت پایانی',
    descEn: 'Bold hero, countdown, selected products, three benefits and a closing call',
    doc: doc([
      sec([col([
        w('heading', { level: 'h1', text: 'فروش ویژهٔ موبوکام', textEn: 'MoboCom special sale' }, center),
        w('text', { html: '<p>تخفیف‌های محدود روی محصولات منتخب؛ تا پایان زمان کمپین فرصت دارید.</p>', htmlEn: '<p>Limited discounts on selected products until the campaign ends.</p>' }, center),
        w('countdown', { until: '', title: 'تا پایان کمپین', titleEn: 'Until the campaign ends', done: 'کمپین به پایان رسید', doneEn: 'The campaign has ended' }, center),
        w('button', { label: 'دیدن محصولات', labelEn: 'See the products', href: '#products', variant: 'primary' }, center),
      ])], { tone: 'accent', paddingY: 96 }),
      anchored('products', sec([col([w('products', { title: 'محصولات منتخب', titleEn: 'Selected products', limit: '8' })])], { paddingY: 64 })),
      sec([
        col([w('icon-box', { icon: 'tag', title: 'تخفیف واقعی', titleEn: 'Real discount', text: 'قیمت پیش و پس از تخفیف روشن نمایش داده می‌شود.', textEn: 'Prices before and after are shown.', layout: 'top' }, center)], 33.34),
        col([w('icon-box', { icon: 'bolt', title: 'تحویل سریع', titleEn: 'Fast delivery', text: 'محصولات دیجیتال پس از پرداخت تحویل می‌شوند.', textEn: 'Digital products are delivered after payment.', layout: 'top' }, center)], 33.33),
        col([w('icon-box', { icon: 'chat', title: 'پشتیبانی', titleEn: 'Support', text: 'پیش و پس از خرید کنار شما هستیم.', textEn: 'We are here before and after you buy.', layout: 'top' }, center)], 33.33),
      ], { tone: 'light', paddingY: 56 }),
      sec([col([w('cta', { title: 'فرصت محدود است', titleEn: 'Time is limited', text: 'پیش از پایان کمپین خرید کنید.', textEn: 'Buy before the campaign ends.', label: 'رفتن به فروشگاه', labelEn: 'Go to the shop', href: '/products' })])], { paddingY: 56 }),
    ]),
  },
]
