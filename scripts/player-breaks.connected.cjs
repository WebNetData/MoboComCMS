// Ads in the film player on real PostgreSQL, through the ads module's own placement, campaign, creative, status,
// serving, counting and settings functions, and the cinema intro setting. Placements and campaigns are this script's
// own; the ads and cinema settings are put back as they were.
process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || 'player-breaks-check'
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript-api'), { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient(), seed = `pbreaks${Date.now()}`, cache = new Map()
function load(file) {
  const full = path.resolve(file.endsWith('.ts') ? file : fs.existsSync(`${file}.ts`) ? `${file}.ts` : path.join(file, 'index.ts'))
  if (cache.has(full)) return cache.get(full).exports
  const mod = { exports: {} }; cache.set(full, mod)
  const source = ts.transpileModule(fs.readFileSync(full, 'utf8'), { fileName: full, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText
  new Function('require', 'module', 'exports', source)(name => {
    if (name === '@/platform/database/prisma') return { db: prisma }
    if (name === '@/platform/observability/logger') return { logEvent: () => {} }
    if (name === '@/modules/notifications/server/inbox') return { createInboxEvent: async () => {} }
    if (name === 'react') return { ...require('react'), cache: fn => fn }
    if (name.startsWith('@/')) return load(`src/${name.slice(2)}`)
    if (name.startsWith('.')) return load(path.join(path.dirname(full), name))
    return require(name)
  }, mod, mod.exports)
  return mod.exports
}
const serving = load('src/modules/ads/server/serving.ts'), manage = load('src/modules/ads/server/manage.ts'), cinema = load('src/modules/cinema/server/admin.ts'), settings = load('src/modules/settings/server.ts')
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36'
const viewer = { path: `/cinema/${seed}`, language: 'fa', userAgent: UA, userId: null, vip: async () => false }
const serve = (placement, extra = {}) => serving.serveAd({ ...viewer, placement, ...extra })
const kinds = async (placement, extra) => { const seen = new Set(); for (let i = 0; i < 30; i++) { const got = (await serve(placement, extra)).ad; seen.add(got ? got.kind : null) } return [...seen].sort() }

async function main() {
  const adsBefore = await prisma.setting.findUnique({ where: { key: 'ads.config.v1' } }), cinemaBefore = await cinema.getCinemaSettings(true)
  try {
    // ---- the player's placements exist like the others, of their own kinds
    await serving.ensureBuiltinPlacements()
    const builtin = await prisma.adPlacement.findMany({ where: { key: { in: ['player-preroll', 'player-midroll', 'player-overlay'] } }, orderBy: { key: 'asc' } })
    assert.deepEqual(builtin.map(p => [p.key, p.kind, p.builtin]), [['player-midroll', 'PLAYER', true], ['player-overlay', 'OVERLAY', true], ['player-preroll', 'PLAYER', true]])
    // This script's own slots, so nobody else's campaigns compete for them.
    const pre = `${seed}-pre`, over = `${seed}-over`, page = `${seed}-page`
    await manage.savePlacement({ key: pre, name: 'pre', kind: 'PLAYER' }); await manage.savePlacement({ key: over, name: 'over', kind: 'OVERLAY' }); await manage.savePlacement({ key: page, name: 'page', kind: 'BANNER', width: 728, height: 90 })

    // ---- one campaign on a player break and a page slot: each gets only what it can show
    const both = await manage.saveCampaign({ name: `${seed} both`, placements: [pre, page], priority: 10 })
    const video = await manage.saveCreative(both.id, { kind: 'VIDEO', videoUrl: '/files/ads/spot.mp4', skipAfter: 5, title: 'spot', linkUrl: 'https://advertiser.example/landing', cta: 'خرید' }, { admin: true })
    await manage.saveCreative(both.id, { kind: 'TEXT', title: 'line', linkUrl: 'https://advertiser.example/landing' }, { admin: true })
    await manage.setCampaignStatus(both.id, 'ACTIVE')
    serving.invalidateAdsCache()
    assert.deepEqual(await kinds(pre), ['VIDEO'], 'a player break never gets the text line')
    assert.deepEqual(await kinds(page), ['TEXT'], 'a page slot never gets the video')
    const served = (await serve(pre)).ad
    assert.deepEqual([served.slot, served.video, served.skipAfter, served.cta, served.click.startsWith('/api/promo/click?t='), !!served.view], ['PLAYER', '/files/ads/spot.mp4', 5, 'خرید', true, true])
    assert.equal((await serve(page)).ad.slot, 'BANNER')

    // Over the film: a picture or a line, never the video.
    const overlay = await manage.saveCampaign({ name: `${seed} overlay`, placements: [over], priority: 10 })
    await manage.saveCreative(overlay.id, { kind: 'VIDEO', videoUrl: 'https://cdn.example.com/x.webm' }, { admin: true })
    await manage.saveCreative(overlay.id, { kind: 'IMAGE', imageUrl: '/files/ads/strip.png', linkUrl: 'https://advertiser.example/', seconds: 6 }, { admin: true })
    await manage.setCampaignStatus(overlay.id, 'ACTIVE')
    serving.invalidateAdsCache()
    assert.deepEqual(await kinds(over), ['IMAGE'])
    assert.equal((await serve(over)).ad.slot, 'OVERLAY')

    // A campaign whose creatives fit none of its slots cannot be started (it would never show).
    const misfit = await manage.saveCampaign({ name: `${seed} misfit`, placements: [pre] })
    await manage.saveCreative(misfit.id, { kind: 'HTML', html: '<b>x</b>' }, { admin: true })
    await assert.rejects(manage.setCampaignStatus(misfit.id, 'ACTIVE'), /هیچ‌کدام/)
    await manage.saveCreative(misfit.id, { kind: 'IMAGE', imageUrl: '/files/ads/full.png', linkUrl: 'https://advertiser.example/' }, { admin: true })
    await manage.setCampaignStatus(misfit.id, 'ACTIVE')

    // ---- who is spared: VIP members of a NON_VIP campaign, the settings' exemptions, ads switched off, bots
    await manage.saveCampaign({ name: `${seed} both`, placements: [pre, page], priority: 10, audience: 'NON_VIP' }, both.id)
    serving.invalidateAdsCache()
    const member = { userId: 1, vip: async () => true }
    assert.ok(!(await kinds(pre, member)).includes('VIDEO'), 'a VIP never gets a NON_VIP campaign')
    assert.ok((await kinds(pre, { userId: 1, vip: async () => false })).includes('VIDEO'))
    await serving.saveAdsConfig({ hideFor: 'VIP' })
    assert.equal((await serve(pre, member)).ad, null, 'VIP spared by the settings')
    await serving.saveAdsConfig({ hideFor: 'NONE', enabled: false })
    assert.equal((await serve(pre)).ad, null, 'ads switched off')
    await serving.saveAdsConfig({ enabled: true })
    assert.equal((await serve(pre, { userAgent: 'Googlebot/2.1' })).ad, null, 'bots')

    // ---- an impression is counted for the player slot it was shown in
    const shown = (await serve(pre)).ad
    assert.ok(await serving.recordImpression(shown.view, UA))
    assert.equal(await serving.recordImpression(shown.view, UA), false, 'once per showing')
    await serving.flushAdStats()
    const stat = await prisma.adStatDaily.findFirst({ where: { creativeId: shown.id, placementKey: pre } })
    assert.equal(stat?.impressions, 1)

    // ---- pacing: a site that never saved it reads the defaults; a change keeps the rest
    // As every site stored it before pacing existed (through the settings owner, which keeps its cache in step).
    await settings.writeJsonSetting('ads.config.v1', { enabled: true })
    serving.invalidateAdsCache()
    assert.deepEqual((await serving.getAdsConfig()).player, { gapMinutes: 10, midrollMinutes: 20, midrollMinLength: 30, overlayAfter: 15 }, 'not all zeros')
    assert.deepEqual((await serving.saveAdsConfig({ player: { midrollMinutes: 0, gapMinutes: 3 } })).player, { gapMinutes: 3, midrollMinutes: 0, midrollMinLength: 30, overlayAfter: 15 })
    assert.equal((await serving.saveAdsConfig({ label: 'آگهی' })).player.gapMinutes, 3, 'other settings leave pacing alone')

    // ---- the database refuses what the forms refuse
    await assert.rejects(prisma.adCreative.create({ data: { campaignId: both.id, kind: 'VIDEO', videoUrl: '' } }), /AdCreative_video_check|check constraint/i, 'a video creative without a video')
    await assert.rejects(prisma.adCreative.create({ data: { campaignId: both.id, kind: 'IMAGE', videoUrl: '/files/x.mp4' } }), /check constraint/i, 'a video on a picture')
    await assert.rejects(prisma.adCreative.update({ where: { id: video.id }, data: { skipAfter: 99 } }), /check constraint/i)
    await assert.rejects(manage.saveCreative(both.id, { kind: 'VIDEO', videoUrl: 'https://x.example/a.mkv' }, { admin: true }), /MP4 یا WebM/)

    // ---- the intro is a cinema setting: an MP4/WebM address or none
    await cinema.saveCinemaSettings({ introUrl: 'https://cdn.example.com/intro.mkv' })
    assert.equal((await cinema.getCinemaSettings(true)).introUrl, '', 'not a playable file: no intro')
    const saved = await cinema.saveCinemaSettings({ introUrl: '/files/cinema/intro.mp4', introSkipAfter: 99, introFrequency: 'ALWAYS' })
    assert.deepEqual([saved.introUrl, saved.introSkipAfter, saved.introFrequency], ['/files/cinema/intro.mp4', 30, 'ALWAYS'])
    console.log('PostgreSQL player breaks: player placements, what fits each slot, unstartable misfit campaigns, VIP/settings/off/bot exemptions, impressions per slot, pacing defaults and partial saves, database checks and the intro setting passed')
  } finally {
    if (adsBefore) await settings.setSetting('ads.config.v1', adsBefore.value); else { await prisma.setting.deleteMany({ where: { key: 'ads.config.v1' } }); await settings.setSetting('ads.config.v1', '{}').then(() => prisma.setting.deleteMany({ where: { key: 'ads.config.v1' } })) }
    await cinema.saveCinemaSettings({ introUrl: cinemaBefore.introUrl, introSkipAfter: cinemaBefore.introSkipAfter, introFrequency: cinemaBefore.introFrequency }).catch(() => undefined)
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  try {
    const campaigns = (await prisma.adCampaign.findMany({ where: { name: { startsWith: seed } }, select: { id: true } })).map(row => row.id)
    await prisma.adStatDaily.deleteMany({ where: { OR: [{ campaignId: { in: campaigns } }, { placementKey: { startsWith: seed } }] } })
    await prisma.adCampaign.deleteMany({ where: { id: { in: campaigns } } })
    await prisma.adPlacement.deleteMany({ where: { key: { startsWith: seed } } })
  } finally { await prisma.$disconnect() }
})
