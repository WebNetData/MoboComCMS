// Run against the local Docker app: node --env-file=.env scripts/collections.browser.cjs
const assert = require('node:assert/strict')
const { PrismaClient } = require('@prisma/client')
const { encode } = require('next-auth/jwt')
const { chromium } = require('playwright')
const { existsSync } = require('node:fs')
const path = require('node:path')

process.env.DATABASE_URL = 'postgresql://mobocom:mobocom-local@127.0.0.1:5435/mobocom?schema=public'
const db = new PrismaClient()
const seed = `codex-collection-browser-${Date.now()}`
let userId = 0
let artistId = 0
let collectionId = 0
let browser

async function main() {
  const user = await db.user.create({ data: { email: `${seed}@example.invalid`, passwordHash: 'test-only' } })
  userId = user.id
  const artist = await db.musicArtist.create({ data: { slug: seed, name: 'Collection browser artist' } })
  artistId = artist.id
  const track = await db.musicTrack.create({ data: { slug: `${seed}-track`, title: 'Collection browser track', artistId, audioUrl: '/test.mp3', status: 'PUBLISHED', publishedAt: new Date(Date.now() - 1000) } })
  const collection = await db.userCollection.create({ data: { ownerId: userId, title: 'Browser collection', visibility: 'PUBLIC' } })
  collectionId = collection.id
  const token = await encode({ token: { uid: String(userId), sub: String(userId), email: user.email, authAt: Date.now() }, secret: process.env.NEXTAUTH_SECRET })
  const fallbackChrome = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright', 'chromium-1234', 'chrome-win64', 'chrome.exe')
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || (existsSync(fallbackChrome) ? fallbackChrome : undefined) })
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 } })
  await context.addCookies([{ name: 'next-auth.session-token', value: token, url: 'http://127.0.0.1:3000' }, { name: 'theme', value: 'dark', url: 'http://127.0.0.1:3000' }])
  const page = await context.newPage()
  await page.goto(`http://127.0.0.1:3000/music/track/${track.slug}`)
  await page.getByRole('button', { name: 'افزودن به مجموعه' }).click()
  await page.getByRole('button', { name: /Browser collection/ }).click()
  await page.getByText('به مجموعه اضافه شد.').waitFor()
  assert.equal(await db.userCollectionItem.count({ where: { collectionId, itemType: 'track', itemId: track.id } }), 1)
  const detail = await page.goto(`http://127.0.0.1:3000/collections/${collectionId}`)
  assert.equal(detail?.status(), 200, `collection detail returned ${detail?.status()}`)
  assert.ok((await page.locator('body').innerText()).includes('Collection browser track'), 'collection detail did not render the track')
  const color = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(color)
  assert.ok(match && Math.max(...match.slice(1).map(Number)) < 80, `expected dark background, got ${color}`)
  await page.screenshot({ path: '.next-dev/collections-qa.png', fullPage: true })
  console.log('Collections browser: add from item page, public detail, and dark background OK')
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(async () => {
  await browser?.close()
  if (collectionId) await db.userCollection.deleteMany({ where: { id: collectionId } })
  if (artistId) {
    const tracks = await db.musicTrack.findMany({ where: { artistId }, select: { id: true } })
    await db.searchDocument.deleteMany({ where: { itemType: 'track', itemId: { in: tracks.map((track) => track.id) } } })
    await db.musicArtist.delete({ where: { id: artistId } })
  }
  if (userId) await db.user.delete({ where: { id: userId } })
  await db.$disconnect()
})
