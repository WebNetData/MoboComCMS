import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { db } from '@/platform/database/prisma'
import { authSecret } from '@/platform/config/env'
import { logEvent } from '@/platform/observability/logger'
import { getSettings, readJsonSetting, writeJsonSetting } from '@/modules/settings/server'
import { cleanRichText } from '@/shared/content/sanitize'
import { deliverableEmail } from '@/modules/mail/domain/mail'
import { getSmtp, sendMail } from '@/modules/mail/server/mailer'
import { NewsletterError, batchSize, campaignDocument, normalizeEmail, trackLinks, validateCampaign, type Audience } from '@/modules/mail/domain/newsletter'

// Newsletter: double opt-in subscribers, campaigns to subscribers / users /
// customers, sent in small batches by the job scheduler within the site's
// daily email cap, with open (pixel) and click (redirect) tracking.

const KEY = 'newsletter.v1'
type Settings = { perMinute: number }
export async function getNewsletterSettings(): Promise<Settings> {
  const raw = await readJsonSetting(KEY) || {}
  return { perMinute: Math.max(1, Math.min(300, Math.round(Number(raw.perMinute)) || 20)) }
}
export async function saveNewsletterSettings(input: Record<string, unknown>) {
  const next = { perMinute: Math.max(1, Math.min(300, Math.round(Number(input.perMinute)) || 20)) }
  await writeJsonSetting(KEY, next)
  return next
}

const token = () => randomBytes(18).toString('base64url')
const sign = (value: string) => createHmac('sha256', authSecret()).update(`newsletter:${value}`).digest('base64url').slice(0, 22)
export function verifySignature(value: string, signature: string) {
  const a = Buffer.from(sign(value)), b = Buffer.from(String(signature || ''))
  return a.length === b.length && timingSafeEqual(a, b)
}

async function site() {
  const settings = await getSettings().catch(() => ({} as Record<string, string>))
  return { brand: settings.brandName || 'موبوکام', base: (settings.siteUrl || process.env.NEXTAUTH_URL || '').replace(/\/+$/, '') }
}

// ------------------------------------------------------------------ subscribers

/** Public sign-up: a confirmation email is sent (double opt-in). */
export async function subscribe(input: { email?: unknown; name?: unknown; source?: string; userId?: number | null }) {
  const email = normalizeEmail(input.email)
  if (!email || !deliverableEmail(email)) throw new NewsletterError('نشانی ایمیل معتبر نیست')
  const name = String(input.name ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 80)
  const existing = await db.newsletterSubscriber.findUnique({ where: { email } })
  if (existing?.status === 'ACTIVE') return { status: 'ACTIVE' as const }
  const row = existing
    ? await db.newsletterSubscriber.update({ where: { id: existing.id }, data: { status: 'PENDING', name: name || existing.name, token: token(), userId: input.userId ?? existing.userId, unsubscribedAt: null } })
    : await db.newsletterSubscriber.create({ data: { email, name, token: token(), source: (input.source || 'form').slice(0, 30), userId: input.userId ?? null } })
  const { brand, base } = await site()
  const link = `${base}/newsletter/confirm?t=${row.token}`
  const result = await sendMail({
    to: email, subject: `تأیید عضویت در خبرنامهٔ ${brand}`, source: 'newsletter-confirm',
    text: `${name ? `${name} عزیز، ` : ''}برای تأیید عضویت در خبرنامهٔ ${brand} روی این پیوند بزنید:\n${link}\nاگر شما درخواست نداده‌اید این ایمیل را نادیده بگیرید.`,
    html: `<div dir="rtl" style="font-family:Tahoma,sans-serif;line-height:2;max-width:520px;margin:auto;padding:20px"><h2 style="color:#5b3df5">${brand}</h2><p>${name ? `${name} عزیز، ` : ''}برای تأیید عضویت در خبرنامه روی دکمه بزنید:</p><p><a href="${link}" style="display:inline-block;background:#5b3df5;color:#fff;padding:10px 20px;border-radius:10px;text-decoration:none">تأیید عضویت</a></p><p style="color:#888;font-size:12px">اگر شما درخواست نداده‌اید این ایمیل را نادیده بگیرید.</p></div>`,
  })
  if (!result.ok) logEvent('warn', 'newsletter.confirm_mail_failed', { error: result.error })
  return { status: 'PENDING' as const, mailed: result.ok }
}

export async function confirmSubscription(value: unknown) {
  const row = await db.newsletterSubscriber.findUnique({ where: { token: String(value || '') } })
  if (!row) return null
  if (row.status !== 'ACTIVE') await db.newsletterSubscriber.update({ where: { id: row.id }, data: { status: 'ACTIVE', confirmedAt: new Date(), unsubscribedAt: null } })
  return row.email
}

/** Unsubscribes by subscriber token or a campaign delivery token; users are kept on the stop list too. */
export async function unsubscribe(value: unknown) {
  const key = String(value || '')
  if (!/^[A-Za-z0-9_-]{10,60}$/.test(key)) return null
  const subscriber = await db.newsletterSubscriber.findUnique({ where: { token: key } })
  const delivery = subscriber ? null : await db.newsletterDelivery.findUnique({ where: { token: key } })
  const email = subscriber?.email || delivery?.email
  if (!email) return null
  await db.newsletterSubscriber.upsert({
    where: { email },
    create: { email, status: 'UNSUBSCRIBED', token: token(), source: 'unsubscribe', userId: delivery?.userId ?? null, unsubscribedAt: new Date() },
    update: { status: 'UNSUBSCRIBED', unsubscribedAt: new Date() },
  })
  return email
}

export async function subscriberList(input: { q?: unknown; status?: unknown; page?: unknown }) {
  const page = Math.max(1, Math.round(Number(input.page) || 1))
  const q = String(input.q || '').trim().toLowerCase()
  const status = ['ACTIVE', 'PENDING', 'UNSUBSCRIBED'].includes(String(input.status)) ? String(input.status) : undefined
  const where = { ...(status ? { status } : {}), ...(q ? { OR: [{ email: { contains: q } }, { name: { contains: q } }] } : {}) }
  const [rows, total, counts] = await Promise.all([
    db.newsletterSubscriber.findMany({ where, orderBy: { id: 'desc' }, skip: (page - 1) * 50, take: 50 }),
    db.newsletterSubscriber.count({ where }),
    db.newsletterSubscriber.groupBy({ by: ['status'], _count: { _all: true } }),
  ])
  return {
    page, pages: Math.max(1, Math.ceil(total / 50)), total,
    counts: Object.fromEntries(counts.map((row) => [row.status, row._count._all])),
    rows: rows.map((row) => ({ id: row.id, email: row.email, name: row.name, status: row.status, source: row.source, createdAt: row.createdAt, confirmedAt: row.confirmedAt })),
  }
}

/** Staff import (CSV lines "email,name" or one email per line); imported people count as confirmed. */
export async function importSubscribers(text: unknown) {
  const lines = String(text ?? '').split(/\r?\n/).slice(0, 20_000)
  let added = 0, skipped = 0
  for (const line of lines) {
    const [rawEmail, ...rest] = line.split(/[,;\t]/)
    const email = normalizeEmail(rawEmail)
    if (!email || !deliverableEmail(email)) { if (line.trim()) skipped++; continue }
    const existing = await db.newsletterSubscriber.findUnique({ where: { email } })
    if (existing) { skipped++; continue } // never re-subscribe someone who left
    await db.newsletterSubscriber.create({ data: { email, name: rest.join(' ').trim().slice(0, 80), status: 'ACTIVE', token: token(), source: 'import', confirmedAt: new Date() } })
    added++
  }
  return { added, skipped }
}

export async function removeSubscriber(id: unknown) {
  await db.newsletterSubscriber.delete({ where: { id: Number(id) } }).catch(() => { throw new NewsletterError('پیدا نشد', 404) })
}

export async function exportSubscribers() {
  const rows = await db.newsletterSubscriber.findMany({ where: { status: 'ACTIVE' }, orderBy: { id: 'asc' }, select: { email: true, name: true, confirmedAt: true } })
  return `email,name,confirmed_at\n${rows.map((row) => `${row.email},"${row.name.replace(/"/g, '""')}",${row.confirmedAt?.toISOString() || ''}`).join('\n')}\n`
}

// ------------------------------------------------------------------ audiences

async function recipients(audience: Audience): Promise<{ email: string; name: string; userId: number | null }[]> {
  const stopped = new Set((await db.newsletterSubscriber.findMany({ where: { status: 'UNSUBSCRIBED' }, select: { email: true } })).map((row) => row.email))
  const out = new Map<string, { email: string; name: string; userId: number | null }>()
  const add = (email: string, name: string, userId: number | null) => {
    const clean = normalizeEmail(email)
    if (clean && deliverableEmail(clean) && !stopped.has(clean) && !out.has(clean)) out.set(clean, { email: clean, name, userId })
  }
  if (audience === 'subscribers' || audience === 'all') {
    for (const row of await db.newsletterSubscriber.findMany({ where: { status: 'ACTIVE' }, select: { email: true, name: true, userId: true } })) add(row.email, row.name, row.userId)
  }
  if (audience === 'users' || audience === 'all') {
    for (const row of await db.user.findMany({ where: { status: 'ACTIVE', emailAlerts: true }, select: { id: true, email: true, name: true } })) add(row.email, row.name || '', row.id)
  }
  if (audience === 'customers') {
    const buyers = await db.order.findMany({ where: { status: { in: ['PAID', 'COMPLETED'] } }, select: { userId: true }, distinct: ['userId'] })
    for (const row of await db.user.findMany({ where: { id: { in: buyers.map((b) => b.userId) }, status: 'ACTIVE', emailAlerts: true }, select: { id: true, email: true, name: true } })) add(row.email, row.name || '', row.id)
  }
  return [...out.values()]
}

export async function audienceSizes() {
  const sizes: Record<string, number> = {}
  for (const audience of ['subscribers', 'users', 'customers', 'all'] as Audience[]) sizes[audience] = (await recipients(audience)).length
  return sizes
}

// ------------------------------------------------------------------ campaigns

export async function campaignList() {
  const rows = await db.newsletterCampaign.findMany({ orderBy: { id: 'desc' }, take: 100 })
  return rows.map(({ html, ...row }) => ({ ...row, hasBody: !!html }))
}

export async function campaignGet(id: unknown) {
  const row = await db.newsletterCampaign.findUnique({ where: { id: Number(id) } })
  if (!row) throw new NewsletterError('کمپین پیدا نشد', 404)
  return row
}

export async function campaignSave(input: Record<string, unknown>, adminId: number) {
  const data = validateCampaign(input)
  const html = cleanRichText(data.html)
  const id = Number(input.id) || 0
  if (id) {
    const current = await campaignGet(id)
    if (!['DRAFT', 'SCHEDULED'].includes(current.status)) throw new NewsletterError('کمپین در حال ارسال یا ارسال‌شده قابل ویرایش نیست', 409)
    return db.newsletterCampaign.update({ where: { id }, data: { subject: data.subject, preheader: data.preheader, html, audience: data.audience } })
  }
  return db.newsletterCampaign.create({ data: { subject: data.subject, preheader: data.preheader, html, audience: data.audience, createdBy: adminId } })
}

/** Queues a campaign now or at a time; the job scheduler sends it. */
export async function campaignSchedule(id: unknown, when: unknown) {
  const current = await campaignGet(id)
  if (!['DRAFT', 'SCHEDULED'].includes(current.status)) throw new NewsletterError('این کمپین قبلاً ارسال شده است', 409)
  if (!(await getSmtp()).enabled) throw new NewsletterError('ارسال ایمیل سایت خاموش است؛ اول در «ایمیل سایت» آن را تنظیم کنید', 409)
  const at = when ? new Date(String(when)) : new Date()
  if (Number.isNaN(at.getTime())) throw new NewsletterError('زمان ارسال معتبر نیست')
  return db.newsletterCampaign.update({ where: { id: current.id }, data: { status: 'SCHEDULED', scheduledAt: at } })
}

export async function campaignCancel(id: unknown) {
  const current = await campaignGet(id)
  if (current.status === 'SENT') throw new NewsletterError('کمپین ارسال شده است', 409)
  return db.newsletterCampaign.update({ where: { id: current.id }, data: { status: current.status === 'SENDING' ? 'CANCELLED' : 'DRAFT', scheduledAt: null } })
}

export async function campaignDuplicate(id: unknown, adminId: number) {
  const current = await campaignGet(id)
  return db.newsletterCampaign.create({ data: { subject: `${current.subject} (کپی)`, preheader: current.preheader, html: current.html, audience: current.audience, createdBy: adminId } })
}

export async function campaignDelete(id: unknown) {
  const current = await campaignGet(id)
  if (current.status === 'SENDING') throw new NewsletterError('کمپین در حال ارسال را اول لغو کنید', 409)
  await db.newsletterDelivery.deleteMany({ where: { campaignId: current.id } })
  await db.newsletterCampaign.delete({ where: { id: current.id } })
}

async function render(campaign: { subject: string; preheader: string; html: string }, delivery: { token: string; name: string }) {
  const { brand, base } = await site()
  const body = trackLinks(campaign.html, { base, token: delivery.token, sign })
  return { ...campaignDocument({ brand, base, subject: campaign.subject, preheader: campaign.preheader, body, token: delivery.token, name: delivery.name, unsubscribeUrl: `${base}/newsletter/unsubscribe?t=${delivery.token}` }), base }
}

export async function campaignTest(input: Record<string, unknown>, to: unknown) {
  const email = normalizeEmail(to)
  if (!email) throw new NewsletterError('نشانی ایمیل آزمایشی معتبر نیست')
  const data = validateCampaign(input)
  const doc = await render({ ...data, html: cleanRichText(data.html) }, { token: 'test-preview-token', name: '' })
  const result = await sendMail({ to: email, subject: `[آزمایشی] ${data.subject}`, text: doc.text, html: doc.html, source: 'newsletter-test' })
  if (!result.ok) throw new NewsletterError(result.error, 502)
  return { sent: true }
}

export async function campaignPreview(input: Record<string, unknown>) {
  const data = validateCampaign(input)
  return (await render({ ...data, html: cleanRichText(data.html) }, { token: 'preview', name: 'علی' })).html
}

export async function campaignReport(id: unknown) {
  const campaign = await campaignGet(id)
  const [statuses, recent] = await Promise.all([
    db.newsletterDelivery.groupBy({ by: ['status'], where: { campaignId: campaign.id }, _count: { _all: true } }),
    db.newsletterDelivery.findMany({ where: { campaignId: campaign.id, OR: [{ openedAt: { not: null } }, { status: 'FAILED' }] }, orderBy: { id: 'desc' }, take: 50, select: { email: true, status: true, error: true, openedAt: true, opens: true, clicks: true } }),
  ])
  return { campaign: { ...campaign, html: undefined }, statuses: Object.fromEntries(statuses.map((row) => [row.status, row._count._all])), recent }
}

// ------------------------------------------------------------------ sending (job scheduler)

/** A delivery claimed by a sender that stopped is sent again after this long. */
const CLAIM_MS = 15 * 60_000

/**
 * Freezes the recipient list of a due campaign. The campaign starts sending
 * only after every recipient is stored, so a failure here leaves it scheduled
 * and the next tick completes the list instead of sending to a part of it.
 */
async function startCampaign(campaign: { id: number; audience: string }, now: Date) {
  const people = await recipients(campaign.audience as Audience)
  const wanted = new Set(people.map((person) => person.email))
  const stored = (await db.newsletterDelivery.findMany({ where: { campaignId: campaign.id }, select: { email: true } })).map((row) => row.email)
  // Rows of an earlier attempt for people who are no longer recipients.
  const stale = stored.filter((email) => !wanted.has(email))
  for (let i = 0; i < stale.length; i += 500) await db.newsletterDelivery.deleteMany({ where: { campaignId: campaign.id, email: { in: stale.slice(i, i + 500) } } })
  const have = new Set(stored)
  const missing = people.filter((person) => !have.has(person.email))
  for (let i = 0; i < missing.length; i += 500) {
    await db.newsletterDelivery.createMany({ data: missing.slice(i, i + 500).map((person) => ({ campaignId: campaign.id, email: person.email, name: person.name, userId: person.userId, token: token() })) })
  }
  const claimed = await db.newsletterCampaign.updateMany({ where: { id: campaign.id, status: 'SCHEDULED' }, data: { status: 'SENDING', startedAt: now, total: people.length } })
  if (claimed.count) logEvent('info', 'newsletter.campaign_started', { id: campaign.id, recipients: people.length })
}

export async function runNewsletter(now = new Date()) {
  // 1. Due campaigns: freeze the recipient list and start sending.
  for (const campaign of await db.newsletterCampaign.findMany({ where: { status: 'SCHEDULED', scheduledAt: { lte: now } }, take: 5 })) {
    try {
      await startCampaign(campaign, now)
    } catch (error) {
      logEvent('warn', 'newsletter.campaign_start_failed', { id: campaign.id, error: String(error) })
    }
  }
  // 2. One batch for campaigns being sent.
  const smtp = await getSmtp()
  if (!smtp.enabled) return { sent: 0 }
  const settings = await getNewsletterSettings()
  const sentToday = await db.mailLog.count({ where: { status: 'SENT', createdAt: { gte: new Date(now.getTime() - 86_400_000) } } })
  let budget = batchSize(settings.perMinute, smtp.dailyLimit, sentToday)
  let sent = 0
  for (const campaign of await db.newsletterCampaign.findMany({ where: { status: 'SENDING' }, orderBy: { id: 'asc' } })) {
    if (budget <= 0) break
    // While a delivery is SENDING its sentAt is the claim time; an interrupted sender's claim expires.
    await db.newsletterDelivery.updateMany({ where: { campaignId: campaign.id, status: 'SENDING', sentAt: { lt: new Date(now.getTime() - CLAIM_MS) } }, data: { status: 'PENDING', sentAt: null } })
    const batch = await db.newsletterDelivery.findMany({ where: { campaignId: campaign.id, status: 'PENDING' }, orderBy: { id: 'asc' }, take: budget })
    if (!batch.length) {
      // Finished only when no other sender still holds a delivery.
      if (!await db.newsletterDelivery.count({ where: { campaignId: campaign.id, status: 'SENDING' } })) await db.newsletterCampaign.updateMany({ where: { id: campaign.id, status: 'SENDING' }, data: { status: 'SENT', finishedAt: now } })
      continue
    }
    for (const delivery of batch) {
      // The scheduler and a manual run may overlap: each delivery is sent by the one that claims it.
      const claimed = await db.newsletterDelivery.updateMany({ where: { id: delivery.id, status: 'PENDING' }, data: { status: 'SENDING', sentAt: new Date() } })
      if (!claimed.count) continue
      let result: Awaited<ReturnType<typeof sendMail>>
      try {
        const doc = await render(campaign, delivery)
        result = await sendMail({
          to: delivery.email, subject: campaign.subject, text: doc.text, html: doc.html, source: `newsletter:${campaign.id}`,
          headers: { 'List-Unsubscribe': `<${doc.base}/newsletter/unsubscribe?t=${delivery.token}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click', Precedence: 'bulk' },
        })
      } catch (error) {
        result = { ok: false, error: String(error) }
      }
      if (!result.ok && /سقف|daily/i.test(result.error)) { // cap reached: continue next tick
        await db.newsletterDelivery.update({ where: { id: delivery.id }, data: { status: 'PENDING', sentAt: null } })
        budget = 0
        break
      }
      await db.newsletterDelivery.update({ where: { id: delivery.id }, data: result.ok ? { status: 'SENT', sentAt: new Date() } : { status: 'FAILED', sentAt: null, error: result.error.slice(0, 300) } })
      await db.newsletterCampaign.update({ where: { id: campaign.id }, data: result.ok ? { sent: { increment: 1 } } : { failed: { increment: 1 } } })
      if (result.ok) sent++
      budget--
    }
  }
  return { sent }
}

// ------------------------------------------------------------------ tracking

export async function trackOpen(tokenValue: string) {
  const delivery = await db.newsletterDelivery.findUnique({ where: { token: tokenValue } }).catch(() => null)
  if (!delivery) return
  await db.newsletterDelivery.update({ where: { id: delivery.id }, data: { opens: { increment: 1 }, openedAt: delivery.openedAt || new Date() } })
  if (!delivery.openedAt) await db.newsletterCampaign.update({ where: { id: delivery.campaignId }, data: { opens: { increment: 1 } } }).catch(() => undefined)
}

export async function trackClick(tokenValue: string) {
  const delivery = await db.newsletterDelivery.findUnique({ where: { token: tokenValue } }).catch(() => null)
  if (!delivery) return
  await db.newsletterDelivery.update({ where: { id: delivery.id }, data: { clicks: { increment: 1 }, clickedAt: delivery.clickedAt || new Date(), openedAt: delivery.openedAt || new Date(), opens: delivery.openedAt ? undefined : { increment: 1 } } })
  if (!delivery.clickedAt) await db.newsletterCampaign.update({ where: { id: delivery.campaignId }, data: { clicks: { increment: 1 }, ...(delivery.openedAt ? {} : { opens: { increment: 1 } }) } }).catch(() => undefined)
}
