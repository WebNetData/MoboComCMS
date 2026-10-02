import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import type { Permission } from '@/modules/identity/rbac'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { getSettings, setSetting } from '@/modules/settings/server'

export async function GET(req: NextRequest) {
  const admin = await requirePerm(req, 'settings.manage' as Permission)
  if (!admin) return err('forbidden', 403)
  const settings = await getSettings()
  return ok(Object.fromEntries(Object.entries(settings).filter(([key]) => !key.startsWith('telegram.') && !key.startsWith('happ.') && !/token|secret|password|apiKey/i.test(key))))
}

export async function PATCH(req: NextRequest) {
  const admin = await requirePerm(req, 'settings.manage' as Permission)
  if (!admin) return err('forbidden', 403)
  const b = await req.json().catch(() => null)
  const allowed = ['supportTelegram', 'supportEmail', 'siteUrl', 'usdRateToman', 'seoDescription', 'ogImage', 'googleVerification', 'subscriptionPrefix', 'storeEnabled', 'publicApiEnabled', 'personalRecommendationsEnabled']
  if (b?.storeEnabled !== undefined && !['true', 'false'].includes(b.storeEnabled)) return err('وضعیت فروشگاه معتبر نیست')
  if (b?.publicApiEnabled !== undefined && !['true', 'false'].includes(b.publicApiEnabled)) return err('وضعیت API معتبر نیست')
  if (b?.personalRecommendationsEnabled !== undefined && !['true', 'false'].includes(b.personalRecommendationsEnabled)) return err('وضعیت پیشنهادهای شخصی معتبر نیست')
  if (b?.subscriptionPrefix && !/^[a-z][a-z0-9_]{0,11}$/.test(b.subscriptionPrefix)) return err('پیشوند باید با حرف کوچک انگلیسی شروع شود و حداکثر ۱۲ حرف، عدد یا _ باشد')
  if (b?.usdRateToman !== undefined && b.usdRateToman !== '') {
    const rate = String(b.usdRateToman).trim()
    if (!/^\d{1,12}$/.test(rate) || BigInt(rate) <= 0n) return err('نرخ دلار به تومان باید یک عدد صحیح مثبت باشد')
    b.usdRateToman = rate
  }
  if (b?.siteUrl) {
    try { const u = new URL(b.siteUrl); if (!['http:', 'https:'].includes(u.protocol)) return err('نشانی سایت معتبر نیست') } catch { return err('نشانی سایت معتبر نیست') }
  }
  if (b?.ogImage && !/^(https?:\/\/|\/(?!\/))/.test(b.ogImage)) return err('نشانی تصویر معتبر نیست')
  for (const key of allowed) {
    if (typeof b?.[key] === 'string' && b[key].length <= 6000) {
      await setSetting(key, b[key])
    }
  }
  const settings = await getSettings()
  return ok(Object.fromEntries(Object.entries(settings).filter(([key]) => !key.startsWith('telegram.') && !/token|secret|password|apiKey/i.test(key))))
}
