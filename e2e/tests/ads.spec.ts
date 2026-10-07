import { test, expect } from '../helpers'

/**
 * Advertising: a campaign is served, an impression and a click are counted once, bots and repeats are not,
 * and the results reach the administrator's report. The test makes its own placement and campaign; the placement is removed and the campaign ended (campaigns with results are kept for the reports).
 */
test.describe.configure({ mode: 'serial' })

const BROWSER = { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36' }
const KEY = `e2e-slot-${Date.now().toString(36)}`

test.describe('advertising', () => {
  let placementId = 0
  let campaignId = 0

  test.afterAll(async ({ playwright, baseURL }) => {
    const { hasAdmin } = await import('../helpers')
    if (!hasAdmin()) return
    const { ADMIN_STATE } = await import('../paths')
    const admin = await playwright.request.newContext({ baseURL, storageState: ADMIN_STATE, extraHTTPHeaders: { origin: baseURL! } })
    // A campaign with impressions is kept for the reports (it cannot be deleted); ending it frees the placement.
    if (campaignId) {
      await admin.post('/api/admin/ads', { data: { op: 'campaign.status', id: campaignId, status: 'ENDED' } })
      await admin.post('/api/admin/ads', { data: { op: 'campaign.delete', id: campaignId } })
    }
    if (placementId) await admin.post('/api/admin/ads', { data: { op: 'placement.delete', id: placementId } })
    await admin.dispose()
  })

  test('an approved campaign is served, counted once, and reported', async ({ admin, playwright, baseURL }) => {
    const placement = await admin.post('/api/admin/ads', { data: { op: 'placement.save', key: KEY, name: 'E2E', width: 300, height: 250 } })
    expect(placement.ok()).toBeTruthy()
    placementId = (await placement.json()).id

    const campaign = await admin.post('/api/admin/ads', { data: { op: 'campaign.save', name: 'E2E campaign', placements: [KEY], priority: 5 } })
    expect(campaign.ok()).toBeTruthy()
    campaignId = (await campaign.json()).id
    const creative = await admin.post('/api/admin/ads', { data: { op: 'creative.save', campaignId, kind: 'TEXT', title: 'E2E sponsor', linkUrl: 'https://example.com/landing?x=1' } })
    expect(creative.ok()).toBeTruthy()

    const guest = await playwright.request.newContext({ baseURL, extraHTTPHeaders: BROWSER })
    const before = await (await guest.get(`/api/promo/serve?p=${KEY}&path=/`)).json()
    expect(before.ad, 'a campaign that is not active is not shown').toBeNull()

    expect((await admin.post('/api/admin/ads', { data: { op: 'campaign.status', id: campaignId, status: 'ACTIVE' } })).ok()).toBeTruthy()
    const served = await (await guest.get(`/api/promo/serve?p=${KEY}&path=/`)).json()
    expect(served.ad?.title).toBe('E2E sponsor')
    expect(served.ad.click).toContain('/api/promo/click?t=')
    expect(JSON.stringify(served), 'the destination is behind the click address').not.toContain('example.com')

    // Impression: counted once per token, never for bots or forged tokens.
    expect((await guest.post('/api/promo/view', { data: { t: served.ad.view } })).status()).toBe(204)
    await guest.post('/api/promo/view', { data: { t: served.ad.view } })
    await guest.post('/api/promo/view', { data: { t: `${served.ad.view}x` } })
    const bot = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { 'user-agent': 'Googlebot/2.1' } })
    const botServed = await (await bot.get(`/api/promo/serve?p=${KEY}&path=/`)).json()
    if (botServed.ad) await bot.post('/api/promo/view', { data: { t: botServed.ad.view } })

    // Click: redirects to the advertiser; a repeat click by the same visitor is not counted again.
    const click = await guest.get(served.ad.click, { maxRedirects: 0 })
    expect(click.status()).toBe(302)
    expect(click.headers().location).toBe('https://example.com/landing?x=1')
    await guest.get(served.ad.click, { maxRedirects: 0 })
    expect((await guest.get('/api/promo/click?t=garbage', { maxRedirects: 0 })).headers().location).toBe('/')

    await admin.post('/api/admin/ads', { data: { op: 'flush' } })
    const report = await (await admin.get(`/api/admin/ads?view=campaign&id=${campaignId}`)).json()
    expect(report.campaign.impressions).toBe(1)
    expect(report.campaign.clicks).toBe(1)
    await guest.dispose(); await bot.dispose()
  })

  test('targeting keeps a campaign off pages and devices it is not meant for', async ({ admin, playwright, baseURL }) => {
    expect((await admin.post('/api/admin/ads', { data: { op: 'campaign.save', id: campaignId, name: 'E2E campaign', placements: [KEY], includePaths: ['/blog'], devices: 'MOBILE' } })).ok()).toBeTruthy()
    const desktop = await playwright.request.newContext({ baseURL, extraHTTPHeaders: BROWSER })
    expect((await (await desktop.get(`/api/promo/serve?p=${KEY}&path=/blog/x`)).json()).ad, 'desktop visitor, mobile-only campaign').toBeNull()
    const mobile = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148 Safari/604.1' } })
    expect((await (await mobile.get(`/api/promo/serve?p=${KEY}&path=/blog/x`)).json()).ad?.title).toBe('E2E sponsor')
    expect((await (await mobile.get(`/api/promo/serve?p=${KEY}&path=/shop`)).json()).ad, 'outside the targeted path').toBeNull()
    await desktop.dispose(); await mobile.dispose()
  })

  test('advertiser areas need a login and the admin API needs an administrator', async ({ playwright, baseURL }) => {
    const guest = await playwright.request.newContext({ baseURL })
    for (const url of ['/api/promo/mine']) expect((await guest.get(url)).status()).toBe(401)
    expect((await guest.post('/api/promo/buy', { data: { packageId: 1, requestId: 'abcdefgh12' } })).status()).toBe(401)
    expect([401, 403]).toContain((await guest.get('/api/admin/ads?view=overview')).status())
    expect([401, 403]).toContain((await guest.post('/api/admin/ads', { data: { op: 'flush' } })).status())
    expect((await guest.get('/advertise')).status()).toBe(200)
    await guest.dispose()
  })
})
