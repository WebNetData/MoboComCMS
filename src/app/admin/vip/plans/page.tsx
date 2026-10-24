'use client'

import MediaCrud, { type MediaField } from '../../cms/MediaCrud'
import { inSection } from '../../cms/media-fields'
import { useI18n } from '@/i18n/LocaleProvider'
import { VipShell } from '../shared'

/** VIP plans: duration, price, perks and highlight. */
export default function VipPlansPage() {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const L = (persian: string, english: string) => (fa ? persian : english)
  const planFields: MediaField[] = [
    ...inSection(L('پلن', 'Plan'), [
      { key: 'name', label: L('نام پلن', 'Plan name'), required: true, table: true },
      { key: 'nameEn', label: L('نام انگلیسی', 'English name'), dir: 'ltr' },
      { key: 'days', label: L('مدت (روز)', 'Duration (days)'), type: 'number', required: true, table: true },
      { key: 'slug', label: L('نشانی (slug)', 'Slug'), dir: 'ltr' },
    ]),
    ...inSection(L('قیمت', 'Price'), [
      { key: 'price', label: L('قیمت', 'Price'), type: 'number', required: true, table: true },
      { key: 'currency', label: L('واحد پول', 'Currency'), type: 'select', options: [{ value: 'IRR', label: L('ریال (IRR)', 'Rial (IRR)') }, { value: 'IRT', label: L('تومان (IRT)', 'Toman (IRT)') }, { value: 'USD', label: L('دلار (USD)', 'US dollar (USD)') }], table: true },
    ]),
    ...inSection(L('معرفی و مزایا', 'Description & perks'), [
      { key: 'description', label: L('توضیح کوتاه', 'Short description'), type: 'textarea', wide: true },
      { key: 'perks', label: L('مزایا', 'Perks'), type: 'records', recordKeys: [{ key: 'icon', label: L('آیکون/ایموجی', 'Icon') }, { key: 'fa', label: L('متن فارسی', 'Persian text'), wide: true }, { key: 'en', label: L('متن انگلیسی', 'English text'), dir: 'ltr', wide: true }] },
    ]),
    ...inSection(L('نمایش و فروش', 'Display & sale'), [
      { key: 'highlight', label: L('پیشنهاد ویژه (برجسته)', 'Highlight as best value'), type: 'checkbox', table: true },
      { key: 'active', label: L('فعال و قابل خرید', 'Active & purchasable'), type: 'checkbox', table: true },
      { key: 'sortOrder', label: L('ترتیب', 'Order'), type: 'number' },
    ]),
  ]
  return <VipShell><MediaCrud type="vip-plans" title={L('پلن‌های اشتراک ویژه', 'VIP plans')} titleKey="name" subtitle={L('کاربر با کیف پول یا درگاه می‌خرد؛ روزهای جدید روی اشتراک فعلی اضافه می‌شود. هدیه VIP برای پلن‌های VPN و محصولات را در فرم همان پلن/محصول تنظیم کنید.', 'Bought with wallet or gateway; new days stack on the current membership. VIP gift days for VPN plans and products are set on those items.')} fields={planFields} /></VipShell>
}
