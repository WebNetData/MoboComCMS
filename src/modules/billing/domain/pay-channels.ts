import { PayError, type PayChannelType } from './pay'
import { httpsUrl } from './pay-policy'

export const PAY_CHANNEL_LABELS: Record<PayChannelType, string> = {
  WEBSITE: 'وب‌سایت', BOT: 'ربات', INSTAGRAM: 'اینستاگرام', CHANNEL: 'کانال', PAYMENT_LINK: 'لینک پرداخت', OTHER: 'سایر',
}

export function parseChannelDestination(input: Record<string, unknown>, website: string): { channelType: PayChannelType; channelUrl: string; returnUrl: string } {
  const channelType = input.channelType === undefined ? 'WEBSITE' : input.channelType
  if (typeof channelType !== 'string' || !Object.prototype.hasOwnProperty.call(PAY_CHANNEL_LABELS, channelType)) throw new PayError('نوع پایانه معتبر نیست')
  if (input.channelUrl !== undefined && typeof input.channelUrl !== 'string' || input.returnUrl !== undefined && typeof input.returnUrl !== 'string') throw new PayError('نشانی پایانه معتبر نیست')
  const kind = channelType as PayChannelType
  if (kind === 'WEBSITE' || kind === 'BOT') {
    if (input.channelUrl) throw new PayError('نشانی کانال برای این پایانه مجاز نیست')
    if (!website) throw new PayError('ابتدا وب‌سایت کسب‌وکار را ثبت کنید')
    const returnUrl = httpsUrl(input.returnUrl)
    if (new URL(returnUrl).origin !== new URL(httpsUrl(website)).origin) throw new PayError('نشانی بازگشت باید متعلق به وب‌سایت ثبت‌شده باشد')
    return { channelType: kind, channelUrl: '', returnUrl }
  }
  if (kind === 'PAYMENT_LINK') {
    if (input.channelUrl || input.returnUrl) throw new PayError('لینک پرداخت به نشانی کانال یا بازگشت نیاز ندارد')
    return { channelType: kind, channelUrl: '', returnUrl: '' }
  }
  const channelUrl = httpsUrl(input.channelUrl)
  if (kind === 'INSTAGRAM') {
    const url = new URL(channelUrl)
    if (!['instagram.com', 'www.instagram.com'].includes(url.hostname) || url.pathname === '/' || (input.channelUrl as string).includes('?') || (input.channelUrl as string).includes('#')) throw new PayError('نشانی پروفایل اینستاگرام معتبر لازم است')
  }
  if (input.returnUrl && httpsUrl(input.returnUrl) !== channelUrl) throw new PayError('نشانی بازگشت باید همان نشانی کانال باشد')
  return { channelType: kind, channelUrl, returnUrl: channelUrl }
}

export function profileOriginCompatible(website: string, terminals: Array<{ channelType?: string; returnUrl: string; botIntegration?: { callbackUrl: string } | null }>): boolean {
  try {
    if (terminals.some(t => t.channelType !== undefined && !Object.prototype.hasOwnProperty.call(PAY_CHANNEL_LABELS, t.channelType))) return false
    const needsOrigin = terminals.some(t => !t.channelType || t.channelType === 'WEBSITE' || t.channelType === 'BOT' || t.botIntegration)
    if (!needsOrigin) return true
    const origin = new URL(httpsUrl(website)).origin
    return terminals.every(t => {
      const web = !t.channelType || t.channelType === 'WEBSITE' || t.channelType === 'BOT'
      return (!web || new URL(httpsUrl(t.returnUrl)).origin === origin) && (!t.botIntegration || new URL(httpsUrl(t.botIntegration.callbackUrl)).origin === origin)
    })
  } catch { return false }
}
