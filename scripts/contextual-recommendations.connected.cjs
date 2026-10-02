// Local PostgreSQL + port 3000: node --env-file=.env scripts/contextual-recommendations.connected.cjs
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const { PrismaClient } = require('@prisma/client')
const { chromium } = require('playwright')

process.env.DATABASE_URL = process.env.MOBOCOM_CONNECTED_DATABASE_URL || 'postgresql://mobocom:mobocom-local@127.0.0.1:5435/mobocom?schema=public'
const db = new PrismaClient()
const seed = `codex-contextual-${Date.now()}`
const games = [], software = [], studios = [], cinema = []
let browser

function load(relative, imports = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', relative), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', output)((name) => imports[name] || require(name), mod, mod.exports)
  return mod.exports
}

async function main() {
  const domain = load('src/modules/recommendations/domain/contextual.ts')
  const adapter = load('src/modules/recommendations/server/contextual.ts', { '@/platform/database/prisma': { db }, '@/modules/recommendations/domain/contextual': domain })
  const now = Date.now()
  const past = new Date(now - 86_400_000)
  const future = new Date(now + 86_400_000)
  const makeStudio = async (name) => {
    const row = await db.studio.create({ data: { name: `${seed}-${name}`, normalizedName: `${seed}-${name}` } })
    studios.push(row.id)
    return row.id
  }
  const [one, two] = await Promise.all(['one', 'two'].map(makeStudio))
  const game = async (name, data = {}) => {
    const row = await db.gameTitle.create({ data: { slug: `${seed}-${name}`, title: name, publishedAt: past, ...data } })
    games.push(row.id)
    return row
  }
  const app = async (name, data = {}) => {
    const row = await db.softwareTitle.create({ data: { slug: `${seed}-${name}`, title: name, publishedAt: past, ...data } })
    software.push(row.id)
    return row
  }
  const title = async (name, data = {}) => {
    const row = await db.cinemaTitle.create({ data: { slug: `${seed}-${name}`, title: name, publishedAt: past, ...data } })
    cinema.push(row.id)
    return row
  }
  const gameSource = await game('game-source', { genres: 'RPG, Strategy', platforms: 'PC', developerStudioId: one })
  const gameStrong = await game('game-strong', { genres: 'Strategy, RPG', platforms: 'PC', publisherStudioId: one })
  const gameTopic = await game('game-topic', { genres: 'Strategy', platforms: 'Switch', developerStudioId: two })
  const gamePlatform = await game('game-platform', { genres: 'Puzzle', platforms: 'PC' })
  const gameDraft = await game('game-draft', { genres: 'RPG', status: 'DRAFT' })
  const gameFuture = await game('game-future', { genres: 'RPG', publishedAt: future })
  const appSource = await app('app-source', { category: 'Utilities', platforms: 'Windows', developerStudioId: one })
  const appTopic = await app('app-topic', { category: 'Utilities', platforms: 'Linux', publisherStudioId: one })
  const appPlatform = await app('app-platform', { category: 'Office', platforms: 'Windows' })
  const appDraft = await app('app-draft', { category: 'Utilities', status: 'DRAFT' })
  const cinemaSource = await title('cinema-source', { kind: 'MOVIE', genres: 'Drama, Mystery' })
  const cinemaStrong = await title('cinema-strong', { kind: 'MOVIE', genres: 'Mystery, Drama' })
  const cinemaGenre = await title('cinema-genre', { kind: 'SERIES', genres: 'Drama' })
  const cinemaKind = await title('cinema-kind', { kind: 'MOVIE', genres: 'Comedy' })
  const cinemaDraft = await title('cinema-draft', { kind: 'MOVIE', genres: 'Drama', status: 'DRAFT' })
  const cinemaFuture = await title('cinema-future', { kind: 'MOVIE', genres: 'Drama', publishedAt: future })

  const gameResults = await adapter.relatedGames(gameSource)
  assert.deepEqual(gameResults.slice(0, 3).map((item) => item.item.id), [gameStrong.id, gameTopic.id, gamePlatform.id])
  assert.ok(['سبک مشترک: RPG', 'سبک مشترک: Strategy'].includes(gameResults[0].reason))
  assert.ok(!gameResults.some((item) => [gameSource.id, gameDraft.id, gameFuture.id].includes(item.item.id)))
  const appResults = await adapter.relatedSoftware(appSource)
  assert.deepEqual(appResults.slice(0, 2).map((item) => item.item.id), [appTopic.id, appPlatform.id])
  assert.equal(appResults[0].reason, 'دستهٔ مشترک: Utilities')
  assert.ok(!appResults.some((item) => [appSource.id, appDraft.id].includes(item.item.id)))
  const cinemaResults = await adapter.relatedCinema(cinemaSource)
  assert.deepEqual(cinemaResults.slice(0, 3).map((item) => item.item.id), [cinemaStrong.id, cinemaGenre.id, cinemaKind.id])
  assert.ok(!cinemaResults.some((item) => [cinemaSource.id, cinemaDraft.id, cinemaFuture.id].includes(item.item.id)))
  const falseSubstring = domain.rankContextual({ type: 'game', id: 1, topics: ['RPG'], platforms: [], creators: [], publishedAt: past }, [{ id: 2, topics: ['JRPG'], platforms: [], creators: [], publishedAt: past }])
  assert.equal(falseSubstring.length, 0, 'substring retrieval must not become a recommendation')

  browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
  fs.mkdirSync(path.join(__dirname, '..', 'var'), { recursive: true })
  for (const theme of ['dark', 'light']) for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } })
    await context.addCookies([{ name: 'theme', value: theme, url: 'http://127.0.0.1:3000' }])
    const page = await context.newPage()
    for (const [kind, source, expected, hidden, selector] of [
      ['game', gameSource, gameStrong, gameDraft, '.gx-cover-reason'],
      ['software', appSource, appTopic, appDraft, '.sp-app-reason'],
      ['cinema', cinemaSource, cinemaStrong, cinemaDraft, '.cn-poster-reason'],
    ]) {
      await page.goto(`http://127.0.0.1:3000/${kind === 'game' ? 'games' : kind}/${source.slug}`, { waitUntil: 'networkidle', timeout: 60000 })
      const text = await page.locator('body').innerText()
      assert.ok(text.includes(expected.title) && !text.includes(hidden.title), `${kind} public related cards respect publication`)
      assert.ok(await page.locator(selector).count(), `${kind} related cards explain the suggestion`)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
      assert.ok(overflow <= 1, `${kind} ${theme} ${width} overflow ${overflow}`)
      await page.screenshot({ path: path.join(__dirname, '..', 'var', `contextual-${kind}-${theme}-${width}.png`), fullPage: true })
    }
    await context.close()
  }
  console.log('Contextual recommendations: Game/Software/Cinema ranking, live gates, exact matching, explained cards and dark/light 390/1440 browser layouts OK')
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(async () => {
  if (browser) await browser.close()
  if (games.length) await db.gameTitle.deleteMany({ where: { id: { in: games } } })
  if (software.length) await db.softwareTitle.deleteMany({ where: { id: { in: software } } })
  if (cinema.length) await db.cinemaTitle.deleteMany({ where: { id: { in: cinema } } })
  if (studios.length) await db.studio.deleteMany({ where: { id: { in: studios } } })
  await db.$disconnect()
})
