import type { EngagementSettings } from '@/modules/automation/domain/engagement';
export type Receipt = {
  channel: string;
  status: string;
  attempts: number;
  runAt: string;
  finishedAt: string | null;
  result: string;
};
export type Notice = {
  id: number;
  userId: number;
  kind: string;
  titleFa: string;
  journeyId: string;
  createdAt: string;
  expiresAt: string | null;
  readAt: string | null;
  deliveries: Receipt[];
};
export type EngagementState = {
  settings: EngagementSettings;
  revision: string;
  dateFields: {
    key: string;
    label: string;
  }[];
  overview: {
    total: number;
    consenting: number;
    notices: Notice[];
  };
};
export type Preview = {
  scanned: number;
  eligible: number;
  limit: number;
  contactWindowOpen: boolean;
  enabled: boolean;
  reasons: Record<string, number>;
  sample: {
    id: number;
    name: string;
    title: string;
    body: string;
    href: string;
  }[];
};
export const REASONS: Record<string, string> = {
  'outside-dates': 'خارج از تاریخ برنامه',
  'inactive-account': 'حساب غیرفعال',
  'no-consent': 'بدون انتخاب دریافت پیام',
  'tag-mismatch': 'برچسب متفاوت',
  'segment-mismatch': 'گروه مشتری متفاوت',
  'recently-active': 'اخیراً فعال بوده',
  'not-birthday': 'امروز سالگرد تولد نیست',
  'store-disabled': 'فروشگاه خاموش',
  'product-unavailable': 'کالا در دسترس نیست',
  'out-of-stock': 'کالا ناموجود است',
  'not-following': 'کالا دنبال نشده',
  'recent-purchase': 'خرید اخیر همان کالا',
  'frequency-cap': 'سقف ارتباط',
  'already-queued': 'قبلاً ثبت شده',
  'contact-window': 'خارج از ساعت ارسال'
};

/** Keep the last valid number while a numeric field is empty or incomplete. */
export function inputInteger(input: HTMLInputElement, previous: number) {
  return input.value !== "" && Number.isSafeInteger(input.valueAsNumber) ? input.valueAsNumber : previous;
}
