/** The existing General Settings form, not the full key/value store or provider credentials. */
export const GENERAL_SETTING_KEYS = ['supportTelegram', 'supportEmail', 'siteUrl', 'usdRateToman', 'seoDescription', 'ogImage', 'googleVerification', 'subscriptionPrefix', 'storeEnabled', 'publicApiEnabled', 'personalRecommendationsEnabled'] as const

export function generalSettingsPatch(input: Record<string, unknown>, restore = false): Record<string, string | null> {
  const out: Record<string, string | null> = {}
  for (const key of GENERAL_SETTING_KEYS) {
    if (!Object.hasOwn(input, key)) continue
    const value = input[key]
    if (value === null && restore) { out[key] = null; continue }
    if (typeof value !== 'string' || value.length > 6000) throw Error('مقدار تنظیمات معتبر نیست')
    if (['storeEnabled', 'publicApiEnabled', 'personalRecommendationsEnabled'].includes(key) && !['true', 'false'].includes(value)) throw Error('وضعیت انتخاب‌شده معتبر نیست')
    if (key === 'subscriptionPrefix' && value && !/^[a-z][a-z0-9_]{0,11}$/.test(value)) throw Error('پیشوند باید با حرف کوچک انگلیسی شروع شود و حداکثر ۱۲ حرف، عدد یا _ باشد')
    if (key === 'usdRateToman' && value && (!/^\d{1,12}$/.test(value.trim()) || BigInt(value.trim()) <= 0n)) throw Error('نرخ دلار به تومان باید یک عدد صحیح مثبت باشد')
    if (key === 'siteUrl' && value) { let url: URL; try { url = new URL(value) } catch { throw Error('نشانی سایت معتبر نیست') }; if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw Error('نشانی سایت معتبر نیست') }
    if (key === 'ogImage' && value && !/^(https?:\/\/|\/(?!\/))/.test(value)) throw Error('نشانی تصویر معتبر نیست')
    out[key] = key === 'usdRateToman' ? value.trim() : value
  }
  return out
}
