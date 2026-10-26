const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript-api')
function load(relative, mocks = {}, cache = new Map()) {
  const file = path.resolve(__dirname, '..', relative)
  if (cache.has(file)) return cache.get(file).exports
  const mod = { exports: {} }; cache.set(file, mod)
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText
  new Function('require', 'module', 'exports', code)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name]
    if (name.startsWith('@/')) return load(`src/${name.slice(2)}.ts`, mocks, cache)
    return require(name)
  }, mod, mod.exports)
  return mod.exports
}

test('cross-artist discovery bounds candidates, excludes shown album tracks and ranks exact genre terms', async () => {
  const previous = process.env.DATABASE_URL
  try {
    for (const provider of ['file:./test.db', 'postgresql://local/test']) {
      process.env.DATABASE_URL = provider
      let query, calls = 0
      const adapter = load('src/modules/recommendations/server/contextual.ts', {
        '@/platform/database/prisma': { db: { musicTrack: { findMany: async args => {
          calls++; query = args
          return [
            { id: 2, genre: 'POP, R&B', artistId: 20, publishedAt: new Date('2024-01-01') },
            { id: 3, genre: 'Pop', artistId: 30, publishedAt: new Date('2025-01-01') },
            { id: 4, genre: 'JPop', artistId: 40, publishedAt: new Date('2025-02-01') },
          ]
        } } } },
      })
      const results = await adapter.relatedTracks({ id: 1, genre: 'Pop, R&B', artistId: 10 }, 8, [5])
      assert.deepEqual(results.map(result => result.item), [{ type: 'track', id: 2 }, { type: 'track', id: 3 }])
      assert.ok(results.every(result => result.reason.startsWith('سبک مشترک:')))
      assert.equal(query.take, 180)
      assert.deepEqual(query.where.artistId, { not: 10 })
      assert.deepEqual(query.where.id, { notIn: [1, 5] })
      assert.equal(query.where.status, 'PUBLISHED')
      assert.ok(query.where.publishedAt.lte instanceof Date)
      assert.equal(query.where.OR[0].genre.mode, provider.startsWith('file:') ? undefined : 'insensitive')
      assert.deepEqual(Object.keys(query.select).sort(), ['artistId', 'genre', 'id', 'publishedAt'])
      assert.deepEqual(await adapter.relatedTracks({ id: 1, genre: '', artistId: 10 }), [])
      assert.equal(calls, 1, 'no-genre sources do not scan arbitrary fresh music')
    }
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL
    else process.env.DATABASE_URL = previous
  }
})

test('detail hydration rechecks publication, keeps reason order and never exposes media sources', async () => {
  const artist = { id: 10, slug: 'artist', name: 'Artist', nameEn: '', image: '' }
  const source = { id: 1, artistId: 10, albumId: 9, slug: 'source', title: 'Source', titleEn: '', genre: 'Pop', artist, album: null, audioUrl: '/private/source.mp3', audioHqUrl: '', publishedAt: new Date(), lyrics: '', downloads: 0 }
  let adapterCalls = 0, hydrateCalls = 0
  const queries = load('src/modules/media/server/queries.ts', {
    // A song's credits and the music lists' names are read beside it; none here.
    '@/platform/database/prisma': { db: { musicCredit: { findMany: async () => [] }, vocabulary: { findMany: async () => [] }, musicTrack: {
      findFirst: async () => source,
      findMany: async ({ where }) => {
        if (where.albumId) return [{ ...source, id: 5 }]
        if (where.id?.in) {
          hydrateCalls++
          assert.equal(where.status, 'PUBLISHED')
          assert.ok(where.publishedAt.lte instanceof Date)
          return [{ ...source, id: 2, slug: 'related', title: 'Related', access: 'MEMBERS', artist: { ...artist, id: 20 }, audioUrl: '/private/related.mp3' }]
        }
        return []
      },
    } } },
    '@/modules/software/server/current-version': {},
    '@/modules/cinema/server/people': { canonicalPersonId: async id => id },
    '@/shared/content/sanitize': { cleanRichText: value => value },
    '@/modules/recommendations/server/contextual': { relatedTracks: async (_source, take, excluded) => {
      adapterCalls++; assert.equal(take, 8); assert.deepEqual(excluded, [5])
      return [{ item: { type: 'track', id: 3 }, reason: 'Withdrawn' }, { item: { type: 'track', id: 2 }, reason: 'Shared Pop' }]
    } },
  })
  assert.deepEqual((await queries.getTrack('source')).relatedTracks, [])
  assert.equal(adapterCalls, 0)
  const result = await queries.getTrack('source', { recommendations: true })
  assert.deepEqual(result.relatedTracks.map(track => track.id), [2], 'a withdrawn selected track is omitted')
  assert.equal(result.relatedTracks[0].recommendationReason, 'Shared Pop')
  assert.equal(result.relatedTracks[0].access, 'MEMBERS')
  assert.doesNotMatch(JSON.stringify(result), /\/private\//)
  assert.equal(hydrateCalls, 1)
})

test('old Music settings clients preserve the current discovery flag and explicit toggles persist', async () => {
  let stored = { showRelatedTracks: false }
  const settings = { readJsonSetting: async () => stored, updateJsonSetting: async (_key, work) => work(stored, {}) }
  const mocks = {
    '@/platform/database/prisma': { db: {} },
    '@/modules/settings/server': settings,
    '@/platform/audit/server': {},
    '@/modules/content/server/revisions': { RevisionError: class extends Error {} },
  }
  // Exercise the real typed history adapter; only its database transaction boundary is a double here.
  settings.createSectionSettingsHistory = load('src/modules/settings/server/section-history.ts', mocks).createSectionSettingsHistory
  const service = load('src/modules/music/server/admin.ts', mocks)
  assert.equal((await service.getMusicSettings()).showRelatedTracks, false)
  assert.equal((await service.saveMusicSettings({ showLyrics: false })).showRelatedTracks, false)
  assert.equal((await service.saveMusicSettings({ showRelatedTracks: true })).showRelatedTracks, true)
  assert.equal((await service.saveMusicSettings({ showRelatedTracks: false })).showRelatedTracks, false)
})

test('track signals use the existing consent gate and publication recheck for private recommendations', async () => {
  let opted = false, signalReads = 0, adapterCalls = 0
  const source = { type: 'track', id: 1, title: 'Liked track' }
  const suggestion = { type: 'track', id: 2, title: 'Related track' }
  const service = load('src/modules/recommendations/server/personal.ts', {
    '@/platform/database/prisma': { db: {
      setting: { findUnique: async () => ({ value: 'true' }) },
      user: { findUnique: async () => ({ recommendationOptIn: opted }) },
      itemFavorite: { findMany: async ({ where }) => { signalReads++; return where.itemType.in.includes('track') ? [{ itemType: 'track', itemId: 1 }] : [] } },
      userRecentView: { findMany: async () => { signalReads++; return [] } },
      itemReview: { findMany: async () => { signalReads++; return [] } },
      musicTrack: { findFirst: async ({ where }) => { assert.equal(where.status, 'PUBLISHED'); assert.ok(where.publishedAt.lte instanceof Date); return { id: 1, artistId: 10, genre: 'Pop' } } },
    } },
    '@/modules/content/server/registry': { itemCards: async refs => new Map(refs.map(ref => [`track:${ref.id}`, ref.id === 1 ? source : suggestion])) },
    '@/modules/recommendations/server/contextual': { relatedTracks: async () => { adapterCalls++; return [{ item: { type: 'track', id: 2 }, score: 10, reason: 'Shared genre' }] } },
  })
  assert.deepEqual(await service.personalRecommendations(7), { available: true, enabled: false, items: [] })
  assert.equal(signalReads, 0)
  opted = true
  const result = await service.personalRecommendations(7)
  assert.equal(adapterCalls, 1)
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0].item.id, 2)
  assert.equal(result.items[0].sourceKind, 'favorite')
})
