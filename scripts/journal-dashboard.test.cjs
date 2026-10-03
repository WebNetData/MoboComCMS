const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

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

test('Journal dashboard scans live posts and recent comments in bounded pages', async () => {
  const now = new Date('2026-10-01T12:00:00Z')
  const live = Array.from({ length: 501 }, (_, index) => ({
    id: index + 1, slug: `post-${index + 1}`, title: `Post ${index + 1}`,
    cover: '', excerpt: '', content: 'short', publishedAt: new Date('2026-09-30T12:00:00Z'),
    views: index + 1, access: 'PUBLIC', featured: false, categoryId: 1,
    author: { name: 'Alice' }, _count: { categories: 0, comments: 1 },
  }))
  const comments = Array.from({ length: 501 }, (_, index) => ({ id: index + 1, createdAt: new Date('2026-09-30T12:00:00Z') }))
  const postCursors = []
  const commentCursors = []
  const db = {
    post: {
      count: async ({ where }) => {
        if (where.status?.not) { assert.equal(where.status.not, 'PUBLISHED'); return 1 }
        assert.equal(where.status, 'PUBLISHED')
        assert.equal(where.publishedAt.gt, now)
        return 1
      },
      findMany: async ({ where, take }) => {
        if (where.publishedAt?.gt) return [{ id: 502, title: 'Scheduled', cover: '', publishedAt: new Date('2026-10-02T12:00:00Z') }]
        assert.equal(where.status, 'PUBLISHED')
        assert.equal(where.publishedAt.lte, now)
        assert.ok(take <= 500, 'live posts must be read in bounded pages')
        postCursors.push(where.id.gt)
        return live.filter(post => post.id > where.id.gt).slice(0, take)
      },
    },
    postCategory: { findMany: async () => [{ id: 1, name: 'News', parentId: null }] },
    postComment: {
      count: async () => 1,
      findMany: async ({ where, take }) => {
        if (where.status === 'PENDING') return [{ id: 1, body: 'Pending', createdAt: now, user: { name: 'Bob' }, post: { title: 'Post 1' } }]
        assert.ok(where.createdAt.gte < now)
        assert.ok(take <= 500, 'comments must be read in bounded pages')
        commentCursors.push(where.id.gt)
        return comments.filter(comment => comment.id > where.id.gt).slice(0, take)
      },
    },
  }
  const { journalDashboard } = load('src/modules/journal/server/admin.ts', {
    '@/platform/database/prisma': { db },
    '@/modules/settings/server': { readJsonSetting: async () => null, writeJsonSetting: async () => {} },
  })
  const data = await journalDashboard(now)
  assert.deepEqual(postCursors, [0, 500])
  assert.deepEqual(commentCursors, [0, 500])
  assert.deepEqual(data.kpis, { published: 501, drafts: 1, scheduled: 1, views: 125751, posts30: 501, pendingComments: 1, comments30: 501, vip: 0, featured: 0, categories: 1 })
  assert.equal(data.series.reduce((sum, day) => sum + day.posts, 0), 501)
  assert.equal(data.series.reduce((sum, day) => sum + day.comments, 0), 501)
  assert.equal(data.topViewed[0].id, 501)
  assert.deepEqual(data.worst.map(post => post.id), [1, 2, 3, 4, 5, 6, 7, 8])
  assert.equal(data.scheduledList[0].title, 'Scheduled')
  assert.deepEqual(data.authors, [{ name: 'Alice', posts: 501, views: 125751 }])
  assert.deepEqual(data.categories, [{ name: 'News', count: 501 }])
})
