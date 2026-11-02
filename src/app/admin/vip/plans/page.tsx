'use client'

import MediaCrud, { type MediaField } from '../../cms/MediaCrud'
import { inSection } from '../../cms/media-fields'
import { useI18n } from '@/i18n/LocaleProvider'
import { VipShell } from '../shared'
import { useSectionLists } from '../../cms/useSectionLists'
import { useJson } from '../../store/shared'

/** VIP plans: duration, price, perks and highlight. */
export default function VipPlansPage() {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const L = (persian: string, english: string) => (fa ? persian : english)
  // The owner's perk lines (inactive ones listed for plans that already have them).
  const perkOptions = (useSectionLists('membership', true).PERK || []).map((entry) => ({ value: entry.code, label: `${entry.icon ? `${entry.icon} ` : ''}${fa ? entry.name : entry.nameEn || entry.name}${entry.active ? '' : L(' (غیرفعال)', ' (inactive)')}` }))
  const { data: tierData } = useJson<{ tiers: { id: number; name: string }[] }>('/api/admin/membership/tiers')
  const tierOptions = [{ value: '', label: L('بدون سطح', 'No tier') }, ...(tierData?.tiers || []).map((tier) => ({ value: String(tier.id), label: tier.name }))]
  const planFields: MediaField[] = [
    ...inSection(L('پلن', 'Plan'), [
      { key: 'name', label: L('نام پلن', 'Plan name'), required: true, table: true },
      { key: 'nameEn', label: L('نام انگلیسی', 'English name'), dir: 'ltr' },
      { key: 'tierId', label: L('سطح عضویت', 'Tier'), type: 'select', options: tierOptions, table: true },
      { key: 'billing', label: L('نوع مدت', 'Term'), type: 'select', options: [{ value: 'DAYS', label: L('چند روزه', 'A number of days') }, { value: 'LIFETIME', label: L('مادام‌العمر', 'Lifetime') }, { value: 'FIXED', label: L('تا تاریخ مشخص', 'Until a date') }] },
      { key: 'days', label: L('مدت (روز)', 'Duration (days)'), type: 'number', required: true, table: true },
      { key: 'fixedEndsAt', label: L('تاریخ پایان (برای دورهٔ تاریخ‌دار)', 'End date (fixed term)'), type: 'date' },
      { key: 'slug', label: L('نشانی (slug)', 'Slug'), dir: 'ltr' },
    ]),
    ...inSection(L('قیمت', 'Price'), [
      { key: 'price', label: L('قیمت', 'Price'), type: 'number', required: true, table: true },
      { key: 'currency', label: L('واحد پول', 'Currency'), type: 'select', options: [{ value: 'IRR', label: L('ریال (IRR)', 'Rial (IRR)') }, { value: 'IRT', label: L('تومان (IRT)', 'Toman (IRT)') }, { value: 'USD', label: L('دلار (USD)', 'US dollar (USD)') }], table: true },
    ]),
    ...inSection(L('قیمت‌گذاری پیشرفته', 'Advanced pricing'), [
      { key: 'compareAt', label: L('قیمت قبل از تخفیف (خط‌خورده)', 'Compare-at price'), type: 'number' },
      { key: 'signupFee', label: L('هزینهٔ عضویت (فقط خرید اول)', 'Signup fee (first purchase)'), type: 'number' },
      { key: 'trialDays', label: L('روزهای آزمایشی (صفر یعنی ندارد)', 'Trial days (0 for none)'), type: 'number' },
      { key: 'trialPrice', label: L('قیمت دورهٔ آزمایشی (صفر یعنی رایگان)', 'Trial price (0 for free)'), type: 'number' },
      { key: 'payWhatYouWant', label: L('مبلغ دلخواه خریدار', 'Pay what you want'), type: 'checkbox' },
      { key: 'minPrice', label: L('حداقل مبلغ دلخواه', 'Minimum amount'), type: 'number' },
      { key: 'maxMembers', label: L('ظرفیت (صفر یعنی بدون محدودیت)', 'Places (0 for no limit)'), type: 'number' },
    ]),
    ...inSection(L('معرفی و مزایا', 'Description & perks'), [
      { key: 'description', label: L('توضیح کوتاه', 'Short description'), type: 'textarea', wide: true },
      { key: 'perks', label: L('مزایا', 'Perks'), type: 'records', recordKeys: [{ key: 'code', label: L('از فهرست مزایا', 'From the perks list'), options: perkOptions }, { key: 'icon', label: L('آیکون/ایموجی', 'Icon') }, { key: 'fa', label: L('متن فارسی', 'Persian text'), wide: true }, { key: 'en', label: L('متن انگلیسی', 'English text'), dir: 'ltr', wide: true }], hint: L('مزیت را از فهرست انتخاب کنید تا متن و نمادش از «متن مزایای پلن‌ها» بیاید و با یک تغییر در همهٔ پلن‌ها عوض شود؛ برای یک خط ویژهٔ همین پلن، فهرست را خالی بگذارید و متن را بنویسید.', 'Pick a perk from the list so its text and icon come from the perks list (one edit changes every plan); for a line of this plan only, leave the list empty and write the text.') },
    ]),
    ...inSection(L('نمایش و فروش', 'Display & sale'), [
      { key: 'highlight', label: L('پیشنهاد ویژه (برجسته)', 'Highlight as best value'), type: 'checkbox', table: true },
      { key: 'active', label: L('فعال و قابل خرید', 'Active & purchasable'), type: 'checkbox', table: true },
      { key: 'hidden', label: L('پنهان از صفحهٔ پلن‌ها (فروش با لینک مستقیم)', 'Hidden (sold by direct link)'), type: 'checkbox' },
      { key: 'sortOrder', label: L('ترتیب', 'Order'), type: 'number' },
    ]),
  ]
  return <VipShell><MediaCrud type="vip-plans" title={L('پلن‌های اشتراک ویژه', 'VIP plans')} titleKey="name" subtitle={L('کاربر با کیف پول یا درگاه می‌خرد؛ روزهای جدید روی اشتراک فعلی اضافه می‌شود. هدیه VIP برای پلن‌های VPN و محصولات را در فرم همان پلن/محصول تنظیم کنید.', 'Bought with wallet or gateway; new days stack on the current membership. VIP gift days for VPN plans and products are set on those items.')} fields={planFields} /></VipShell>
}
