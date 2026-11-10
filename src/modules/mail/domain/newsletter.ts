/**
 * Newsletter campaigns: audiences, validation, link/open tracking and the
 * email document. Pure functions only.
 */

import { emailDocument } from '@/modules/mail/domain/email-layout'

export class NewsletterError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

export const AUDIENCES = ['subscribers', 'users', 'customers', 'all'] as const
export type Audience = (typeof AUDIENCES)[number]
export const AUDIENCE_LABEL: Record<Audience, string> = {
  subscribers: 'عضوهای خبرنامه',
  users: 'همهٔ کاربران سایت (با اعلان ایمیلی روشن)',
  customers: 'مشتریانی که خرید کرده‌اند',
  all: 'عضوهای خبرنامه + همهٔ کاربران',
}

export function normalizeEmail(input: unknown): string {
  const email = String(input ?? '').trim().toLowerCase()
  return /^[^\s@<>()[\]\\,;:"]{1,64}@[a-z0-9.-]{1,190}\.[a-z]{2,24}$/.test(email) && !email.includes('..') ? email : ''
}

export type CampaignInput = { subject: string; preheader: string; html: string; audience: Audience; scheduledAt: Date | null }

export function validateCampaign(input: Record<string, unknown>, now = new Date()): CampaignInput {
  const subject = String(input.subject ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, 200)
  if (!subject) throw new NewsletterError('موضوع ایمیل را بنویسید')
  const html = String(input.html ?? '')
  if (html.replace(/<[^>]+>/g, '').trim().length < 3 && !/<img\b/i.test(html)) throw new NewsletterError('متن ایمیل خالی است')
  if (html.length > 500_000) throw new NewsletterError('متن ایمیل بیش از حد طولانی است', 413)
  const audience = AUDIENCES.includes(input.audience as Audience) ? input.audience as Audience : 'subscribers'
  let scheduledAt: Date | null = null
  if (input.scheduledAt) {
    const date = new Date(String(input.scheduledAt))
    if (Number.isNaN(date.getTime())) throw new NewsletterError('زمان ارسال معتبر نیست')
    scheduledAt = date.getTime() < now.getTime() - 60_000 ? null : date
  }
  return { subject, preheader: String(input.preheader ?? '').replace(/[\r\n<>]+/g, ' ').trim().slice(0, 200), html, audience, scheduledAt }
}

const absolute = (base: string, url: string) => (/^https?:\/\//i.test(url) || url.startsWith('mailto:') || url.startsWith('tel:') ? url : `${base}${url.startsWith('/') ? '' : '/'}${url}`)

/**
 * Makes addresses absolute and routes links through the click counter:
 * href → /api/newsletter/c/<token>?u=<url>&s=<signature of url>.
 */
export function trackLinks(html: string, input: { base: string; token: string; sign: (url: string) => string }): string {
  return html
    .replace(/(<img\b[^>]*?\ssrc\s*=\s*")([^"]+)(")/gi, (_all, before: string, url: string, after: string) => `${before}${absolute(input.base, url.replace(/&amp;/g, '&')).replace(/&/g, '&amp;')}${after}`)
    .replace(/(<a\b[^>]*?\shref\s*=\s*")([^"]+)(")/gi, (_all, before: string, raw: string, after: string) => {
      const url = absolute(input.base, raw.replace(/&amp;/g, '&'))
      if (!/^https?:\/\//i.test(url)) return `${before}${raw}${after}`
      return `${before}${input.base}/api/newsletter/c/${input.token}?u=${encodeURIComponent(url)}&amp;s=${input.sign(url)}${after}`
    })
}

const esc = (value: string) => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`)

/** The email document in the shared MoboCom layout: preheader, greeting, body, unsubscribe footer and the open pixel. */
export function campaignDocument(input: { brand: string; base: string; subject: string; preheader: string; body: string; token: string; unsubscribeUrl: string; name: string }) {
  const html = emailDocument({
    brand: input.brand, site: input.base, title: input.subject, preheader: input.preheader, icon: 'mail', eyebrow: `خبرنامهٔ ${input.brand}`,
    greeting: input.name ? `${input.name} عزیز،` : undefined,
    blocks: [{ kind: 'html', html: input.body }],
    footer: [`این ایمیل را چون عضو خبرنامهٔ ${input.brand} هستید دریافت کرده‌اید.`],
    footerLinks: [['لغو عضویت', input.unsubscribeUrl], [input.base.replace(/^https?:\/\//, ''), input.base]],
    trailer: `<img src="${esc(input.base)}/api/newsletter/o/${input.token}.gif" width="1" height="1" alt="" style="display:block;border:0;width:1px;height:1px">`,
  })
  const text = `${input.subject}\n\n${input.body.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|h[1-6]|li|div)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\n{3,}/g, '\n\n').trim()}\n\n—\nلغو عضویت: ${input.unsubscribeUrl}`
  return { html, text }
}

/** Rate for one sending tick: never more than what is left of the daily cap. */
export function batchSize(perMinute: number, dailyLimit: number, sentToday: number): number {
  const left = dailyLimit > 0 ? Math.max(0, dailyLimit - sentToday) : Number.POSITIVE_INFINITY
  return Math.max(0, Math.min(perMinute, left, 500))
}
