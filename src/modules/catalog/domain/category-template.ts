/**
 * A ready category tree for both halves of the shop (owner, 2026-10-27: "many categories and sub-categories, fully
 * professional"). The owner builds it from Admin in one step; a category whose address (slug) already exists is kept
 * where it is and its missing children are added under it, so the step is safe to repeat and never moves or renames
 * the owner's own categories. Everything it creates is an ordinary category the owner edits or deletes afterwards.
 */

export type TemplateNode = { slug: string; name: string; nameEn: string; description?: string; children?: TemplateNode[] }
export type TemplateRoot = TemplateNode & { kind: 'VIRTUAL' | 'PHYSICAL' }

const n = (slug: string, name: string, nameEn: string, children?: TemplateNode[], description?: string): TemplateNode => ({ slug, name, nameEn, ...(children ? { children } : {}), ...(description ? { description } : {}) })

export const CATEGORY_TEMPLATE: TemplateRoot[] = [
  // ---------------------------------------------------------------- digital products
  { kind: 'VIRTUAL', ...n('gift-cards', 'گیفت کارت', 'Gift cards', [
    n('gift-apple', 'اپل و آیتونز', 'Apple & iTunes'),
    n('gift-google-play', 'گوگل پلی', 'Google Play'),
    n('gift-steam', 'استیم', 'Steam'),
    n('gift-playstation', 'پلی‌استیشن', 'PlayStation'),
    n('gift-xbox', 'ایکس‌باکس', 'Xbox'),
    n('gift-amazon', 'آمازون', 'Amazon'),
    n('gift-netflix', 'نتفلیکس', 'Netflix'),
  ], 'گیفت کارت اورجینال اپل، گوگل پلی، استیم، پلی‌استیشن، ایکس‌باکس و آمازون با تحویل آنلاین.') },
  { kind: 'VIRTUAL', ...n('subscriptions', 'اشتراک و اکانت پریمیوم', 'Premium subscriptions', [
    n('ai', 'هوش مصنوعی', 'AI', [
      n('ai-chatgpt', 'ChatGPT', 'ChatGPT'),
      n('ai-claude', 'Claude', 'Claude'),
      n('ai-gemini', 'Gemini', 'Gemini'),
      n('ai-midjourney', 'Midjourney', 'Midjourney'),
    ]),
    n('streaming', 'فیلم و سریال', 'Video streaming', [
      n('stream-netflix', 'نتفلیکس', 'Netflix'),
      n('stream-youtube', 'یوتیوب پریمیوم', 'YouTube Premium'),
      n('stream-disney', 'دیزنی پلاس', 'Disney+'),
    ]),
    n('music-streaming', 'موسیقی', 'Music streaming', [
      n('music-spotify', 'اسپاتیفای', 'Spotify'),
      n('music-apple', 'اپل موزیک', 'Apple Music'),
    ]),
    n('telegram-premium', 'تلگرام پریمیوم', 'Telegram Premium'),
    n('design-tools', 'ابزار طراحی و تولید محتوا', 'Design & content tools'),
  ], 'اکانت و اشتراک پریمیوم هوش مصنوعی، فیلم و سریال، موسیقی و ابزار طراحی، روی حساب شما یا اختصاصی.') },
  { kind: 'VIRTUAL', ...n('software-licenses', 'لایسنس نرم‌افزار', 'Software licences', [
    n('lic-windows', 'ویندوز', 'Windows'),
    n('lic-office', 'آفیس', 'Office'),
    n('lic-antivirus', 'آنتی‌ویروس و امنیت', 'Antivirus & security'),
    n('lic-creative', 'گرافیک و تدوین', 'Graphics & video editing'),
    n('lic-dev', 'ابزار برنامه‌نویسی', 'Developer tools'),
  ], 'لایسنس اورجینال ویندوز، آفیس، آنتی‌ویروس و نرم‌افزارهای حرفه‌ای با فعال‌سازی تضمینی.') },
  { kind: 'VIRTUAL', ...n('digital-games', 'بازی دیجیتال', 'Digital games', [
    n('game-pc', 'بازی کامپیوتر', 'PC games'),
    n('game-ps', 'بازی پلی‌استیشن', 'PlayStation games'),
    n('game-xbox', 'بازی ایکس‌باکس', 'Xbox games'),
    n('game-passes', 'اشتراک بازی', 'Game subscriptions'),
    n('game-currency', 'ارز و آیتم بازی', 'In-game currency'),
  ], 'بازی و اشتراک دیجیتال کامپیوتر و کنسول، ارز و آیتم بازی‌های آنلاین.') },
  { kind: 'VIRTUAL', ...n('payment-services', 'خدمات پرداخت ارزی', 'Foreign payment services', [
    n('pay-foreign', 'پرداخت سایت خارجی', 'Foreign site payment'),
    n('virtual-cards', 'کارت مجازی ویزا و مستر', 'Virtual Visa & Mastercard'),
    n('account-topup', 'شارژ حساب و کیف پول خارجی', 'Foreign account top-up'),
    n('signup-verify', 'ثبت‌نام و احراز هویت', 'Sign-up & verification'),
  ], 'پرداخت در سایت‌های خارجی، کارت مجازی و شارژ حساب‌های بین‌المللی با نرخ روز.') },
  { kind: 'VIRTUAL', ...n('tech-services', 'خدمات فنی آنلاین', 'Online tech services', [
    n('remote-support', 'پشتیبانی از راه دور', 'Remote support'),
    n('setup-install', 'نصب و راه‌اندازی', 'Setup & installation'),
  ], 'نصب، راه‌اندازی و پشتیبانی فنی از راه دور توسط کارشناس.') },

  // ---------------------------------------------------------------- physical goods
  { kind: 'PHYSICAL', ...n('mobile', 'موبایل و تبلت', 'Mobile & tablets', [
    n('phones', 'گوشی موبایل', 'Mobile phones'),
    n('tablets', 'تبلت', 'Tablets'),
    n('mobile-accessories', 'لوازم جانبی موبایل', 'Mobile accessories', [
      n('cases-glass', 'قاب و محافظ صفحه', 'Cases & screen protectors'),
      n('chargers-cables', 'شارژر و کابل', 'Chargers & cables'),
      n('power-banks', 'پاوربانک', 'Power banks'),
      n('car-holders', 'پایه و هولدر', 'Holders & mounts'),
    ]),
  ], 'گوشی موبایل، تبلت و لوازم جانبی اصل با گارانتی و ارسال سریع.') },
  { kind: 'PHYSICAL', ...n('computers', 'لپ‌تاپ و کامپیوتر', 'Laptops & computers', [
    n('laptops', 'لپ‌تاپ', 'Laptops'),
    n('desktops', 'کامپیوتر رومیزی و آل‌این‌وان', 'Desktops & all-in-ones'),
    n('monitors', 'مانیتور', 'Monitors'),
    n('pc-parts', 'قطعات کامپیوتر', 'PC components', [
      n('cpus', 'پردازنده', 'Processors'),
      n('graphics-cards', 'کارت گرافیک', 'Graphics cards'),
      n('ram', 'رم', 'Memory (RAM)'),
      n('ssd-hdd', 'حافظه SSD و هارد', 'SSD & hard drives'),
      n('motherboards', 'مادربرد', 'Motherboards'),
      n('psu-cases', 'پاور و کیس', 'Power supplies & cases'),
    ]),
    n('keyboards-mice', 'کیبورد و ماوس', 'Keyboards & mice'),
    n('printers', 'پرینتر و اسکنر', 'Printers & scanners'),
  ], 'لپ‌تاپ، کامپیوتر، مانیتور و قطعات سخت‌افزاری با ضمانت اصالت.') },
  { kind: 'PHYSICAL', ...n('network', 'شبکه و اینترنت', 'Networking', [
    n('routers', 'مودم و روتر', 'Modems & routers'),
    n('switches', 'سوییچ شبکه', 'Network switches'),
    n('access-points', 'اکسس پوینت و تقویت‌کننده', 'Access points & extenders'),
    n('network-adapters', 'کارت شبکه و دانگل', 'Network adapters'),
    n('network-cables', 'کابل و تجهیزات شبکه', 'Cables & accessories'),
  ], 'مودم، روتر، سوییچ و تجهیزات شبکهٔ خانگی و اداری.') },
  { kind: 'PHYSICAL', ...n('audio-video', 'صوتی و تصویری', 'Audio & video', [
    n('headphones', 'هدفون و هدست', 'Headphones & headsets'),
    n('earbuds', 'هندزفری بی‌سیم', 'Wireless earbuds'),
    n('speakers', 'اسپیکر', 'Speakers'),
    n('microphones', 'میکروفون', 'Microphones'),
    n('webcams', 'وب‌کم', 'Webcams'),
    n('tv-boxes', 'تلویزیون و اندروید باکس', 'TVs & streaming boxes'),
  ], 'هدفون، اسپیکر، میکروفون و تجهیزات صوتی و تصویری.') },
  { kind: 'PHYSICAL', ...n('gaming-gear', 'گیمینگ', 'Gaming gear', [
    n('consoles', 'کنسول بازی', 'Consoles'),
    n('controllers', 'دسته بازی', 'Controllers'),
    n('gaming-headsets', 'هدست گیمینگ', 'Gaming headsets'),
    n('gaming-chairs', 'صندلی و میز گیمینگ', 'Gaming chairs & desks'),
    n('vr', 'واقعیت مجازی', 'Virtual reality'),
  ], 'کنسول، دسته، هدست و تجهیزات حرفه‌ای گیمینگ.') },
  { kind: 'PHYSICAL', ...n('smart-gadgets', 'گجت و خانهٔ هوشمند', 'Smart gadgets & home', [
    n('smartwatches', 'ساعت هوشمند', 'Smartwatches'),
    n('fitness-bands', 'مچ‌بند هوشمند', 'Fitness bands'),
    n('smart-home', 'خانهٔ هوشمند', 'Smart home'),
    n('cameras-drones', 'دوربین و پهپاد', 'Cameras & drones'),
  ], 'ساعت و مچ‌بند هوشمند، تجهیزات خانهٔ هوشمند، دوربین و پهپاد.') },
  { kind: 'PHYSICAL', ...n('storage-media', 'حافظه و ذخیره‌سازی', 'Storage', [
    n('flash-drives', 'فلش مموری', 'Flash drives'),
    n('memory-cards', 'کارت حافظه', 'Memory cards'),
    n('external-drives', 'هارد اکسترنال', 'External drives'),
  ], 'فلش مموری، کارت حافظه و هارد اکسترنال با ظرفیت‌های مختلف.') },
]

/** Every category of the template with its parent's slug, depth-first in the order it is built. */
export function templateRows(roots: TemplateRoot[] = CATEGORY_TEMPLATE) {
  const rows: { slug: string; name: string; nameEn: string; description: string; parent: string; kind: 'VIRTUAL' | 'PHYSICAL'; order: number }[] = []
  const walk = (node: TemplateNode, parent: string, kind: 'VIRTUAL' | 'PHYSICAL', order: number) => {
    rows.push({ slug: node.slug, name: node.name, nameEn: node.nameEn, description: node.description || '', parent, kind, order })
    node.children?.forEach((child, index) => walk(child, node.slug, kind, (index + 1) * 10))
  }
  roots.forEach((root, index) => walk(root, '', root.kind, (index + 1) * 10))
  return rows
}
