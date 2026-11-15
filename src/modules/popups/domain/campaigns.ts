import { customPopupStyle, type CustomPopupStyle } from './custom'

/** Presentation belongs to Popups; coupon text never creates a commerce discount. */
export type PopupPresentation = {
  badge: string; highlight: string; highlightLabel: string; detail: string; code: string; footnote: string
  custom?: CustomPopupStyle
}
export const EMPTY_PRESENTATION: PopupPresentation = { badge: '', highlight: '', highlightLabel: '', detail: '', code: '', footnote: '' }
export const CAMPAIGN_DESIGNS = ['campaign', 'ticket', 'membership'] as const
export type CampaignDesign = (typeof CAMPAIGN_DESIGNS)[number]
export const isCampaignDesign = (value: string): value is CampaignDesign => (CAMPAIGN_DESIGNS as readonly string[]).includes(value)
const text = (value: unknown, max: number) => typeof value === 'string' ? value.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : ''

export function popupPresentation(value: unknown): PopupPresentation {
  if (typeof value === 'string') { try { value = JSON.parse(value) } catch { value = null } }
  const row = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  return { badge: text(row.badge, 80), highlight: text(row.highlight, 24), highlightLabel: text(row.highlightLabel, 40), detail: text(row.detail, 180), code: text(row.code, 40), footnote: text(row.footnote, 180), ...(row.custom && typeof row.custom === 'object' && !Array.isArray(row.custom) ? { custom: customPopupStyle(row.custom) } : {}) }
}

/** Samples are local drafting material. Choosing one never publishes it. */
export const POPUP_CAMPAIGNS = [
  { id: 'campaign', name: 'جشنوارهٔ هدیه', description: 'تصویر بزرگ، عدد برجسته و یک دعوت روشن', title: 'برای انتخاب بعدی‌تان، یک پیشنهاد ویژه داریم', body: 'جزئیات پیشنهاد و شرایط استفاده را ببینید و انتخاب مناسب خودتان را پیدا کنید.', actionLabel: 'دیدن پیشنهادها', actionUrl: '/products', effect: 'reveal', presentation: { ...EMPTY_PRESENTATION, badge: 'پیشنهاد ویژهٔ موبوکام', highlight: 'ویژه', highlightLabel: 'برای شما', detail: 'محصولات و خدمات منتخب، در یک نگاه', footnote: 'شرایط واقعی پیشنهاد را پیش از انتشار اینجا بنویسید.' } },
  { id: 'ticket', name: 'بلیت پیشنهاد', description: 'کد قابل کپی، با حال‌وهوای بلیت دیجیتال', title: 'یک انتخاب خوب، با یک امتیاز بیشتر', body: 'کد پیشنهاد را بردارید و شرایط استفاده را در صفحهٔ مقصد بخوانید.', actionLabel: 'مشاهدهٔ محصولات', actionUrl: '/products', effect: 'zoom', presentation: { ...EMPTY_PRESENTATION, badge: 'پیشنهاد مخصوص همراهان', highlight: 'کد هدیه', highlightLabel: 'انتخاب امروز شما', detail: 'کد واقعی و معتبر کمپین را در تنظیمات وارد کنید.' } },
  { id: 'membership', name: 'دعوت ویژه', description: 'طلایی و آرام؛ برای عضویت و معرفی خدمات', title: 'به تجربهٔ ویژهٔ موبوکام نزدیک‌تر شوید', body: 'مزایا و شرایط عضویت را بررسی کنید و پلن متناسب با نیازتان را انتخاب کنید.', actionLabel: 'بررسی شرایط عضویت', actionUrl: '/vip', effect: 'reveal', presentation: { ...EMPTY_PRESENTATION, badge: 'یک دعوت برای شما', highlight: 'ویژه', highlightLabel: 'تجربه‌ای فراتر', detail: 'جزئیات مزایای واقعی پلن را اینجا معرفی کنید.' } },
] as const
