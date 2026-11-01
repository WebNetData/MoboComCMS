import { local as L, type SiteConfig, type SiteSection, type SectionKind, type ContentItem } from './types'
const item = (fa: string, en: string, text: string, english: string, icon: string, href = ''): ContentItem => ({ title: L(fa, en), text: L(text, english), icon, href })
const section = (kind: SectionKind, eyebrow: string, eyebrowEn: string, title: string, titleEn: string, description: string, descriptionEn: string, items: ContentItem[] = []): SiteSection => ({ id: kind, kind, enabled: true, eyebrow: L(eyebrow, eyebrowEn), title: L(title, titleEn), description: L(description, descriptionEn), items, action: { label: L('بیشتر ببینید', 'Explore more'), href: '/plans' }, formSlug: '' })

export const defaultSite: SiteConfig = {
  version: 1, brand: 'موبوکام', tagline: L('فروشگاه و سرگرمی دیجیتال', 'Digital store & entertainment'),
  announcement: { enabled: true, text: L('با اشتراک ویژهٔ موبوکام، تخفیف فروشگاه و محتوای اختصاصی بگیرید', 'MoboCom VIP: store discounts and members-only content'), link: { label: L('اشتراک ویژه', 'VIP membership'), href: '/vip' } },
  navigation: [
    { label: L('خانه', 'Home'), href: '/', icon: 'home', menuDisplay: 'mega', menuColumns: 3, children: [{ label: L('درباره ما', 'About us'), href: '/p/about', icon: 'book' }, { label: L('تماس با ما', 'Contact us'), href: '/p/contact', icon: 'chat' }] }, { label: L('فروشگاه', 'Shop'), href: '/products' }, { label: L('مجله', 'Magazine'), href: '/blog' },
    { label: L('موزیک', 'Music'), href: '/music' }, { label: L('فیلم و سریال', 'Movies & series'), href: '/cinema' }, { label: L('بازی', 'Games'), href: '/games' },
    { label: L('نرم‌افزار', 'Software'), href: '/software' }, { label: L('تالار گفتمان', 'Forum'), href: '/forum' }, { label: L('هنرمندان', 'Artists'), href: '/celebrities', icon: 'users' }, { label: L('کسب‌وکارها', 'Businesses'), href: '/businesses', icon: 'globe' }, { label: L('پرامپت مستر', 'Prompt Master'), href: '/prompts', icon: 'sparkles' }, { label: L('اشتراک ویژه', 'VIP'), href: '/vip' },
  ],
  footer: [ { label: L('درباره موبوکام', 'About MoboCom'), href: '/#about' }, { label: L('مرکز پشتیبانی', 'Support center'), href: '/dashboard/tickets' }, { label: L('سوالات متداول', 'FAQ'), href: '/#faq' }, { label: L('حساب کاربری', 'My account'), href: '/dashboard' } ],
  copyright: L('موبوکام؛ خرید، سرگرمی و گفت‌وگو در یک‌جا.', 'MoboCom: shopping, entertainment and community in one place.'), themeId: 'mobocom', themes: [], plugins: { 'announcement': true },
  sections: [
    { ...section('hero', 'فروشگاه و سرگرمی دیجیتال', 'DIGITAL STORE & ENTERTAINMENT', 'هر آنچه دنیای دیجیتالت\nنیاز دارد، یک‌جا.', 'Everything your digital life needs,\nin one place.', 'از خرید کالای فیزیکی و محصولات مجازی تا موزیک، فیلم، بازی و نرم‌افزار؛ موبوکام همراه هر روز شماست.', 'From physical goods and digital products to music, movies, games and software — MoboCom is with you every day.', [item('ارسال مطمئن', 'Reliable delivery', 'کالای فیزیکی با بسته‌بندی و پیگیری', 'Physical goods, tracked', 'devices'), item('تحویل آنی', 'Instant delivery', 'محصولات مجازی بلافاصله بعد از پرداخت', 'Digital products right after payment', 'bolt'), item('پشتیبانی واقعی', 'Real support', 'تیکت و گفت‌وگو با تیم موبوکام', 'Tickets and chat with our team', 'chat')]), action: { label: L('ورود به فروشگاه', 'Visit the shop'), href: '/products' } },
    section('services', 'همه‌چیز در موبوکام', 'EVERYTHING AT MOBOCOM', 'یک حساب، همهٔ بخش‌ها', 'One account, every section', 'با یک حساب کاربری از فروشگاه، مجله، سرگرمی و انجمن استفاده کنید.', 'Use the shop, magazine, entertainment and forum with one account.', [
      item('فروشگاه', 'Shop', 'کالای فیزیکی و محصولات مجازی', 'Physical and digital products', 'grid', '/products'),
      item('مجلهٔ موبوکام', 'Magazine', 'خبر، آموزش و بررسی', 'News, guides and reviews', 'sliders', '/blog'),
      item('موزیک', 'Music', 'آلبوم، تک‌آهنگ و پلی‌لیست', 'Albums, singles and playlists', 'sparkles', '/music'),
      item('فیلم و سریال', 'Movies & series', 'دانلود با کیفیت‌های مختلف و زیرنویس', 'Downloads in every quality, with subtitles', 'globe', '/cinema'),
      item('بازی', 'Games', 'معرفی، نقد و لینک دانلود', 'Reviews, requirements and downloads', 'bolt', '/games'),
      item('دانلود نرم‌افزار', 'Software', 'نرم‌افزار ویندوز، مک، اندروید و iOS', 'Apps for Windows, macOS, Android and iOS', 'devices', '/software'),
      item('تالار گفتمان', 'Forum', 'پرسش، پاسخ و گفت‌وگو با کاربران', 'Ask, answer and talk with the community', 'chat', '/forum'),
      item('اشتراک ویژه', 'VIP membership', 'تخفیف فروشگاه و محتوای اختصاصی', 'Store discounts and members-only content', 'shield', '/vip'),
    ]),
    section('products', 'پیشنهادهای فروشگاه', 'FROM THE SHOP', 'تازه‌ترین محصولات', 'New in the shop', 'محصولات منتخب فیزیکی و مجازی موبوکام.', 'Hand-picked physical and digital products.'),
    section('showcase', 'سرگرمی و انجمن', 'ENTERTAINMENT & COMMUNITY', 'تازه‌های موبوکام', 'Fresh on MoboCom', 'جدیدترین موزیک‌ها، فیلم‌ها، بازی‌ها، نرم‌افزارها و گفت‌وگوهای انجمن.', 'The latest music, movies, games, software and forum threads.'),
    { ...section('features', 'چرا موبوکام؟', 'WHY MOBOCOM', 'خرید مطمئن، تجربهٔ ساده', 'Shop with confidence', 'موبوکام یک فروشگاه و مجموعهٔ سرگرمی دیجیتال است که روی اعتماد و سادگی ساخته شده.', 'A digital store and entertainment hub built on trust and simplicity.', [item('پرداخت امن', 'Secure payment', 'درگاه‌های معتبر، کیف پول و فاکتور رسمی', 'Trusted gateways, wallet and invoices', 'wallet'), item('ضمانت اصالت', 'Genuine products', 'کالا و لایسنس اصل با پشتیبانی پس از فروش', 'Genuine goods and licenses with after-sales support', 'shield'), item('تحویل سریع', 'Fast delivery', 'ارسال کالا و تحویل آنی محصولات مجازی', 'Shipping and instant digital delivery', 'bolt'), item('همراه شما', 'Always with you', 'پنل کاربری، مینی‌اپ تلگرام و پشتیبانی', 'Dashboard, Telegram mini app and support', 'devices')]), id: 'about' },
    section('posts', 'مجلهٔ موبوکام', 'MOBOCOM MAGAZINE', 'بخوانید و بیشتر بدانید', 'Read and learn more', 'خبر، آموزش و بررسی‌های تازه از دنیای تکنولوژی و سرگرمی.', 'Fresh news, guides and reviews from tech and entertainment.'),
    section('faq', 'پرسش‌های پرتکرار', 'FREQUENTLY ASKED', 'سؤالی دارید؟', 'Questions?', 'اگر پاسخ خود را پیدا نکردید، از پنل کاربری تیکت ثبت کنید.', 'If you cannot find an answer, open a ticket from your dashboard.', [
      item('محصولات مجازی چطور تحویل داده می‌شوند؟', 'How are digital products delivered?', 'بلافاصله بعد از پرداخت، در بخش «سفارش‌ها»ی پنل کاربری و ایمیل شما.', 'Right after payment, in your dashboard orders and by email.', 'bolt'),
      item('ارسال کالای فیزیکی چقدر طول می‌کشد؟', 'How long does shipping take?', 'زمان ارسال در صفحهٔ هر محصول آمده و کد رهگیری در پنل نمایش داده می‌شود.', 'Each product lists its shipping time; tracking appears in your dashboard.', 'devices'),
      item('اشتراک ویژه چه مزایایی دارد؟', 'What does VIP include?', 'تخفیف اختصاصی فروشگاه و دسترسی به محتوای ویژهٔ موزیک، فیلم، بازی، نرم‌افزار و انجمن.', 'Member prices in the shop and access to members-only music, movies, games, software and forum.', 'shield'),
      item('چطور با پشتیبانی در تماس باشم؟', 'How do I reach support?', 'از بخش تیکت‌های پنل کاربری یا دکمهٔ پشتیبانی پایین صفحه.', 'From dashboard tickets or the support button on every page.', 'chat'),
    ]),
    { ...section('cta', 'اشتراک ویژهٔ موبوکام', 'MOBOCOM VIP', 'بیشتر ببینید، کمتر بپردازید.', 'See more, pay less.', 'با اشتراک ویژه از تخفیف فروشگاه و محتوای اختصاصی همهٔ بخش‌ها استفاده کنید.', 'Get store discounts and members-only content across MoboCom.'), action: { label: L('عضویت ویژه', 'Become a member'), href: '/vip' } },
  ],
}
