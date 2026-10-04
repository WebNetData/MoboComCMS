// Docker-local PostgreSQL/API/browser verification; restores settings and namespaced fixtures.
const assert = require('node:assert/strict')
const { PrismaClient } = require('@prisma/client')
const { encode } = require('next-auth/jwt')
const { chromium } = require('playwright')
const path = require('node:path')
const db = new PrismaClient(), base = 'http://localhost:3000', seed = `md${Date.now().toString(36)}`
const ids = { tracks: [], artists: [], albums: [], users: [] }, originals = new Map()
let browser
async function main() {
  for (const key of ['music.portal.v1', 'personalRecommendationsEnabled']) originals.set(key, await db.setting.findUnique({ where: { key } }))
  const user = await db.user.create({ data: { email: `${seed}@example.invalid`, passwordHash: 'test-only', role: 'ADMIN' } }); ids.users.push(user.id)
  const token = await encode({ token: { uid: String(user.id), sub: String(user.id), email: user.email, role: user.role, authAt: Date.now() }, secret: process.env.NEXTAUTH_SECRET })
  const request = (method, route, body) => fetch(base + route, { method, headers: { cookie: `next-auth.session-token=${token}`, origin: base, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60000) })
  const artists = []
  for (const name of ['source', 'other']) { const row = await db.musicArtist.create({ data: { name, slug: `${seed}-${name}` } }); artists.push(row); ids.artists.push(row.id) }
  const album = await db.musicAlbum.create({ data: { slug: `${seed}-album`, title: 'Fixture album', artistId: artists[0].id, status: 'PUBLISHED', publishedAt: new Date(Date.now() - 86400000) } }); ids.albums.push(album.id)
  async function track(name, data = {}) { const row = await db.musicTrack.create({ data: { slug: `${seed}-${name}`, title: `${seed} ${name}`, artistId: artists[1].id, genre: seed, status: 'PUBLISHED', publishedAt: new Date(Date.now() - 86400000), ...data } }); ids.tracks.push(row.id); return row }
  const source = await track('source', { artistId: artists[0].id, albumId: album.id, genre: `${seed}, Unique` })
  const strong = await track('strong', { genre: `${seed.toUpperCase()}, Unique` })
  const related = await track('related')
  const excluded = await Promise.all([track('same-artist', { artistId: artists[0].id }), track('sibling', { albumId: album.id }), track('substring', { genre: `x${seed}` }), track('draft', { status: 'DRAFT' }), track('future', { publishedAt: new Date(Date.now() + 86400000) })])
  let response = await request('GET', '/api/admin/music/settings'); assert.equal(response.status, 200)
  const settings = (await response.json()).settings
  const save = async (body) => { const r = await request('POST', '/api/admin/music/settings', body); assert.equal(r.status, 200, await r.clone().text()); return (await r.json()).settings }
  assert.equal((await save({ ...settings, showRelatedTracks: false })).showRelatedTracks, false)
  const legacy = { ...settings }; delete legacy.showRelatedTracks
  assert.equal((await save(legacy)).showRelatedTracks, false, 'old client preserves the flag')
  assert.equal((await fetch(base + '/api/admin/music/settings', { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: '{}' })).status, 403)
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 390, height: 900 } })
  await context.addCookies([{ name: 'next-auth.session-token', value: token, url: base }])
  const page = await context.newPage(), rail = () => page.locator('section[aria-labelledby="music-related-tracks"]')
  await page.goto(`${base}/music/track/${source.slug}`, { waitUntil: 'networkidle' }); assert.equal(await rail().count(), 0)
  await save({ ...settings, showRelatedTracks: true })
  await page.reload({ waitUntil: 'networkidle' }); await rail().waitFor()
  const hrefs = await rail().locator('a[href^="/music/track/"]').evaluateAll(nodes => nodes.map(node => node.getAttribute('href')))
  assert.deepEqual(hrefs, [strong, related].map(row => `/music/track/${row.slug}`))
  assert.ok((await rail().innerText()).includes(seed.toUpperCase()))
  for (const row of excluded) assert.ok(!(await rail().innerText()).includes(row.title))
  for (const theme of ['dark', 'light']) for (const width of [360, 390, 1440]) {
    await context.addCookies([{ name: 'theme', value: theme, url: base }]); await page.setViewportSize({ width, height: 900 })
    await page.reload({ waitUntil: 'networkidle' }); await rail().waitFor()
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${theme} ${width} overflow`)
    if (width === 390 || width === 1440) await page.screenshot({ path: path.join(__dirname, '..', '.mobocom', `music-discovery-${theme}-${width}.png`), fullPage: true })
  }
  await db.itemFavorite.create({ data: { userId: user.id, itemType: 'track', itemId: source.id } })
  assert.equal((await request('PATCH', '/api/admin/settings', { personalRecommendationsEnabled: 'true' })).status, 200)
  await page.goto(base + '/dashboard/library', { waitUntil: 'networkidle' })
  const shelf = () => page.locator('section[aria-labelledby="lb-suggestions-title"]')
  assert.ok(!(await shelf().innerText()).includes(strong.title), 'no consent: no private suggestions')
  assert.equal((await request('PATCH', '/api/profile', { recommendationOptIn: true })).status, 200)
  await page.reload({ waitUntil: 'networkidle' }); assert.ok((await shelf().innerText()).includes(strong.title))
  await save({ ...settings, showRelatedTracks: false })
  await page.reload({ waitUntil: 'networkidle' }); assert.ok((await shelf().innerText()).includes(strong.title), 'public toggle leaves private consent flow intact')
  assert.equal((await request('PATCH', '/api/admin/settings', { personalRecommendationsEnabled: 'false' })).status, 200)
  await page.reload({ waitUntil: 'networkidle' }); assert.ok(!(await shelf().innerText()).includes(strong.title))
  console.log('Music discovery PostgreSQL/API/consent and RTL dark/light 360/390/1440 browser checks passed; playback not exercised.')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  await browser?.close()
  for (const [key, row] of originals) { if (row) await db.setting.upsert({ where: { key }, create: { key, value: row.value }, update: { value: row.value } }); else await db.setting.deleteMany({ where: { key } }) }
  await db.user.deleteMany({ where: { id: { in: ids.users } } })
  await db.musicTrack.deleteMany({ where: { id: { in: ids.tracks } } })
  await db.musicAlbum.deleteMany({ where: { id: { in: ids.albums } } })
  await db.musicArtist.deleteMany({ where: { id: { in: ids.artists } } })
  await db.$disconnect()
})
