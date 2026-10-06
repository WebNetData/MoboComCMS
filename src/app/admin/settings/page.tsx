'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/i18n/LocaleProvider'
import { getCookie } from '@/platform/browser/preferences'
import Link from '@/components/AppLink'
import { useRouter } from '@/platform/routing/navigation'
import { useModuleEnabled } from '@/extensions/client/ExtensionProvider'

export default function AdminSettingsPage() {
  const router = useRouter()
  const { t, locale } = useI18n()
  const vpnOn = useModuleEnabled('vpn')
  const theme = getCookie('theme') || 'dark'
  const [s, setS] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/admin/settings').then((r) => (r.ok ? r.json() : {})).then(setS)
  }, [])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaved(false)
    setError('')
    const res = await fetch('/api/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(s),
    })
    setSaved(res.ok)
    if (res.ok) router.refresh()
    if (!res.ok) setError((await res.json().catch(() => null))?.error || t.errGeneric)
  }

  const fields: [string, string][] = [
    ['supportTelegram', t.supportTelegram],
    ['supportEmail', t.supportEmail],
    ['siteUrl', t.siteUrl],
    ...(vpnOn ? [['subscriptionPrefix', 'پیشوند نام خودکار اشتراک (مثلاً happ)'] as [string, string]] : []),
    ['usdRateToman', t.usdRate],
    ['seoDescription', 'توضیحات موتور جستجو'],
    ['ogImage', 'نشانی تصویر اشتراک‌گذاری'],
    ['googleVerification', 'کد تأیید گوگل'],
  ]

  return (
    <div>
      <h1 className="h2 mb-6">{t.settingsAdmin}</h1>
      <div className="studio-notice">مدیریت نام برند، رنگ‌ها، منوها و محتوای صفحه اصلی به <Link href="/admin/studio" style={{ textDecoration: 'underline' }}>استودیوی سایت</Link> منتقل شده است.</div>
      <form onSubmit={save} className="card max-w-xl">
        <div className="mb-6">
          <label className="flex items-center gap-2"><input type="checkbox" checked={s.publicApiEnabled === 'true'} onChange={e => setS({ ...s, publicApiEnabled: e.target.checked ? 'true' : 'false' })}/><strong>{locale === 'fa' ? 'نمایش و فعال‌سازی API عمومی' : 'Show and enable public API'}</strong></label>
          <p className="muted text-sm mt-3">{locale === 'fa' ? 'در حالت خاموش، بخش API، مدیریت کلیدها و دسترسی API عمومی برای همه غیرفعال است.' : 'When off, the API section, key management and public API access are disabled for everyone.'}</p>
        </div>
        <div className="mb-6">
          <label className="flex items-center gap-2"><input type="checkbox" checked={s.personalRecommendationsEnabled !== 'false'} onChange={e => setS({ ...s, personalRecommendationsEnabled: e.target.checked ? 'true' : 'false' })}/><strong>{locale === 'fa' ? 'پیشنهادهای شخصی کتابخانه' : 'Personal library suggestions'}</strong></label>
          <p className="muted text-sm mt-3">{locale === 'fa' ? 'نمایش پیشنهادهای مبتنی بر فعالیت را برای همه متوقف می‌کند. رضایت ثبت‌شدهٔ کاربران محفوظ می‌ماند و با فعال‌سازی دوباره اعمال می‌شود.' : 'Pause activity-based suggestions for everyone. Saved member consent remains unchanged and takes effect when enabled again.'}</p>
        </div>
        <div className="mb-6">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={s.storeEnabled === 'true'} onChange={e => setS({ ...s, storeEnabled: e.target.checked ? 'true' : 'false' })} />
            <strong>{locale === 'fa' ? 'فعال بودن فروشگاه' : 'Enable storefront'}</strong>
          </label>
          <p className="muted text-sm mt-3">{locale === 'fa' ? 'با غیرفعال کردن، منو و محصولات فروشگاه پنهان و خرید محصولات متوقف می‌شود.' + (vpnOn ? ' فروش پلن‌های VPN فعال می‌ماند.' : '') : 'When disabled, shop links and products are hidden and product purchases are blocked. VPN plans remain available.'}</p>
        </div>
        {fields.map(([key, label]) => (
          <div key={key} className="mb-4">
            <label className="label">{label}</label>
            <input
              className="input"
              dir={key === 'siteUrl' || key === 'themeColor' || key === 'usdRateToman' ? 'ltr' : undefined}
              inputMode={key === 'usdRateToman' ? 'numeric' : undefined}
              placeholder={key === 'usdRateToman' ? '158200' : undefined}
              value={s[key] || ''}
              onChange={(e) => setS({ ...s, [key]: e.target.value })}
            />
          </div>
        ))}
        {saved && <p className="success-text mb-4">✅ {t.saved}</p>}
        {error && <p className="error-text mb-4" role="alert">{error}</p>}
        <button className="btn btn-primary">{t.save}</button>
      </form>

      <div className="card max-w-xl mt-6">
        <h3 className="font-bold mb-2">.env</h3>
        <p className="muted leading-7 text-sm">
          {vpnOn ? t.envHint : locale === 'fa' ? 'کلیدهای Plisio در فایل .env مدیریت می‌شوند.' : 'Plisio keys live in the .env file.'}
          <br />
          <code dir="ltr">{t.keysIn}</code>
        </p>
      </div>
    </div>
  )
}
