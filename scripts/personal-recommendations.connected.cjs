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
const ids = { users: [], games: [] }
let browser

function noConsentReadCheck() {
  const source = fs.readFileSync(path.join(__dirname, '../src/modules/recommendations/server/personal.ts'), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const mod = { exports: {} }
  const forbidden = { findMany: () => { throw new Error('Private activity read without consent') } }
  const mockDb = { user: { findUnique: async () => ({ recommendationOptIn: false }) }, itemFavorite: forbidden, userRecentView: forbidden }
  new Function('require', 'module', 'exports', output)((name) => name === '@/platform/database/prisma' ? { db: mockDb } : name === '@/modules/content/server/registry' ? {} : name === '@/modules/content/domain/items' ? {} : name === '@/modules/recommendations/server/contextual' ? {} : require(name), mod, mod.exports)
  return mod.exports.personalRecommendations(1).then((result) => assert.deepEqual(result, { enabled: false, items: [] }))
}

async function main() {
  await noConsentReadCheck()
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
  await page.goto('http://127.0.0.1:3000/dashboard/library', { waitUntil: 'networkidle', timeout: 60000 })
  let shelf = page.locator('section[aria-labelledby="lb-suggestions-title"]')
  assert.ok((await shelf.innerText()).includes('خاموش'), 'private library reports opt-out')
  assert.ok(!(await shelf.innerText()).includes(related.title), 'opt-out does not show recommendations')

  response = await request('PATCH', '/api/profile', { recommendationOptIn: true })
  assert.equal(response.status, 200, response.status === 200 ? '' : await response.text())
  profile = await response.json()
  assert.equal(profile.recommendationOptIn, true)
  await page.reload({ waitUntil: 'networkidle' })
  shelf = page.locator('section[aria-labelledby="lb-suggestions-title"]')
  assert.ok((await shelf.innerText()).includes(related.title), 'opted-in user sees related game')
  assert.ok(!(await shelf.innerText()).includes(hidden.title), 'draft game is absent')
  assert.ok((await shelf.innerText()).includes(source.title), 'explanation names the source')
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: other.id } })).recommendationOptIn, false, 'another account remains opted out')

  await context.close()
  for (const theme of ['dark', 'light']) for (const width of [390, 1440]) {
    const view = await browser.newContext({ viewport: { width, height: 900 } })
    await view.addCookies([{ name: 'next-auth.session-token', value: token, url: 'http://127.0.0.1:3000' }, { name: 'theme', value: theme, url: 'http://127.0.0.1:3000' }])
    const screen = await view.newPage()
    for (const route of ['profile', 'library']) {
      await screen.goto(`http://127.0.0.1:3000/dashboard/${route}`, { waitUntil: 'networkidle', timeout: 60000 })
      if (route === 'profile') {
        const control = screen.locator('section[aria-labelledby="recommendation-preference-title"] input[role="switch"]')
        await control.waitFor()
        assert.equal(await control.isChecked(), true)
      } else assert.ok((await screen.locator('section[aria-labelledby="lb-suggestions-title"]').innerText()).includes(related.title))
      const overflow = await screen.evaluate(() => document.documentElement.scrollWidth - innerWidth)
      assert.ok(overflow <= 1, `${route} ${theme} ${width} overflow ${overflow}`)
      await screen.screenshot({ path: path.join(__dirname, '..', 'var', `personal-${route}-${theme}-${width}.png`), fullPage: true })
    }
    await view.close()
  }
  response = await request('PATCH', '/api/profile', { recommendationOptIn: false })
  assert.equal(response.status, 200)
  const after = await (await request('GET', '/api/profile')).json()
  assert.equal(after.recommendationOptIn, false, 'opt-out persists')
  console.log('Personal recommendations: default opt-out, no private reads, owner-scoped toggle, live-only suggestions, revocation and dark/light responsive browser OK')
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(async () => {
  if (browser) await browser.close()
  if (ids.users.length) {
    await db.itemFavorite.deleteMany({ where: { userId: { in: ids.users } } })
    await db.userRecentView.deleteMany({ where: { userId: { in: ids.users } } })
  }
  if (ids.games.length) await db.gameTitle.deleteMany({ where: { id: { in: ids.games } } })
  if (ids.users.length) await db.user.deleteMany({ where: { id: { in: ids.users } } })
  await db.$disconnect()
})
