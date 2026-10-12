'use client'

import MediaCrud, { type MediaField } from '../../cms/MediaCrud'
import { useI18n } from '@/i18n/LocaleProvider'
import { VipShell } from '../shared'

/** VIP plans: duration, price, perks and highlight. */
export default function VipPlansPage() {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const planFields: MediaField[] = [
    { key: 'name', label: fa ? 'نام پلن' : 'Plan name', required: true, table: true },
    { key: 'nameEn', label: fa ? 'نام انگلیسی' : 'English name', dir: 'ltr' },
    { key: 'days', label: fa ? 'مدت (روز)' : 'Duration (days)', type: 'number', required: true, table: true },
    { key: 'price', label: fa ? 'قیمت' : 'Price', type: 'number', required: true, table: true },
    { key: 'currency', label: fa ? 'واحد پول' : 'Currency', type: 'select', options: [{ value: 'IRR', label: fa ? 'ریال (IRR)' : 'Rial (IRR)' }, { value: 'IRT', label: fa ? 'تومان (IRT)' : 'Toman (IRT)' }, { value: 'USD', label: fa ? 'دلار (USD)' : 'US dollar (USD)' }], table: true },
    { key: 'description', label: fa ? 'توضیح کوتاه' : 'Short description', type: 'textarea' },
    { key: 'perks', label: fa ? 'مزایا' : 'Perks', type: 'records', recordKeys: [{ key: 'icon', label: fa ? 'آیکون/ایموجی' : 'Icon' }, { key: 'fa', label: fa ? 'متن فارسی' : 'Persian text', wide: true }, { key: 'en', label: fa ? 'متن انگلیسی' : 'English text', dir: 'ltr', wide: true }] },
    { key: 'highlight', label: fa ? 'پیشنهاد ویژه (برجسته)' : 'Highlight as best value', type: 'checkbox', table: true },
    { key: 'active', label: fa ? 'فعال و قابل خرید' : 'Active & purchasable', type: 'checkbox', table: true },
    { key: 'sortOrder', label: fa ? 'ترتیب' : 'Order', type: 'number' },
    { key: 'slug', label: fa ? 'نشانی (slug)' : 'Slug', dir: 'ltr' },
  ]
  return <VipShell><MediaCrud type="vip-plans" title={fa ? 'پلن‌های اشتراک ویژه' : 'VIP plans'} titleKey="name" subtitle={fa ? 'کاربر با کیف پول یا درگاه می‌خرد؛ روزهای جدید روی اشتراک فعلی اضافه می‌شود. هدیه VIP برای پلن‌های VPN و محصولات را در فرم همان پلن/محصول تنظیم کنید.' : 'Bought with wallet or gateway; new days stack on the current membership. VIP gift days for VPN plans and products are set on those items.'} fields={planFields} /></VipShell>
}
