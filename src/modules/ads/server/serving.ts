import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { db } from '@/platform/database/prisma'
import { authSecret } from '@/platform/config/env'
import { logEvent } from '@/platform/observability/logger'
import { kv } from '@/platform/cache/kv'
import { readJsonSetting, writeJsonSetting } from '@/modules/settings/server'
import {
  BUILTIN_PLACEMENTS, cleanPath, dayOf, deviceOf, ineligible, isBot, pickCampaign, pickCreative, shouldEnd,
  type CampaignView, type ServeContext,
} from '@/modules/ads/domain/ads'

/**
 * Serving: which promotion a visitor sees in a placement, and counting what
 * happens to it. Nothing here runs while a page renders — the page asks
 * /api/promo/serve after it loads — so cached pages never freeze an ad.
 *
 * Counting is batched in memory (`globalThis`, shared by every bundle) and
 * written to the database every few seconds.
 */

const CONFIG_KEY = 'ads.config.v1'
const CACHE_MS = 10_000
const TOKEN_TTL_S = 30 * 60
const FLUSH_MS = 15_000

export interface AdsConfig {
  enabled: boolean
  /** Who never sees promotions: nobody, VIP members, or every signed-in user. */
  hideFor: 'NONE' | 'VIP' | 'MEMBERS'
  /** Advertisers may buy packages and submit banners themselves. */
  selfServe: boolean
  /** Label shown on every promotion. */
  label: string
  /** A click from one visitor on one banner counts once in this many minutes. */
  clickDedupeMinutes: number
  notifyAdmins: boolean
}

export const DEFAULT_ADS: AdsConfig = { enabled: true, hideFor: 'NONE', selfServe: true, label: 'تبلیغ', clickDedupeMinutes: 30, notifyAdmins: true }

export async function getAdsConfig(): Promise<AdsConfig> {
  const stored = (await readJsonSetting(CONFIG_KEY)) || {}
  return {
    enabled: stored.enabled !== false,
    hideFor: stored.hideFor === 'VIP' || stored.hideFor === 'MEMBERS' ? stored.hideFor : 'NONE',
    selfServe: stored.selfServe !== false,
    label: String(stored.label || DEFAULT_ADS.label).replace(/[<>]/g, '').slice(0, 20) || DEFAULT_ADS.label,
    clickDedupeMinutes: Math.min(1440, Math.max(1, Math.round(Number(stored.clickDedupeMinutes)) || DEFAULT_ADS.clickDedupeMinutes)),
    notifyAdmins: stored.notifyAdmins !== false,
  }
}

export async function saveAdsConfig(input: Record<string, unknown>): Promise<AdsConfig> {
  const previous = await getAdsConfig()
  const next: AdsConfig = {
    enabled: input.enabled === undefined ? previous.enabled : !!input.enabled,
    hideFor: input.hideFor === 'VIP' || input.hideFor === 'MEMBERS' ? input.hideFor : input.hideFor === 'NONE' ? 'NONE' : previous.hideFor,
    selfServe: input.selfServe === undefined ? previous.selfServe : !!input.selfServe,
    label: input.label === undefined ? previous.label : String(input.label).replace(/[<>]/g, '').trim().slice(0, 20) || DEFAULT_ADS.label,
    clickDedupeMinutes: input.clickDedupeMinutes === undefined ? previous.clickDedupeMinutes : Math.min(1440, Math.max(1, Math.round(Number(input.clickDedupeMinutes)) || previous.clickDedupeMinutes)),
    notifyAdmins: input.notifyAdmins === undefined ? previous.notifyAdmins : !!input.notifyAdmins,
  }
  await writeJsonSetting(CONFIG_KEY, next)
  invalidateAdsCache()
  return next
}

// ------------------------------------------------------------------ shared state

interface PlacementRow { key: string; name: string; width: number; height: number; device: string; kind: string; active: boolean; fallbackHtml: string }
interface CreativeRow { id: number; campaignId: number; kind: string; title: string; imageUrl: string; imageMobileUrl: string; alt: string; linkUrl: string; html: string; text: string; cta: string; weight: number }
type CampaignRow = CampaignView & { creatives: CreativeRow[] }
interface Counter { imp: number; clk: number; req: number; empty: number }
interface State {
  cache: { at: number; campaigns: CampaignRow[]; placements: Map<string, PlacementRow>; creatives: Map<number, CreativeRow> } | null
  today: { at: number; day: string; byCampaign: Map<number, { imp: number; clk: number }> } | null
  counters: Map<string, Counter>
  nonces: Map<string, number>
  timer: ReturnType<typeof setTimeout> | null
  builtinDone: boolean
  secret: string
}
const g = globalThis as unknown as { __mobocomAds?: State }
const state = (): State => (g.__mobocomAds ??= { cache: null, today: null, counters: new Map(), nonces: new Map(), timer: null, builtinDone: false, secret: '' })

export function invalidateAdsCache() { const s = state(); s.cache = null; s.today = null }

const json = <T>(value: string, fallback: T): T => { try { const parsed = JSON.parse(value); return parsed ?? fallback } catch { return fallback } }

/** Placements every site starts with are created once and never overwritten afterwards. */
export async function ensureBuiltinPlacements() {
  const s = state()
  if (s.builtinDone) return
  const existing = new Set((await db.adPlacement.findMany({ select: { key: true } })).map((row) => row.key))
  for (const def of BUILTIN_PLACEMENTS) {
    if (!existing.has(def.key)) await db.adPlacement.create({ data: { ...def, builtin: true } }).catch(() => undefined)
  }
  s.builtinDone = true
}

async function load() {
  const s = state()
  if (s.cache && Date.now() - s.cache.at < CACHE_MS) return s.cache
  await ensureBuiltinPlacements()
  const [campaigns, placements] = await Promise.all([
    db.adCampaign.findMany({ where: { status: 'ACTIVE' }, include: { creatives: { where: { active: true } } } }),
    db.adPlacement.findMany(),
  ])
  const creatives = new Map<number, CreativeRow>()
  const rows: CampaignRow[] = campaigns.map((c) => {
    const list = c.creatives.map((x) => ({ id: x.id, campaignId: x.campaignId, kind: x.kind, title: x.title, imageUrl: x.imageUrl, imageMobileUrl: x.imageMobileUrl, alt: x.alt, linkUrl: x.linkUrl, html: x.html, text: x.text, cta: x.cta, weight: x.weight }))
    for (const item of list) creatives.set(item.id, item)
    return {
      id: c.id, status: c.status, priority: c.priority, startsAt: c.startsAt, endsAt: c.endsAt, placements: json<string[]>(c.placements, []), devices: c.devices, audience: c.audience,
      includePaths: json<string[]>(c.includePaths, []), excludePaths: json<string[]>(c.excludePaths, []), languages: json<string[]>(c.languages, []), hours: c.hours,
      maxImpressions: c.maxImpressions, maxClicks: c.maxClicks, dailyImpressions: c.dailyImpressions, dailyClicks: c.dailyClicks, impressions: c.impressions, clicks: c.clicks, creatives: list,
    }
  })
  s.cache = { at: Date.now(), campaigns: rows, placements: new Map(placements.map((p) => [p.key, { key: p.key, name: p.name, width: p.width, height: p.height, device: p.device, kind: p.kind, active: p.active, fallbackHtml: p.fallbackHtml }])), creatives }
  return s.cache
}

/** Today's totals per campaign (database + what is still waiting in memory), refreshed every 30 s. */
async function today(): Promise<Map<number, { imp: number; clk: number }>> {
  const s = state()
  const day = dayOf(new Date())
  if (!s.today || s.today.day !== day || Date.now() - s.today.at > 30_000) {
    const rows = await db.adStatDaily.groupBy({ by: ['campaignId'], where: { day, campaignId: { gt: 0 } }, _sum: { impressions: true, clicks: true } }).catch(() => [])
    s.today = { at: Date.now(), day, byCampaign: new Map(rows.map((row) => [row.campaignId, { imp: row._sum.impressions || 0, clk: row._sum.clicks || 0 }])) }
  }
  return s.today.byCampaign
}

// ------------------------------------------------------------------ tokens

const secret = () => { const s = state(); return (s.secret ||= createHmac('sha256', authSecret()).update('promo-tokens:v1').digest('hex')) }
const sign = (body: string) => createHmac('sha256', secret()).update(body).digest('base64url')

interface TokenPayload { c: number; p: string; n: string; e: number }
export function signToken(payload: TokenPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${sign(body)}`
}
export function verifyToken(token: string): TokenPayload | null {
  const [body, mac] = String(token || '').split('.')
  if (!body || !mac) return null
  const expected = sign(body)
  if (mac.length !== expected.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenPayload
    return payload.e * 1000 > Date.now() && Number.isSafeInteger(payload.c) && typeof payload.p === 'string' ? payload : null
  } catch { return null }
}

// ------------------------------------------------------------------ counting

function bump(day: string, campaignId: number, creativeId: number, placement: string, field: keyof Counter, by = 1) {
  const s = state()
  const key = `${day}|${campaignId}|${creativeId}|${placement}`
  const row = s.counters.get(key) || { imp: 0, clk: 0, req: 0, empty: 0 }
  row[field] += by
  s.counters.set(key, row)
  if (!s.timer) { s.timer = setTimeout(() => { s.timer = null; void flushAdStats() }, FLUSH_MS); s.timer.unref?.() }
}

/** Writes the waiting counters (per day, creative and placement) and campaign totals; ends finished campaigns. */
export async function flushAdStats(): Promise<number> {
  const s = state()
  if (!s.counters.size) return settleCampaigns()
  const batch = [...s.counters]
  s.counters.clear()
  const campaignTotals = new Map<number, { imp: number; clk: number }>()
  const creativeTotals = new Map<number, { imp: number; clk: number }>()
  for (const [key, row] of batch) {
    const [day, campaignRaw, creativeRaw, placementKey] = key.split('|')
    const campaignId = Number(campaignRaw), creativeId = Number(creativeRaw)
    try {
      await db.adStatDaily.upsert({
        where: { day_creativeId_placementKey: { day, creativeId, placementKey } },
        create: { day, campaignId, creativeId, placementKey, impressions: row.imp, clicks: row.clk, requests: row.req, empty: row.empty },
        update: { impressions: { increment: row.imp }, clicks: { increment: row.clk }, requests: { increment: row.req }, empty: { increment: row.empty } },
      })
      if (creativeId > 0) {
        const c = campaignTotals.get(campaignId) || { imp: 0, clk: 0 }; c.imp += row.imp; c.clk += row.clk; campaignTotals.set(campaignId, c)
        const k = creativeTotals.get(creativeId) || { imp: 0, clk: 0 }; k.imp += row.imp; k.clk += row.clk; creativeTotals.set(creativeId, k)
      }
    } catch (error) {
      // Keep the numbers for the next round instead of losing them.
      const back = s.counters.get(key) || { imp: 0, clk: 0, req: 0, empty: 0 }
      back.imp += row.imp; back.clk += row.clk; back.req += row.req; back.empty += row.empty
      s.counters.set(key, back)
      logEvent('warn', 'ads.flush_failed', { error: error instanceof Error ? error.message : String(error) })
    }
  }
  for (const [id, t] of campaignTotals) await db.adCampaign.update({ where: { id }, data: { impressions: { increment: t.imp }, clicks: { increment: t.clk } } }).catch(() => undefined)
  for (const [id, t] of creativeTotals) await db.adCreative.update({ where: { id }, data: { impressions: { increment: t.imp }, clicks: { increment: t.clk } } }).catch(() => undefined)
  s.today = null
  return settleCampaigns()
}

/** Campaigns whose period is over or whose totals are reached become ENDED (and their owner is told). */
export async function settleCampaigns(): Promise<number> {
  const now = new Date()
  const active = await db.adCampaign.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true, endsAt: true, maxImpressions: true, maxClicks: true, impressions: true, clicks: true, advertiser: { select: { userId: true } } } })
  let ended = 0
  for (const campaign of active) {
    if (!shouldEnd(campaign, now)) continue
    const updated = await db.adCampaign.updateMany({ where: { id: campaign.id, status: 'ACTIVE' }, data: { status: 'ENDED' } })
    if (!updated.count) continue
    ended++
    const userId = campaign.advertiser?.userId
    if (userId) {
      const { createInboxEvent } = await import('@/modules/notifications/server/inbox')
      await createInboxEvent({ userId, kind: 'ADS', dedupeKey: `ads:ended:${campaign.id}`, titleFa: `کمپین «${campaign.name}» به پایان رسید`, titleEn: 'Your campaign has ended', bodyFa: 'گزارش کامل نمایش و کلیک در بخش تبلیغات حساب شما موجود است.', bodyEn: 'The full report is in your advertising dashboard.', href: '/dashboard/ads' }).catch(() => undefined)
    }
  }
  if (ended) invalidateAdsCache()
  return ended
}

// ------------------------------------------------------------------ serving

export interface ServeInput { placement: string; path: string; language: string; userAgent: string; userId: number | null; vip: () => Promise<boolean> }
export interface ServedAd {
  id: number; kind: string; title: string; alt: string; image: string; imageMobile: string; text: string; cta: string; html: string
  click: string; view: string; label: string; width: number; height: number; sticky: boolean
}

const hourInSite = (now: Date) => Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: process.env.SITE_TIMEZONE || 'Asia/Tehran' }).format(now)) % 24

/** The promotion for one placement, or null (and the placement's own fallback). */
export async function serveAd(input: ServeInput): Promise<{ ad: ServedAd | null; fallback: string; reserve: { width: number; height: number } | null }> {
  const none = { ad: null, fallback: '', reserve: null }
  const config = await getAdsConfig()
  if (!config.enabled || isBot(input.userAgent)) return none
  const cache = await load()
  const placement = cache.placements.get(input.placement)
  if (!placement?.active) return none
  const device = deviceOf(input.userAgent)
  if (placement.device !== 'ALL' && placement.device !== device) return none
  const signedIn = !!input.userId
  const vip = signedIn && (config.hideFor === 'VIP' || cache.campaigns.some((c) => c.audience === 'NON_VIP')) ? await input.vip() : false
  if (config.hideFor === 'MEMBERS' && signedIn) return none
  if (config.hideFor === 'VIP' && vip) return none

  const now = new Date()
  const day = dayOf(now)
  const totals = await today()
  const pending = state().counters
  const ctx = { placement: input.placement, device, path: cleanPath(input.path), language: /^[a-z]{2}(-[A-Za-z]{2})?$/.test(input.language) ? input.language : 'fa', signedIn, vip, now, hour: hourInSite(now) }
  const candidates = cache.campaigns.filter((campaign) => {
    if (!campaign.creatives.length) return false
    const done = totals.get(campaign.id) || { imp: 0, clk: 0 }
    let waitingImp = 0, waitingClk = 0
    for (const [key, row] of pending) { const [d, c] = key.split('|'); if (d === day && Number(c) === campaign.id) { waitingImp += row.imp; waitingClk += row.clk } }
    const context: ServeContext = { ...ctx, todayImpressions: done.imp + waitingImp, todayClicks: done.clk + waitingClk }
    return ineligible({ ...campaign, impressions: campaign.impressions }, context) === ''
  })
  const campaign = pickCampaign(candidates, Math.random())
  const creative = campaign ? pickCreative(campaign.creatives, Math.random()) : null
  bump(day, 0, 0, input.placement, 'req')
  if (!campaign || !creative) {
    bump(day, 0, 0, input.placement, 'empty')
    return { ad: null, fallback: placement.fallbackHtml, reserve: placement.width && placement.height ? { width: placement.width, height: placement.height } : null }
  }
  const view = signToken({ c: creative.id, p: input.placement, n: randomBytes(9).toString('base64url'), e: Math.floor(Date.now() / 1000) + TOKEN_TTL_S })
  const click = creative.linkUrl ? `/api/promo/click?t=${encodeURIComponent(view)}` : ''
  return {
    ad: {
      id: creative.id, kind: creative.kind, title: creative.title, alt: creative.alt, image: creative.imageUrl, imageMobile: creative.imageMobileUrl, text: creative.text, cta: creative.cta,
      html: creative.kind === 'HTML' ? creative.html.split('{{click_url}}').join(click || '#') : '', click, view, label: config.label, width: placement.width, height: placement.height, sticky: placement.kind === 'STICKY',
    },
    fallback: '', reserve: placement.width && placement.height ? { width: placement.width, height: placement.height } : null,
  }
}

async function creativeOf(id: number): Promise<{ id: number; campaignId: number; linkUrl: string } | null> {
  const cached = state().cache?.creatives.get(id)
  if (cached) return { id, campaignId: cached.campaignId, linkUrl: cached.linkUrl }
  const row = await db.adCreative.findUnique({ where: { id }, select: { id: true, campaignId: true, linkUrl: true } })
  return row
}

/** An impression: the banner was on screen long enough (the page sends its token once). */
export async function recordImpression(token: string, userAgent: string): Promise<boolean> {
  const payload = verifyToken(token)
  if (!payload || isBot(userAgent)) return false
  const s = state()
  if (s.nonces.has(payload.n)) return false
  s.nonces.set(payload.n, payload.e)
  if (s.nonces.size > 20_000) { const now = Date.now() / 1000; for (const [key, expires] of s.nonces) if (expires < now) s.nonces.delete(key) }
  const creative = await creativeOf(payload.c)
  if (!creative) return false
  bump(dayOf(new Date()), creative.campaignId, creative.id, payload.p, 'imp')
  return true
}

/** A click: counted once per visitor and banner in the dedupe window; the visitor is always sent on. */
export async function recordClick(token: string, visitor: string, userAgent: string): Promise<string | null> {
  const payload = verifyToken(token)
  if (!payload) return null
  const creative = await creativeOf(payload.c)
  if (!creative?.linkUrl) return null
  if (!isBot(userAgent)) {
    const config = await getAdsConfig()
    const store = await kv()
    if (await store.lock(`promo:click:${visitor}:${creative.id}`, config.clickDedupeMinutes * 60_000).catch(() => true)) bump(dayOf(new Date()), creative.campaignId, creative.id, payload.p, 'clk')
  }
  return creative.linkUrl
}
