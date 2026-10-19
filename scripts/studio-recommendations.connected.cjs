// Local PostgreSQL + port 3000: node --env-file=.env scripts/studio-recommendations.connected.cjs
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript-api')
const { PrismaClient } = require('@prisma/client')

process.env.DATABASE_URL = process.env.MOBOCOM_CONNECTED_DATABASE_URL || 'postgresql://mobocom:mobocom-local@127.0.0.1:5435/mobocom?schema=public'
const db = new PrismaClient()
const seed = `codex-studio-recommend-${Date.now()}`
const studios = [], games = [], software = []

async function main() {
  const makeStudio = async (name) => {
    const studio = await db.studio.create({ data: { name: `${seed} ${name}`, normalizedName: `${seed} ${name}` } })
    studios.push(studio.id)
    return studio.id
  }
  const [source, both, gameOnly, unrelated, draftOnly] = await Promise.all(['source', 'both', 'game-only', 'unrelated', 'draft-only'].map(makeStudio))
  const publishedAt = new Date(Date.now() - 86_400_000)
  const game = async (name, studioId, genres, status = 'PUBLISHED') => {
    const row = await db.gameTitle.create({ data: { slug: `${seed}-${name}`, title: name, developerStudioId: name === 'source-game' ? null : studioId, publisherStudioId: name === 'source-game' ? studioId : null, genres, status, publishedAt } })
    games.push(row.id)
    return row
  }
  const app = async (name, studioId, category, status = 'PUBLISHED') => {
    const row = await db.softwareTitle.create({ data: { slug: `${seed}-${name}`, title: name, developerStudioId: studioId, category, status, publishedAt } })
    software.push(row.id)
    return row
  }
  await Promise.all([game('source-game', source, 'RPG, Strategy'), app('source-app', source, 'Tools'), game('both-game', both, 'RPG'), app('both-app', both, 'Tools'), game('game-only-game', gameOnly, 'Strategy'), game('unrelated-game', unrelated, 'Puzzle'), game('draft-only-game', draftOnly, 'RPG', 'DRAFT')])
  const body = async () => (await (await fetch(`http://127.0.0.1:3000/studios/${source}`, { signal: AbortSignal.timeout(45_000) })).text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  const sourceCode = fs.readFileSync(path.join(__dirname, '../src/modules/recommendations/server/studios.ts'), 'utf8')
  const moduleCode = ts.transpileModule(sourceCode, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', moduleCode)((name) => name === '@/platform/database/prisma' ? { db } : require(name), mod, mod.exports)
  const recommendations = await mod.exports.recommendStudios(source, { games: true, software: true })
  assert.ok(recommendations.some((row) => row.id === both) && recommendations.some((row) => row.id === gameOnly), JSON.stringify(recommendations))
  const html = await body()
  const section = html.slice(html.indexOf('<section class="org-suggestions"'))
  assert.ok(section.includes(`/studios/${both}`) && section.includes(`/studios/${gameOnly}`), 'matching public studios are recommended')
  assert.ok(section.indexOf(`/studios/${both}`) < section.indexOf(`/studios/${gameOnly}`), 'two distinct topics rank ahead of one')
  assert.ok(!section.includes(`/studios/${source}`) && !section.includes(`/studios/${unrelated}`) && !section.includes(`/studios/${draftOnly}`), 'self, unrelated and draft-only studios are excluded')
  assert.ok(section.includes('بازی‌های هم‌سبک') || section.includes('نرم‌افزارهای هم‌دسته'), 'recommendation explains its topic overlap')
  await db.gameTitle.updateMany({ where: { developerStudioId: both }, data: { status: 'DRAFT' } })
  await db.softwareTitle.updateMany({ where: { developerStudioId: both }, data: { status: 'DRAFT' } })
  const updated = await body()
  assert.ok(!updated.slice(updated.indexOf('<section class="org-suggestions"')).includes(`/studios/${both}`), 'unpublished candidates disappear immediately')
  console.log('Studio recommendations PostgreSQL: explainable distinct-topic ranking, live-only candidates and draft recheck OK')
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(async () => {
  if (games.length) await db.gameTitle.deleteMany({ where: { id: { in: games } } })
  if (software.length) await db.softwareTitle.deleteMany({ where: { id: { in: software } } })
  if (studios.length) await db.studio.deleteMany({ where: { id: { in: studios } } })
  await db.$disconnect()
})
