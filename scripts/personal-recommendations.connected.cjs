// Local PostgreSQL + port 3000: node --env-file=.env scripts/personal-recommendations.connected.cjs
const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs')
const ts = require('typescript')
const { PrismaClient } = require('@prisma/client')
const { encode } = require('next-auth/jwt')
const { chromium } = require('playwright')

process.env.DATABASE_URL = process.env.MOBOCOM_CONNECTED_DATABASE_URL || 'postgresql://mobocom:mobocom-local@127.0.0.1:5435/mobocom?schema=public'
const db = new PrismaClient()
const seed = `codex-personal-${Date.now()}`
const ids = { users: [], games: [], software: [], studios: [], artists: [], albums: [], tracks: [] }
let browser
let restoreGlobal = async () => {}

function noConsentReadCheck() {
  const source = fs.readFileSync(path.join(__dirname, '../src/modules/recommendations/server/personal.ts'), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const mod = { exports: {} }
  const forbidden = { findMany: () => { throw new Error('Private activity read without consent') } }
  const mockDb = { setting: { findUnique: async () => null }, user: { findUnique: async () => ({ recommendationOptIn: false }) }, itemFavorite: forbidden, userRecentView: forbidden }
  new Function('require', 'module', 'exports', output)((name) => name === '@/platform/database/prisma' ? { db: mockDb } : name === '@/modules/content/server/registry' ? {} : name === '@/modules/content/domain/items' ? {} : name === '@/modules/recommendations/server/contextual' ? {} : require(name), mod, mod.exports)
  return mod.exports.personalRecommendations(1).then((result) => assert.deepEqual(result, { available: true, enabled: false, items: [] }))
}

function globalOffCheck() {
  const source = fs.readFileSync(path.join(__dirname, '../src/modules/recommendations/server/personal.ts'), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const mod = { exports: {} }
  const forbidden = () => { throw new Error('Private data read while administrator disabled recommendations') }
  const mockDb = { setting: { findUnique: async () => ({ value: 'false' }) }, user: { findUnique: forbidden }, itemFavorite: { findMany: forbidden }, userRecentView: { findMany: forbidden } }
  new Function('require', 'module', 'exports', output)((name) => name === '@/platform/database/prisma' ? { db: mockDb } : name === '@/modules/content/server/registry' ? {} : name === '@/modules/content/domain/items' ? {} : name === '@/modules/recommendations/server/contextual' ? {} : require(name), mod, mod.exports)
  return mod.exports.personalRecommendations(1).then((result) => assert.deepEqual(result, { available: false, enabled: false, items: [] }))
}

async function main() {
  await noConsentReadCheck()
  await globalOffCheck()
  // A staff fixture bypasses the unrelated customer address/onboarding gate.
  const user = await db.user.create({ data: { email: `${seed}@example.invalid`, passwordHash: 'test-only', name: 'Personal recommendations test', role: 'ADMIN' } })
  const other = await db.user.create({ data: { email: `${seed}-other@example.invalid`, passwordHash: 'test-only' } })
  ids.users.push(user.id, other.id)
  const publishedAt = new Date(Date.now() - 86_400_000)
  const createGame = async (name, status = 'PUBLISHED') => {
    const row = await db.gameTitle.create({ data: { slug: `${seed}-${name}`, title: name, genres: 'Strategy', platforms: 'PC', status, publishedAt } })
    ids.games.push(row.id)
    return row
  }
  const source = await createGame('source')
  const related = await createGame('related')
  const hidden = await createGame('hidden', 'DRAFT')
  await db.itemFavorite.create({ data: { userId: user.id, itemType: 'game', itemId: source.id } })
  await db.userRecentView.create({ data: { userId: user.id, itemType: 'game', itemId: source.id } })
  const token = await encode({ token: { uid: String(user.id), sub: String(user.id), email: user.email, name: user.name, role: user.role, authAt: Date.now() }, secret: process.env.NEXTAUTH_SECRET, maxAge: 3600 })
  const cookie = `next-auth.session-token=${token}`
  const request = async (method, url, body) => fetch(`http://127.0.0.1:3000${url}`, { method, headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60_000) })
  const originalGlobal = await db.setting.findUnique({ where: { key: 'personalRecommendationsEnabled' } })
  restoreGlobal = async () => {
    await request('PATCH', '/api/admin/settings', { personalRecommendationsEnabled: originalGlobal?.value || 'true' })
    if (!originalGlobal) await db.setting.deleteMany({ where: { key: 'personalRecommendationsEnabled' } })
  }
  assert.equal((await request('PATCH', '/api/admin/settings', { personalRecommendationsEnabled: 'true' })).status, 200)
  assert.equal((await request('PATCH', '/api/admin/settings', { personalRecommendationsEnabled: 'invalid' })).status, 400)
  let profile = await (await request('GET', '/api/profile')).json()
  assert.equal(profile.recommendationOptIn, false, 'opt-in defaults off')
  let response = await request('PATCH', '/api/profile', { recommendationOptIn: 'true' })
  assert.equal(response.status, 400, 'non-boolean consent rejected')
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: user.id } })).recommendationOptIn, false)

  browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
  fs.mkdirSync(path.join(__dirname, '..', 'var'), { recursive: true })
  const context = await browser.newContext({ viewport: { width: 390, height: 900 } })
  await context.addCookies([{ name: 'next-auth.session-token', value: token, url: 'http://127.0.0.1:3000' }, { name: 'theme', value: 'dark', url: 'http://127.0.0.1:3000' }])
  const page = await context.newPage()
  await page.goto('http://127.0.0.1:3000/dashboard/library', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.locator('section[aria-labelledby="lb-suggestions-title"]').waitFor({ timeout: 60000 }).catch(async () => { throw new Error(`Library shelf missing at ${page.url()}: ${(await page.locator('body').innerText()).slice(0, 500)}`) })
  let shelf = page.locator('section[aria-labelledby="lb-suggestions-title"]')
  assert.ok((await shelf.innerText()).includes('خاموش'), 'private library reports opt-out')
  assert.ok(!(await shelf.innerText()).includes(related.title), 'opt-out does not show recommendations')

  response = await request('PATCH', '/api/profile', { recommendationOptIn: true })
  assert.equal(response.status, 200, response.status === 200 ? '' : await response.text())
  profile = await response.json()
  assert.equal(profile.recommendationOptIn, true)
  await page.reload({ waitUntil: 'domcontentloaded' })
  shelf = page.locator('section[aria-labelledby="lb-suggestions-title"]')
  assert.ok((await shelf.innerText()).includes(related.title), 'opted-in user sees related game')
  assert.ok(!(await shelf.innerText()).includes(hidden.title), 'draft game is absent')
  assert.ok((await shelf.innerText()).includes(source.title), 'explanation names the source')
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: other.id } })).recommendationOptIn, false, 'another account remains opted out')
  const pause = await request('PATCH', '/api/admin/settings', { personalRecommendationsEnabled: 'false' })
  assert.equal(pause.status, 200)
  const pausedSettings = await pause.json()
  assert.equal(pausedSettings.personalRecommendationsEnabled, 'false', 'admin API returns paused setting')
  assert.equal((await db.setting.findUnique({ where: { key: 'personalRecommendationsEnabled' } }))?.value, 'false', 'admin pause persists')
  await page.reload({ waitUntil: 'domcontentloaded' })
  shelf = page.locator('section[aria-labelledby="lb-suggestions-title"]')
  const pausedText = await shelf.innerText()
  assert.ok(pausedText.includes('مدیر سایت'), `admin pause is explained in the library: ${pausedText}`)
  assert.ok(!(await shelf.innerText()).includes(related.title), 'admin pause hides private suggestions')
  assert.equal((await request('PATCH', '/api/admin/settings', { personalRecommendationsEnabled: 'true' })).status, 200)
  await page.reload({ waitUntil: 'domcontentloaded' })
  assert.ok((await page.locator('section[aria-labelledby="lb-suggestions-title"]').innerText()).includes(related.title), 'admin resume restores opted-in suggestions')

  await context.close()
  for (const theme of ['dark', 'light']) for (const width of [390, 1440]) {
    const view = await browser.newContext({ viewport: { width, height: 900 } })
    await view.addCookies([{ name: 'next-auth.session-token', value: token, url: 'http://127.0.0.1:3000' }, { name: 'theme', value: theme, url: 'http://127.0.0.1:3000' }])
    const screen = await view.newPage()
    for (const route of ['profile', 'library']) {
      await screen.goto(`http://127.0.0.1:3000/dashboard/${route}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
      if (route === 'profile') {
        const control = screen.locator('section[aria-labelledby="recommendation-preference-title"] input[role="switch"]')
        await control.waitFor()
        assert.equal(await control.isChecked(), true)
      } else {
        const shelf = screen.locator('section[aria-labelledby="lb-suggestions-title"]')
        await shelf.waitFor({ timeout: 60000 })
        assert.ok((await shelf.innerText()).includes(related.title))
      }
      const overflow = await screen.evaluate(() => document.documentElement.scrollWidth - innerWidth)
      assert.ok(overflow <= 1, `${route} ${theme} ${width} overflow ${overflow}`)
      await screen.screenshot({ path: path.join(__dirname, '..', 'var', `personal-${route}-${theme}-${width}.png`), fullPage: true })
    }
    await view.close()
  }
  const artist = await db.musicArtist.create({ data: { slug: `${seed}-artist`, name: `${seed} artist` } })
  ids.artists.push(artist.id)
  const album = await db.musicAlbum.create({ data: { slug: `${seed}-album`, title: `${seed} album`, artistId: artist.id, publishedAt } })
  const draftAlbum = await db.musicAlbum.create({ data: { slug: `${seed}-draft-album`, title: `${seed} draft album`, artistId: artist.id, status: 'DRAFT', publishedAt } })
  ids.albums.push(album.id, draftAlbum.id)
  const track = await db.musicTrack.create({ data: { slug: `${seed}-track`, title: `${seed} track`, artistId: artist.id, publishedAt } })
  const futureTrack = await db.musicTrack.create({ data: { slug: `${seed}-future-track`, title: `${seed} future track`, artistId: artist.id, publishedAt: new Date(Date.now() + 86_400_000) } })
  ids.tracks.push(track.id, futureTrack.id)
  const studio = await db.studio.create({ data: { normalizedName: `${seed}-studio`, name: `${seed} studio` } })
  ids.studios.push(studio.id)
  await db.gameTitle.update({ where: { id: related.id }, data: { developerStudioId: studio.id } })
  await db.gameTitle.update({ where: { id: hidden.id }, data: { publisherStudioId: studio.id } })
  const software = await db.softwareTitle.create({ data: { slug: `${seed}-software`, title: `${seed} software`, developerStudioId: studio.id, publishedAt } })
  ids.software.push(software.id)
  await db.itemFavorite.deleteMany({ where: { userId: user.id, itemType: 'game', itemId: source.id } })
  await db.userRecentView.deleteMany({ where: { userId: user.id, itemType: 'game', itemId: source.id } })
  await db.itemFavorite.createMany({ data: [{ userId: user.id, itemType: 'artist', itemId: artist.id }, { userId: user.id, itemType: 'studio', itemId: studio.id }] })
  const followView = await browser.newContext({ viewport: { width: 390, height: 900 } })
  await followView.addCookies([{ name: 'next-auth.session-token', value: token, url: 'http://127.0.0.1:3000' }])
  const followPage = await followView.newPage()
  await followPage.goto('http://127.0.0.1:3000/dashboard/library', { waitUntil: 'domcontentloaded', timeout: 60000 })
  const followShelf = followPage.locator('section[aria-labelledby="lb-suggestions-title"]')
  await followShelf.waitFor()
  const followedText = await followShelf.innerText()
  for (const title of [album.title, track.title, related.title, software.title, artist.name, studio.name]) assert.ok(followedText.includes(title), `followed creator suggestion includes ${title}: ${followedText}`)
  for (const title of [draftAlbum.title, futureTrack.title, hidden.title]) assert.ok(!followedText.includes(title), `unpublished follow candidate excluded: ${title}`)
  assert.ok(followedText.includes('بر اساس دنبال‌کردن'), 'follow signal is explained')
  await db.itemFavorite.delete({ where: { userId_itemType_itemId: { userId: user.id, itemType: 'studio', itemId: studio.id } } })
  for (let index = 0; index < 13; index++) {
    const favorite = await db.gameTitle.create({ data: { slug: `${seed}-new-favorite-${index}`, title: `${seed} new favorite ${index}`, genres: `${seed}-genre-${index}`, platforms: `${seed}-platform-${index}`, publishedAt } })
    ids.games.push(favorite.id)
    await db.itemFavorite.create({ data: { userId: user.id, itemType: 'game', itemId: favorite.id } })
  }
  await followPage.reload({ waitUntil: 'domcontentloaded' })
  const olderFollowText = await followShelf.innerText()
  assert.ok(olderFollowText.includes(album.title) && olderFollowText.includes(track.title), 'older artist follow survives more than 12 newer content favorites')
  assert.ok(!olderFollowText.includes(draftAlbum.title) && !olderFollowText.includes(futureTrack.title), 'older follow still observes publication gates')
  await followView.close()
  response = await request('PATCH', '/api/profile', { recommendationOptIn: false })
  assert.equal(response.status, 200)
  const after = await (await request('GET', '/api/profile')).json()
  assert.equal(after.recommendationOptIn, false, 'opt-out persists')
  await restoreGlobal()
  restoreGlobal = async () => {}
  console.log('Personal recommendations: consent, admin pause/resume, followed artists/studios, live-only suggestions, revocation and dark/light responsive browser OK')
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(async () => {
  if (browser) await browser.close()
  await restoreGlobal().catch((error) => { console.error('Could not restore global recommendation setting:', error); process.exitCode = 1 })
  if (ids.users.length) {
    await db.itemFavorite.deleteMany({ where: { userId: { in: ids.users } } })
    await db.userRecentView.deleteMany({ where: { userId: { in: ids.users } } })
  }
  if (ids.tracks.length) await db.musicTrack.deleteMany({ where: { id: { in: ids.tracks } } })
  if (ids.albums.length) await db.musicAlbum.deleteMany({ where: { id: { in: ids.albums } } })
  if (ids.artists.length) await db.musicArtist.deleteMany({ where: { id: { in: ids.artists } } })
  if (ids.games.length) await db.gameTitle.deleteMany({ where: { id: { in: ids.games } } })
  if (ids.software.length) await db.softwareTitle.deleteMany({ where: { id: { in: ids.software } } })
  if (ids.studios.length) await db.studio.deleteMany({ where: { id: { in: ids.studios } } })
  if (ids.users.length) await db.user.deleteMany({ where: { id: { in: ids.users } } })
  await db.$disconnect()
})
