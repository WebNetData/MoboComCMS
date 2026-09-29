import { db } from '@/platform/database/prisma'
import { formatMoney } from '@/shared/money'
import { moveWallet, walletBalance } from '@/modules/wallet/server/wallet'
import { createInboxEvent } from '@/modules/notifications/server/inbox'
import {
  AdsError, CAMPAIGN_STATUS, campaignFromPackage, ctr, dayOf, fillDays, normalizeCampaign, normalizeCreative, normalizePackage, normalizePlacement,
  type CampaignStatus,
} from '@/modules/ads/domain/ads'
import { ensureBuiltinPlacements, flushAdStats, getAdsConfig, invalidateAdsCache } from '@/modules/ads/server/serving'

/** Everything the admin panel and the advertiser dashboard need: reading, editing, reports and package sales. */

const list = (value: string): string[] => { try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.map(String) : [] } catch { return [] } }
const money = (minor: bigint, currency = 'IRT') => formatMoney(minor, currency, 'fa-IR')
const daysAgo = (days: number) => dayOf(new Date(Date.now() - days * 86_400_000))

// ------------------------------------------------------------------ placements

export async function placementKeys(): Promise<string[]> {
  await ensureBuiltinPlacements()
  return (await db.adPlacement.findMany({ select: { key: true } })).map((row) => row.key)
}

export async function listPlacements() {
  await ensureBuiltinPlacements()
  const rows = await db.adPlacement.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] })
  const since = daysAgo(30)
  const stats = await db.adStatDaily.groupBy({ by: ['placementKey'], where: { day: { gte: since } }, _sum: { impressions: true, clicks: true, requests: true, empty: true } })
  const byKey = new Map(stats.map((row) => [row.placementKey, row._sum]))
  const campaigns = await db.adCampaign.findMany({ where: { status: 'ACTIVE' }, select: { placements: true } })
  return rows.map((row) => {
    const sum = byKey.get(row.key)
    const requests = sum?.requests || 0
    return {
      ...row, impressions: sum?.impressions || 0, clicks: sum?.clicks || 0, requests, fillRate: requests ? Math.round(((requests - (sum?.empty || 0)) / requests) * 100) : null,
      activeCampaigns: campaigns.filter((c) => list(c.placements).includes(row.key)).length,
    }
  })
}

export async function savePlacement(input: Record<string, unknown>, id?: number) {
  const data = normalizePlacement(input)
  invalidateAdsCache()
  if (id) {
    const current = await db.adPlacement.findUnique({ where: { id } })
    if (!current) throw new AdsError('جایگاه پیدا نشد', 404)
    // The key of a placement is used in themes and campaigns; it cannot change.
    return db.adPlacement.update({ where: { id }, data: { ...data, key: current.key } })
  }
  if (await db.adPlacement.findUnique({ where: { key: data.key } })) throw new AdsError('این کلید قبلاً ثبت شده است', 409)
  return db.adPlacement.create({ data })
}

export async function deletePlacement(id: number) {
  const row = await db.adPlacement.findUnique({ where: { id } })
  if (!row) throw new AdsError('جایگاه پیدا نشد', 404)
  if (row.builtin) throw new AdsError('جایگاه‌های پیش‌فرض حذف نمی‌شوند؛ آن را غیرفعال کنید', 409)
  const inUse = (await db.adCampaign.findMany({ where: { status: { in: ['ACTIVE', 'PENDING', 'PAUSED'] } }, select: { placements: true } })).some((c) => list(c.placements).includes(row.key))
  if (inUse) throw new AdsError('کمپین فعال یا منتظری از این جایگاه استفاده می‌کند', 409)
  invalidateAdsCache()
  await db.adPlacement.delete({ where: { id } })
}

// ------------------------------------------------------------------ campaigns

const campaignRow = (c: Awaited<ReturnType<typeof db.adCampaign.findFirstOrThrow>> & { advertiser?: { name: string; company: string } | null; creatives?: { id: number }[] }) => ({
  id: c.id, name: c.name, status: c.status, priority: c.priority, startsAt: c.startsAt?.toISOString() || null, endsAt: c.endsAt?.toISOString() || null, placements: list(c.placements), devices: c.devices, audience: c.audience,
  impressions: c.impressions, clicks: c.clicks, ctr: ctr(c.impressions, c.clicks), maxImpressions: c.maxImpressions, maxClicks: c.maxClicks, paid: c.paidMinor > 0n ? money(c.paidMinor, c.currency) : '',
  advertiser: c.advertiser ? c.advertiser.company || c.advertiser.name : '', advertiserId: c.advertiserId, creatives: c.creatives?.length ?? 0, packageId: c.packageId, updatedAt: c.updatedAt.toISOString(),
})

export async function listCampaigns(input: { status?: string; q?: string; advertiserId?: number; page?: number } = {}) {
  const where: Record<string, unknown> = {}
  if (input.status && CAMPAIGN_STATUS.includes(input.status as CampaignStatus)) where.status = input.status
  if (input.advertiserId) where.advertiserId = input.advertiserId
  const q = String(input.q || '').trim().slice(0, 80)
  if (q) where.name = { contains: q }
  const page = Math.max(1, Number(input.page) || 1)
  const [rows, total, counts] = await Promise.all([
    db.adCampaign.findMany({ where, orderBy: [{ updatedAt: 'desc' }], skip: (page - 1) * 30, take: 30, include: { advertiser: { select: { name: true, company: true } }, creatives: { select: { id: true } } } }),
    db.adCampaign.count({ where }),
    db.adCampaign.groupBy({ by: ['status'], _count: { _all: true } }),
  ])
  return { rows: rows.map(campaignRow), total, page, pages: Math.max(1, Math.ceil(total / 30)), counts: Object.fromEntries(counts.map((row) => [row.status, row._count._all])) }
}

export async function getCampaign(id: number) {
  const campaign = await db.adCampaign.findUnique({ where: { id }, include: { advertiser: true, creatives: { orderBy: { id: 'asc' } } } })
  if (!campaign) throw new AdsError('کمپین پیدا نشد', 404)
  await flushAdStats()
  const since = daysAgo(29)
  const [daily, byPlacement] = await Promise.all([
    db.adStatDaily.groupBy({ by: ['day'], where: { campaignId: id, day: { gte: since } }, _sum: { impressions: true, clicks: true } }),
    db.adStatDaily.groupBy({ by: ['placementKey'], where: { campaignId: id }, _sum: { impressions: true, clicks: true } }),
  ])
  return {
    campaign: {
      ...campaignRow(campaign), includePaths: list(campaign.includePaths), excludePaths: list(campaign.excludePaths), languages: list(campaign.languages), hours: campaign.hours,
      dailyImpressions: campaign.dailyImpressions, dailyClicks: campaign.dailyClicks, note: campaign.note, rejectReason: campaign.rejectReason, approvedAt: campaign.approvedAt?.toISOString() || null,
      advertiserInfo: campaign.advertiser ? { id: campaign.advertiser.id, name: campaign.advertiser.name, company: campaign.advertiser.company, email: campaign.advertiser.email, phone: campaign.advertiser.phone, userId: campaign.advertiser.userId } : null,
    },
    creatives: campaign.creatives.map((x) => ({ ...x, createdAt: x.createdAt.toISOString(), updatedAt: x.updatedAt.toISOString(), ctr: ctr(x.impressions, x.clicks) })),
    series: fillDays(daily.map((row) => ({ day: row.day, impressions: row._sum.impressions || 0, clicks: row._sum.clicks || 0 })), dayOf(new Date()), 30),
    byPlacement: byPlacement.map((row) => ({ key: row.placementKey, impressions: row._sum.impressions || 0, clicks: row._sum.clicks || 0, ctr: ctr(row._sum.impressions || 0, row._sum.clicks || 0) })),
  }
}

export async function saveCampaign(input: Record<string, unknown>, id?: number) {
  const data = normalizeCampaign(input, await placementKeys())
  const stored = { ...data, placements: JSON.stringify(data.placements), includePaths: JSON.stringify(data.includePaths), excludePaths: JSON.stringify(data.excludePaths), languages: JSON.stringify(data.languages) }
  invalidateAdsCache()
  if (id) {
    if (!await db.adCampaign.findUnique({ where: { id }, select: { id: true } })) throw new AdsError('کمپین پیدا نشد', 404)
    return db.adCampaign.update({ where: { id }, data: stored })
  }
  const advertiserId = Number(input.advertiserId) > 0 ? Number(input.advertiserId) : null
  if (advertiserId && !await db.advertiser.findUnique({ where: { id: advertiserId }, select: { id: true } })) throw new AdsError('تبلیغ‌دهنده پیدا نشد', 404)
  return db.adCampaign.create({ data: { ...stored, advertiserId, status: 'DRAFT' } })
}

async function notifyOwner(campaignId: number, kind: 'approved' | 'rejected' | 'paused' | 'resumed', extra = '') {
  const campaign = await db.adCampaign.findUnique({ where: { id: campaignId }, select: { name: true, advertiser: { select: { userId: true } } } })
  const userId = campaign?.advertiser?.userId
  if (!userId || !campaign) return
  const text = {
    approved: [`کمپین «${campaign.name}» تأیید و فعال شد`, 'نمایش تبلیغ شما آغاز شده است؛ آمار آن را در بخش تبلیغات می‌بینید.'],
    rejected: [`کمپین «${campaign.name}» تأیید نشد`, `${extra ? `دلیل: ${extra}. ` : ''}مبلغ پرداختی به کیف پول شما برگشت.`],
    paused: [`کمپین «${campaign.name}» متوقف شد`, extra || 'مدیر نمایش این کمپین را متوقف کرد.'],
    resumed: [`کمپین «${campaign.name}» دوباره فعال شد`, 'نمایش تبلیغ از سر گرفته شد.'],
  }[kind]
  await createInboxEvent({ userId, kind: 'ADS', dedupeKey: `ads:${kind}:${campaignId}:${Math.floor(Date.now() / 60_000)}`, titleFa: text[0], titleEn: 'Advertising update', bodyFa: text[1], bodyEn: text[1], href: '/dashboard/ads' }).catch(() => undefined)
}

/** Moves a campaign along its life: review, start, pause, end. A rejected paid campaign is refunded. */
export async function setCampaignStatus(id: number, status: string, options: { reason?: string } = {}) {
  if (!CAMPAIGN_STATUS.includes(status as CampaignStatus)) throw new AdsError('وضعیت نامعتبر است')
  const campaign = await db.adCampaign.findUnique({ where: { id }, include: { creatives: { where: { active: true } }, advertiser: true } })
  if (!campaign) throw new AdsError('کمپین پیدا نشد', 404)
  const data: Record<string, unknown> = { status }
  if (campaign.status === 'REJECTED' && status !== 'REJECTED' && campaign.paidMinor > 0n) throw new AdsError('این کمپین رد و مبلغ آن برگردانده شده است؛ تبلیغ‌دهنده باید بستهٔ تازه بخرد', 409)
  if (status === 'ACTIVE') {
    if (!campaign.creatives.length) throw new AdsError('برای فعال‌کردن، حداقل یک تبلیغ (بنر یا متن) لازم است', 409)
    if (!list(campaign.placements).length) throw new AdsError('جایگاهی انتخاب نشده است', 409)
    // A bought package starts running the day it is approved.
    if (campaign.packageId && !campaign.approvedAt) {
      const pkg = await db.adPackage.findUnique({ where: { id: campaign.packageId } })
      const now = new Date()
      data.startsAt = now
      data.endsAt = new Date(now.getTime() + (pkg?.days || 30) * 86_400_000)
    }
    if (campaign.endsAt && campaign.endsAt <= new Date() && !data.endsAt) throw new AdsError('تاریخ پایان کمپین گذشته است؛ آن را اصلاح کنید', 409)
    data.approvedAt = campaign.approvedAt || new Date()
    data.rejectReason = ''
  }
  if (status === 'REJECTED') {
    const reason = String(options.reason || '').replace(/[<>]/g, '').trim().slice(0, 300)
    if (!reason) throw new AdsError('دلیل رد را بنویسید')
    data.rejectReason = reason
    if (campaign.paidMinor > 0n && campaign.advertiser?.userId && campaign.status !== 'REJECTED') {
      const refund = await moveWallet({ userId: campaign.advertiser.userId, amount: Number(campaign.paidMinor), currency: campaign.currency, type: 'REFUND', description: `برگشت هزینهٔ کمپین تبلیغاتی «${campaign.name}»`, idempotencyKey: `ads:refund:${campaign.id}` })
      if (!refund.ok) throw new AdsError(`برگشت وجه انجام نشد: ${refund.message}`, 502)
    }
  }
  await db.adCampaign.update({ where: { id }, data })
  invalidateAdsCache()
  if (status === 'ACTIVE' && campaign.status !== 'ACTIVE') await notifyOwner(id, campaign.status === 'PAUSED' ? 'resumed' : 'approved')
  if (status === 'REJECTED') await notifyOwner(id, 'rejected', String(data.rejectReason))
  if (status === 'PAUSED' && campaign.status === 'ACTIVE') await notifyOwner(id, 'paused', options.reason)
}

export async function deleteCampaign(id: number) {
  const campaign = await db.adCampaign.findUnique({ where: { id }, select: { impressions: true, status: true, paidMinor: true } })
  if (!campaign) return
  if (campaign.impressions > 0 || campaign.paidMinor > 0n) throw new AdsError('کمپینی که نمایش یا پرداخت دارد حذف نمی‌شود؛ آن را پایان‌یافته کنید تا گزارش‌ها بماند', 409)
  await db.adCampaign.delete({ where: { id } })
  invalidateAdsCache()
}

// ------------------------------------------------------------------ creatives

export async function saveCreative(campaignId: number, input: Record<string, unknown>, options: { admin: boolean }, id?: number) {
  const campaign = await db.adCampaign.findUnique({ where: { id: campaignId }, select: { id: true, status: true } })
  if (!campaign) throw new AdsError('کمپین پیدا نشد', 404)
  const data = normalizeCreative(input, options)
  invalidateAdsCache()
  if (id) {
    const current = await db.adCreative.findFirst({ where: { id, campaignId } })
    if (!current) throw new AdsError('تبلیغ پیدا نشد', 404)
    return db.adCreative.update({ where: { id }, data })
  }
  if (await db.adCreative.count({ where: { campaignId } }) >= 12) throw new AdsError('حداکثر ۱۲ تبلیغ برای هر کمپین', 409)
  return db.adCreative.create({ data: { ...data, campaignId } })
}

export async function deleteCreative(campaignId: number, id: number) {
  await db.adCreative.deleteMany({ where: { id, campaignId } })
  invalidateAdsCache()
}

// ------------------------------------------------------------------ advertisers & packages

export async function listAdvertisers(q = '') {
  const rows = await db.advertiser.findMany({ where: q ? { OR: [{ name: { contains: q } }, { company: { contains: q } }, { email: { contains: q } }] } : {}, orderBy: { updatedAt: 'desc' }, take: 200, include: { campaigns: { select: { status: true, impressions: true, clicks: true, paidMinor: true } } } })
  return rows.map((row) => ({
    id: row.id, userId: row.userId, name: row.name, company: row.company, email: row.email, phone: row.phone, website: row.website, notes: row.notes, status: row.status,
    campaigns: row.campaigns.length, active: row.campaigns.filter((c) => c.status === 'ACTIVE').length, impressions: row.campaigns.reduce((sum, c) => sum + c.impressions, 0),
    clicks: row.campaigns.reduce((sum, c) => sum + c.clicks, 0), spent: money(row.campaigns.reduce((sum, c) => sum + c.paidMinor, 0n)),
  }))
}

const clean = (value: unknown, max: number) => String(value ?? '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, max)

export async function saveAdvertiser(input: Record<string, unknown>, id?: number) {
  const name = clean(input.name, 100)
  if (!name) throw new AdsError('نام تبلیغ‌دهنده را وارد کنید')
  const data = { name, company: clean(input.company, 100), email: clean(input.email, 120), phone: clean(input.phone, 30), website: clean(input.website, 200), notes: clean(input.notes, 500), status: input.status === 'BLOCKED' ? 'BLOCKED' : 'ACTIVE' }
  if (id) return db.advertiser.update({ where: { id }, data })
  const userId = Number(input.userId) > 0 ? Number(input.userId) : null
  if (userId) {
    if (!await db.user.findUnique({ where: { id: userId }, select: { id: true } })) throw new AdsError('کاربر پیدا نشد', 404)
    if (await db.advertiser.findUnique({ where: { userId }, select: { id: true } })) throw new AdsError('این کاربر قبلاً تبلیغ‌دهنده است', 409)
  }
  return db.advertiser.create({ data: { ...data, userId } })
}

export async function listPackages() {
  const rows = await db.adPackage.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] })
  return rows.map((row) => ({ ...row, placements: list(row.placements), price: row.priceMinor.toString(), priceLabel: money(row.priceMinor, row.currency), priceMinor: undefined }))
}

export async function savePackage(input: Record<string, unknown>, id?: number) {
  const data = normalizePackage(input, await placementKeys())
  const stored = { ...data, placements: JSON.stringify(data.placements) }
  if (id) return db.adPackage.update({ where: { id }, data: stored })
  return db.adPackage.create({ data: stored })
}

export async function deletePackage(id: number) {
  const pkg = await db.adPackage.findUnique({ where: { id }, select: { sold: true } })
  if (!pkg) return
  if (pkg.sold > 0) { await db.adPackage.update({ where: { id }, data: { active: false } }); return }
  await db.adPackage.delete({ where: { id } })
}

// ------------------------------------------------------------------ overview & reports

export async function adsOverview(days = 30) {
  await flushAdStats()
  const span = [7, 30, 90].includes(days) ? days : 30
  const since = daysAgo(span - 1)
  const [daily, byCampaign, byPlacement, counts, revenue, pending] = await Promise.all([
    db.adStatDaily.groupBy({ by: ['day'], where: { day: { gte: since }, creativeId: { gt: 0 } }, _sum: { impressions: true, clicks: true } }),
    db.adStatDaily.groupBy({ by: ['campaignId'], where: { day: { gte: since }, campaignId: { gt: 0 } }, _sum: { impressions: true, clicks: true }, orderBy: { _sum: { impressions: 'desc' } }, take: 8 }),
    db.adStatDaily.groupBy({ by: ['placementKey'], where: { day: { gte: since } }, _sum: { impressions: true, clicks: true, requests: true, empty: true } }),
    db.adCampaign.groupBy({ by: ['status'], _count: { _all: true } }),
    db.adCampaign.findMany({ where: { approvedAt: { gte: new Date(Date.now() - span * 86_400_000) }, paidMinor: { gt: 0n } }, select: { paidMinor: true, currency: true } }),
    db.adCampaign.findMany({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' }, take: 6, select: { id: true, name: true, createdAt: true, paidMinor: true, currency: true, advertiser: { select: { name: true, company: true } } } }),
  ])
  const names = new Map((await db.adCampaign.findMany({ where: { id: { in: byCampaign.map((row) => row.campaignId) } }, select: { id: true, name: true, status: true } })).map((row) => [row.id, row]))
  const series = fillDays(daily.map((row) => ({ day: row.day, impressions: row._sum.impressions || 0, clicks: row._sum.clicks || 0 })), dayOf(new Date()), span)
  const impressions = series.reduce((sum, row) => sum + row.impressions, 0)
  const clicks = series.reduce((sum, row) => sum + row.clicks, 0)
  const revenueMinor = revenue.reduce((sum, row) => sum + row.paidMinor, 0n)
  const count = (status: string) => counts.find((row) => row.status === status)?._count._all || 0
  return {
    days: span, kpis: { impressions, clicks, ctr: ctr(impressions, clicks), active: count('ACTIVE'), pending: count('PENDING'), revenue: money(revenueMinor), revenueMinor: revenueMinor.toString() },
    series,
    topCampaigns: byCampaign.map((row) => ({ id: row.campaignId, name: names.get(row.campaignId)?.name || `#${row.campaignId}`, status: names.get(row.campaignId)?.status || '', impressions: row._sum.impressions || 0, clicks: row._sum.clicks || 0, ctr: ctr(row._sum.impressions || 0, row._sum.clicks || 0) })),
    placements: byPlacement.filter((row) => row.placementKey).map((row) => {
      const requests = row._sum.requests || 0
      return { key: row.placementKey, impressions: row._sum.impressions || 0, clicks: row._sum.clicks || 0, ctr: ctr(row._sum.impressions || 0, row._sum.clicks || 0), requests, fillRate: requests ? Math.round(((requests - (row._sum.empty || 0)) / requests) * 100) : null }
    }).sort((a, b) => b.impressions - a.impressions),
    pending: pending.map((row) => ({ id: row.id, name: row.name, advertiser: row.advertiser ? row.advertiser.company || row.advertiser.name : '', createdAt: row.createdAt.toISOString(), paid: row.paidMinor > 0n ? money(row.paidMinor, row.currency) : '' })),
  }
}

const csvCell = (value: unknown) => { const text = String(value ?? ''); return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text }

/** Day by day, creative by creative — for the advertiser's own accounting. */
export async function campaignCsv(campaignId: number, options: { from?: string; to?: string } = {}) {
  await flushAdStats()
  const campaign = await db.adCampaign.findUnique({ where: { id: campaignId }, include: { creatives: { select: { id: true, title: true, kind: true } } } })
  if (!campaign) throw new AdsError('کمپین پیدا نشد', 404)
  const from = /^\d{4}-\d{2}-\d{2}$/.test(options.from || '') ? options.from! : '0000-00-00'
  const to = /^\d{4}-\d{2}-\d{2}$/.test(options.to || '') ? options.to! : '9999-12-31'
  const rows = await db.adStatDaily.findMany({ where: { campaignId, day: { gte: from, lte: to }, creativeId: { gt: 0 } }, orderBy: [{ day: 'asc' }, { creativeId: 'asc' }] })
  const titles = new Map(campaign.creatives.map((row) => [row.id, row.title || `${row.kind} #${row.id}`]))
  const lines = [['date', 'creative', 'placement', 'impressions', 'clicks', 'ctr_percent'].join(',')]
  for (const row of rows) lines.push([row.day, titles.get(row.creativeId) || row.creativeId, row.placementKey, row.impressions, row.clicks, ctr(row.impressions, row.clicks)].map(csvCell).join(','))
  return { name: campaign.name, csv: `﻿${lines.join('\n')}\n` }
}

// ------------------------------------------------------------------ self-serve advertisers

async function notifyAdmins(title: string, body: string, dedupe: string) {
  if (!(await getAdsConfig()).notifyAdmins) return
  const admins = await db.user.findMany({ where: { role: 'ADMIN', status: 'ACTIVE' }, select: { id: true }, take: 20 })
  await Promise.all(admins.map((admin) => createInboxEvent({ userId: admin.id, kind: 'ADS', dedupeKey: `${dedupe}:${admin.id}`, titleFa: title, titleEn: 'Advertising: review needed', bodyFa: body, bodyEn: body, href: '/admin/ads/campaigns?status=PENDING' }).catch(() => undefined)))
}

/** What the public "advertise with us" page and the buy form show. */
export async function publicPackages() {
  await ensureBuiltinPlacements()
  const [packages, placements] = await Promise.all([db.adPackage.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { priceMinor: 'asc' }] }), db.adPlacement.findMany({ where: { active: true } })])
  const byKey = new Map(placements.map((row) => [row.key, row]))
  return packages.map((pkg) => ({
    id: pkg.id, name: pkg.name, description: pkg.description, days: pkg.days, impressions: pkg.impressions, clicks: pkg.clicks, price: pkg.priceMinor.toString(), priceLabel: money(pkg.priceMinor, pkg.currency),
    placements: list(pkg.placements).flatMap((key) => { const p = byKey.get(key); return p ? [{ key, name: p.name, width: p.width, height: p.height }] : [] }),
  }))
}

/**
 * An advertiser buys a package from their wallet and sends the banner. The
 * campaign waits for the administrator's review (a rejection refunds it).
 */
export async function buyPackage(userId: number, input: { packageId: unknown; requestId: unknown; advertiser?: Record<string, unknown>; creative: Record<string, unknown> }) {
  const config = await getAdsConfig()
  if (!config.selfServe) throw new AdsError('خرید بستهٔ تبلیغاتی فعلاً بسته است', 403)
  const requestId = String(input.requestId || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40)
  if (requestId.length < 8) throw new AdsError('درخواست نامعتبر است')
  const pkg = await db.adPackage.findUnique({ where: { id: Number(input.packageId) || 0 } })
  if (!pkg || !pkg.active) throw new AdsError('این بسته در دسترس نیست', 404)
  const creative = normalizeCreative(input.creative || {}, { admin: false })
  const marker = `req:${requestId}`
  const existing = await db.adCampaign.findFirst({ where: { note: { startsWith: marker }, advertiser: { userId } }, select: { id: true } })
  if (existing) return { campaignId: existing.id, repeated: true }

  const user = await db.user.findUnique({ where: { id: userId }, select: { name: true, email: true, phone: true } })
  if (!user) throw new AdsError('کاربر پیدا نشد', 404)
  let advertiser = await db.advertiser.findUnique({ where: { userId } })
  if (advertiser?.status === 'BLOCKED') throw new AdsError('حساب تبلیغاتی شما مسدود است', 403)
  const info = input.advertiser || {}
  if (!advertiser) advertiser = await db.advertiser.create({ data: { userId, name: clean(info.name, 100) || user.name || 'تبلیغ‌دهنده', company: clean(info.company, 100), email: user.email || '', phone: clean(info.phone, 30) || user.phone || '', website: clean(info.website, 200) } })

  const price = Number(pkg.priceMinor)
  const paid = await moveWallet({ userId, amount: -price, currency: pkg.currency, type: 'PURCHASE', description: `خرید بستهٔ تبلیغاتی «${pkg.name}»`, idempotencyKey: `ads:buy:${userId}:${pkg.id}:${requestId}` })
  if (!paid.ok) {
    if (/insufficient/i.test(paid.message || '')) {
      const balance = await walletBalance(userId, pkg.currency)
      throw new AdsError('موجودی کیف پول کافی نیست', 402, { shortfall: Math.max(0, price - balance), currency: pkg.currency })
    }
    throw new AdsError(paid.message || 'پرداخت انجام نشد', 502)
  }
  const plan = campaignFromPackage({ name: pkg.name, placements: list(pkg.placements), days: pkg.days, impressions: pkg.impressions, clicks: pkg.clicks }, advertiser.company || advertiser.name)
  const campaign = await db.adCampaign.create({
    data: {
      advertiserId: advertiser.id, name: plan.name, status: 'PENDING', priority: 5, placements: JSON.stringify(plan.placements), maxImpressions: plan.maxImpressions, maxClicks: plan.maxClicks,
      packageId: pkg.id, paidMinor: pkg.priceMinor, currency: pkg.currency, note: `${marker} · ${pkg.name}`, creatives: { create: [creative] },
    },
  })
  await db.adPackage.update({ where: { id: pkg.id }, data: { sold: { increment: 1 } } })
  await notifyAdmins('کمپین تبلیغاتی تازه منتظر بررسی', `«${campaign.name}» (${money(pkg.priceMinor, pkg.currency)}) پرداخت شده و منتظر تأیید بنر است.`, `ads:new:${campaign.id}`)
  return { campaignId: campaign.id, repeated: false }
}

/** The advertiser's own campaigns with their results. */
export async function advertiserPortal(userId: number) {
  const advertiser = await db.advertiser.findUnique({ where: { userId } })
  const campaigns = advertiser ? await db.adCampaign.findMany({ where: { advertiserId: advertiser.id }, orderBy: { createdAt: 'desc' }, include: { creatives: { orderBy: { id: 'asc' } } } }) : []
  await flushAdStats()
  const since = daysAgo(29)
  const daily = campaigns.length ? await db.adStatDaily.groupBy({ by: ['campaignId', 'day'], where: { campaignId: { in: campaigns.map((c) => c.id) }, day: { gte: since } }, _sum: { impressions: true, clicks: true } }) : []
  return {
    advertiser: advertiser ? { id: advertiser.id, name: advertiser.name, company: advertiser.company, status: advertiser.status } : null,
    campaigns: campaigns.map((c) => ({
      id: c.id, name: c.name, status: c.status, startsAt: c.startsAt?.toISOString() || null, endsAt: c.endsAt?.toISOString() || null, placements: list(c.placements), impressions: c.impressions, clicks: c.clicks, ctr: ctr(c.impressions, c.clicks),
      maxImpressions: c.maxImpressions, maxClicks: c.maxClicks, paid: money(c.paidMinor, c.currency), rejectReason: c.rejectReason,
      creatives: c.creatives.map((x) => ({ id: x.id, kind: x.kind, title: x.title, imageUrl: x.imageUrl, linkUrl: x.linkUrl, text: x.text, alt: x.alt, cta: x.cta })),
      series: fillDays(daily.filter((row) => row.campaignId === c.id).map((row) => ({ day: row.day, impressions: row._sum.impressions || 0, clicks: row._sum.clicks || 0 })), dayOf(new Date()), 30),
    })),
  }
}

/** Advertisers change their banner (it goes back to review if it was live) or pause and resume the campaign. */
export async function advertiserAction(userId: number, campaignId: number, action: string, input: Record<string, unknown> = {}) {
  const campaign = await db.adCampaign.findFirst({ where: { id: campaignId, advertiser: { userId } }, include: { creatives: { orderBy: { id: 'asc' }, take: 1 } } })
  if (!campaign) throw new AdsError('کمپین پیدا نشد', 404)
  if (action === 'pause' || action === 'resume') {
    if (action === 'pause' && campaign.status !== 'ACTIVE') throw new AdsError('فقط کمپین فعال متوقف می‌شود', 409)
    if (action === 'resume' && campaign.status !== 'PAUSED') throw new AdsError('فقط کمپین متوقف‌شده ادامه پیدا می‌کند', 409)
    await db.adCampaign.update({ where: { id: campaignId }, data: { status: action === 'pause' ? 'PAUSED' : 'ACTIVE' } })
    invalidateAdsCache()
    return
  }
  if (action === 'creative') {
    if (campaign.status === 'ENDED') throw new AdsError('این کمپین پایان یافته است', 409)
    // A rejected campaign was refunded; running it again needs a new purchase.
    if (campaign.status === 'REJECTED') throw new AdsError('این کمپین رد شد و مبلغ آن برگشت؛ برای ادامه بستهٔ تازه بخرید', 409)
    const first = campaign.creatives[0]
    await saveCreative(campaignId, input, { admin: false }, first?.id)
    // A live banner that changes is reviewed again; a rejected one is offered for review once more.
    if (['ACTIVE', 'PAUSED'].includes(campaign.status)) {
      await db.adCampaign.update({ where: { id: campaignId }, data: { status: 'PENDING', rejectReason: '' } })
      invalidateAdsCache()
      await notifyAdmins('بنر کمپین ویرایش شد', `«${campaign.name}» دوباره منتظر بررسی است.`, `ads:edit:${campaignId}:${Math.floor(Date.now() / 60_000)}`)
    }
    return
  }
  throw new AdsError('عملیات نامعتبر است')
}
