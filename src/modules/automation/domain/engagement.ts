import { CRM_TAG } from '@/modules/livechat/domain/livechat';
export const ENGAGEMENT_KINDS = ['birthday', 'product-interest', 'segment-offer', 'winback'] as const;
export type EngagementKind = typeof ENGAGEMENT_KINDS[number];
export const ENGAGEMENT_LABELS: Record<EngagementKind, string> = {
  birthday: 'تبریک تولد',
  'product-interest': 'پیشنهاد کالای دنبال‌شده',
  'segment-offer': 'پیشنهاد به گروه مشتریان',
  winback: 'بازگشت مشتریان غیرفعال'
};
export const SEGMENTS = ['all', 'lead', 'new', 'active', 'loyal', 'at-risk', 'lost'] as const;
export const SEGMENT_LABELS: Record<typeof SEGMENTS[number], string> = {
  all: 'همهٔ مشترکان',
  lead: 'بدون خرید',
  new: 'خریدار تازه',
  active: 'فعال',
  loyal: 'وفادار',
  'at-risk': 'در خطر ریزش',
  lost: 'از دست رفته'
};
export const ENGAGEMENT_CHANNELS = ['sms', 'email', 'push'] as const;
export type EngagementChannel = typeof ENGAGEMENT_CHANNELS[number];
export const MARKETING_EVENTS = ['CRM_BIRTHDAY', 'CRM_OFFER', 'CRM_WINBACK'] as const;
export const isMarketingKind = (kind: string) => (MARKETING_EVENTS as readonly string[]).includes(kind);
export const eventForJourney = (kind: EngagementKind) => kind === 'birthday' ? 'CRM_BIRTHDAY' : kind === 'winback' ? 'CRM_WINBACK' : 'CRM_OFFER';
export type EngagementJourney = {
  id: string;
  name: string;
  kind: EngagementKind;
  enabled: boolean;
  title: string;
  body: string;
  href: string;
  channels: EngagementChannel[];
  segment: typeof SEGMENTS[number];
  tags: string[];
  productId: number;
  cadenceDays: number;
  inactiveDays: number;
  purchaseQuietDays: number;
  startsOn: string;
  endsOn: string;
};
export type EngagementSettings = {
  enabled: boolean;
  birthdayField: string;
  birthdayInputCalendar: 'persian' | 'gregory';
  birthdayCalendar: 'persian' | 'gregory';
  leapDay: 'skip' | 'last-day';
  startHour: number;
  endHour: number;
  dailyCap: number;
  weeklyCap: number;
  batchSize: number;
  journeys: EngagementJourney[];
};
export const ENGAGEMENT_DEFAULTS: EngagementSettings = {
  enabled: false,
  birthdayField: '',
  birthdayInputCalendar: 'persian',
  birthdayCalendar: 'persian',
  leapDay: 'last-day',
  startHour: 9,
  endHour: 21,
  dailyCap: 1,
  weeklyCap: 3,
  batchSize: 100,
  journeys: []
};
export class EngagementError extends Error {
  constructor(message: string, public status = 422) {
    super(message);
  }
}
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown, max: number) => String(value ?? '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, max);
const integer = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Number(value);
  return value === undefined ? fallback : Number.isSafeInteger(n) && n >= min && n <= max ? n : (() => {
    throw new EngagementError('عدد تنظیمات خارج از محدوده است');
  })();
};
export function validDay(value: unknown) {
  if (value === '' || value === undefined) return '';
  const s = String(value),
    d = new Date(s + 'T12:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== s) throw new EngagementError('تاریخ شروع یا پایان معتبر نیست');
  return s;
}
export function normalizeEngagement(input: unknown): EngagementSettings {
  const raw = record(input),
    d = ENGAGEMENT_DEFAULTS;
  for (const key of ['birthdayInputCalendar', 'birthdayCalendar'] as const) if (raw[key] !== undefined && !['persian', 'gregory'].includes(String(raw[key]))) throw new EngagementError('تقویم معتبر نیست');
  if (raw.leapDay !== undefined && !['skip', 'last-day'].includes(String(raw.leapDay))) throw new EngagementError('روش روز کبیسه معتبر نیست');
  if (raw.journeys !== undefined && !Array.isArray(raw.journeys)) throw new EngagementError('فهرست ارتباط‌ها معتبر نیست');
  const source = raw.journeys as unknown[] || [];
  if (source.length > 20) throw new EngagementError('حداکثر۲۰ مسیر ارتباطی مجاز است');
  const ids = new Set<string>(),
    journeys = source.map(item => {
      const row = record(item),
        id = String(row.id || ''),
        kind = String(row.kind) as EngagementKind;
      if (!/^[a-zA-Z0-9-]{8,48}$/.test(id) || ids.has(id)) throw new EngagementError('شناسهٔ ارتباط معتبر یا یکتا نیست');
      ids.add(id);
      if (!(ENGAGEMENT_KINDS as readonly string[]).includes(kind)) throw new EngagementError('نوع ارتباط معتبر نیست');
      const name = text(row.name, 100),
        title = text(row.title, 160),
        body = text(row.body, 1500),
        href = String(row.href || '/dashboard');
      if (!name || !title || !body) throw new EngagementError('نام، عنوان و متن ارتباط لازم است');
      if (!/^\/[A-Za-z0-9/_?=&.%-]*$/.test(href) || href.startsWith('//') || href.length > 500) throw new EngagementError('پیوند باید یک مسیر همین سایت باشد');
      if (row.channels !== undefined && !Array.isArray(row.channels)) throw new EngagementError('فهرست کانال‌ها معتبر نیست');
      if (row.tags !== undefined && !Array.isArray(row.tags)) throw new EngagementError('فهرست برچسب‌ها معتبر نیست');
      const channels = Array.isArray(row.channels) ? row.channels : [];
      if (channels.some(c => !(ENGAGEMENT_CHANNELS as readonly unknown[]).includes(c))) throw new EngagementError('کانال ارتباط معتبر نیست');
      const tags = Array.isArray(row.tags) ? row.tags.map(tag => String(tag).trim()).filter(Boolean) : [];
      if (tags.length > 8 || tags.some(tag => !CRM_TAG.test(tag))) throw new EngagementError('برچسب مشتری معتبر نیست');
      const segment = (row.segment || 'all') as EngagementJourney['segment'];
      if (!(SEGMENTS as readonly unknown[]).includes(segment)) throw new EngagementError('گروه مشتریان معتبر نیست');
      const startsOn = validDay(row.startsOn),
        endsOn = validDay(row.endsOn);
      if (startsOn && endsOn && endsOn < startsOn) throw new EngagementError('پایان پیش از شروع است');
      const productId = integer(row.productId, 0, 2147483647, 0);
      if (kind === 'product-interest' && !productId) throw new EngagementError('برای پیشنهاد کالای دنبال‌شده، کالا را انتخاب کنید');
      return {
        id,
        name,
        kind,
        enabled: row.enabled === true,
        title,
        body,
        href,
        channels: [...new Set(channels)] as EngagementChannel[],
        tags: [...new Set(tags)],
        segment,
        productId,
        cadenceDays: integer(row.cadenceDays, 0, 365, 0),
        inactiveDays: integer(row.inactiveDays, 3, 730, 30),
        purchaseQuietDays: integer(row.purchaseQuietDays, 0, 365, 30),
        startsOn,
        endsOn
      };
    });
  const dailyCap = integer(raw.dailyCap, 1, 10, d.dailyCap),
    weeklyCap = integer(raw.weeklyCap, 1, 30, d.weeklyCap);
  if (weeklyCap < dailyCap) throw new EngagementError('سقف هفتگی نباید کمتر از سقف روزانه باشد');
  const field = String(raw.birthdayField || '');
  if (field && !/^[a-zA-Z][a-zA-Z0-9_]{0,49}$/.test(field)) throw new EngagementError('فیلد تاریخ تولد معتبر نیست');
  if (raw.batchSize !== undefined && Number(raw.batchSize) < journeys.filter(j => j.enabled).length) throw new EngagementError('تعداد بررسی در هر نوبت باید حداقل برابر مسیرهای فعال باشد');
  return {
    enabled: raw.enabled === true,
    birthdayField: field,
    birthdayInputCalendar: raw.birthdayInputCalendar === 'gregory' ? 'gregory' : 'persian',
    birthdayCalendar: raw.birthdayCalendar === 'gregory' ? 'gregory' : 'persian',
    leapDay: raw.leapDay === 'skip' ? 'skip' : 'last-day',
    startHour: integer(raw.startHour, 0, 23, d.startHour),
    endHour: integer(raw.endHour, 0, 23, d.endHour),
    dailyCap,
    weeklyCap,
    batchSize: integer(raw.batchSize, 10, 200, d.batchSize),
    journeys
  };
}
export function engagementMessage(template: string, values: Record<string, string>) {
  return template.replace(/\{(name|product|brand)\}/g, (_match, key: string) => values[key] || '');
}
