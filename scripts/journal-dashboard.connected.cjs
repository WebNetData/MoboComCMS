// Run inside the local app container: node scripts/journal-dashboard.connected.cjs
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript-api')
const { PrismaClient } = require('@prisma/client')

const db = new PrismaClient()

function load(file, mocks = {}, cache = new Map()) {
  const absolute = path.resolve(__dirname, '..', file)
  if (cache.has(absolute)) return cache.get(absolute).exports
  const mod = { exports: {} }; cache.set(absolute, mod)
  const code = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText
  const localRequire = name => {
    if (Object.hasOwn(mocks, name)) return mocks[name]
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? path.resolve(__dirname, '../src', name.slice(2)) : path.resolve(path.dirname(absolute), name)
      for (const suffix of ['.ts', '/index.ts']) if (fs.existsSync(base + suffix)) return load(path.relative(path.resolve(__dirname, '..'), base + suffix), mocks, cache)
    }
    return require(name)
  }
  new Function('require', 'module', 'exports', code)(localRequire, mod, mod.exports)
  return mod.exports
}

async function main() {
  const now = new Date()
  const since = new Date(now.getTime() - 30 * 86_400_000)
  const { journalDashboard } = load('src/modules/journal/server/admin.ts', {
    '@/platform/database/prisma': { db },
    '@/modules/settings/server': { readJsonSetting: async () => null, writeJsonSetting: async () => {} },
  })
  const actual = await journalDashboard(now)
  const liveWhere = { status: 'PUBLISHED', publishedAt: { lte: now } }
  const [published, drafts, scheduled, recentPosts, pendingComments, comments30, vip, featured, categories, views] = await Promise.all([
    db.post.count({ where: liveWhere }),
    db.post.count({ where: { status: { not: 'PUBLISHED' } } }),
    db.post.count({ where: { status: 'PUBLISHED', publishedAt: { gt: now } } }),
    db.post.count({ where: { ...liveWhere, publishedAt: { gte: since, lte: now } } }),
    db.postComment.count({ where: { status: 'PENDING' } }),
    db.postComment.count({ where: { createdAt: { gte: since } } }),
    db.post.count({ where: { ...liveWhere, access: 'MEMBERS' } }),
    db.post.count({ where: { ...liveWhere, featured: true } }),
    db.postCategory.count(),
    db.post.aggregate({ where: liveWhere, _sum: { views: true } }),
  ])
  // Waiting decisions (review on, proposed edits) are counted too since the editorial review slices.
  const [reviewWaiting, proposals] = await Promise.all([db.post.count({ where: { status: 'PENDING' } }), db.postEditProposal.count()])
  assert.deepEqual(actual.kpis, { published, drafts, scheduled, views: views._sum.views || 0, posts30: recentPosts, pendingComments, comments30, vip, featured, categories, reviewWaiting, proposals })
  assert.equal(actual.series.length, 30)
  assert.ok(actual.worst.length <= 8)
  assert.ok(actual.topViewed.length <= 8)
  assert.ok(actual.scheduledList.length <= 6)
  console.log(`Journal dashboard: ${published} live posts and ${comments30} recent comments agree with database aggregates`)
}

main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => { await db.$disconnect() })
