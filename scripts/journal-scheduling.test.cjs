const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript-api')

test('journal archive starts at explicit page1, retains filters and never skips initial stories', () => {
  const { journalBrowseUrl, journalPagination } = load('src/modules/journal/domain/pagination.ts')
  assert.equal(journalBrowseUrl(), '/blog')
  assert.equal(journalBrowseUrl({ archive: true }), '/blog?page=1')
  const url = new URL(journalBrowseUrl({ category: 'آموزش', query: 'عنوان & راهنما', page: 2, archive: true }), 'https://example.invalid')
  assert.equal(url.searchParams.get('category'), 'آموزش'); assert.equal(url.searchParams.get('q'), 'عنوان & راهنما'); assert.equal(url.searchParams.get('page'), '2')
  assert.equal(journalBrowseUrl({ category: 'training', query: 'guide', page: 1, archive: true }), '/blog?category=training&q=guide')
  assert.deepEqual(journalPagination(25, 12, '2'), { page: 2, pages: 3, skip: 12, first: 13, last: 24 })
  for (const invalid of [undefined, '', '-3', 'NaN', 'Infinity', '2.5', '9007199254740992']) assert.equal(journalPagination(25, 12, invalid).page, 1)
  assert.deepEqual(journalPagination(5, 24, '2'), { page: 1, pages: 1, skip: 0, first: 1, last: 5 })
  assert.deepEqual(journalPagination(0, 24, '99'), { page: 1, pages: 1, skip: 0, first: 0, last: 0 })
  assert.deepEqual(journalPagination(25, 12, '99'), { page: 3, pages: 3, skip: 24, first: 25, last: 25 })
})

test('journal numbered navigation stays bounded, ordered and reachable for large archives', () => {
  const { journalPageNumbers } = load('src/modules/journal/domain/pagination.ts')
  assert.deepEqual(journalPageNumbers(1, 1), [1])
  assert.deepEqual(journalPageNumbers(4, 7), [1, 2, 3, 4, 5, 6, 7])
  for (const pages of [2, 5, 10, 100, 1000000]) for (const page of new Set([1, Math.ceil(pages / 2), pages])) {
    const items = journalPageNumbers(page, pages), numbers = items.filter(x => typeof x === 'number')
    assert.equal(numbers[0], 1); assert.equal(numbers.at(-1), pages); assert.ok(numbers.includes(page)); assert.ok(items.length <= 9)
    assert.deepEqual(numbers, [...new Set(numbers)].sort((a, b) => a - b))
    assert.ok(numbers.every(n => n >= 1 && n <= pages))
  }
})
const { NextRequest } = require('next/server')

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

test('publication date accepts an absolute time or an explicit publish-now reset', () => {
  const { publicationDateInput, isLivePost } = load('src/modules/journal/domain/journal.ts')
  const now = new Date('2026-10-03T10:00:00.000Z')
  const due = publicationDateInput('2026-10-03T13:30:00+03:30')
  assert.equal(due.toISOString(), now.toISOString())
  assert.equal(publicationDateInput('2026-10-03T13:30+03:30').toISOString(), now.toISOString())
  assert.equal(publicationDateInput('', now), now)
  assert.equal(isLivePost({ status: 'PUBLISHED', publishedAt: due }, now), true)
  assert.equal(isLivePost({ status: 'PUBLISHED', publishedAt: new Date(now.getTime() + 1000) }, now), false)
  for (const value of ['2026-10-03T13:30', 'tomorrow', '2026-13-03T00:00Z', '2026-02-30T14:30:00Z', 42]) assert.throws(() => publicationDateInput(value), /Invalid publication date/)
})

test('admin post create and edit preserve schedules and reject ambiguous dates', async () => {
  let created, updated
  const revisions = []
  const scheduled = new Date(Date.now() + 86_400_000).toISOString()
  const db = {
    post: {
      create: async ({ data }) => { created = data; return { id: 7, ...data } },
      findUnique: async () => ({ id: 7, authorId: null, status: 'PUBLISHED', updatedAt: new Date('2026-10-01T00:00:00Z'), publishedAt: new Date(scheduled), title: 'Scheduled article', categories: [] }),
      updateMany: async () => ({ count: 1 }),
      update: async ({ data }) => { updated = data; return { id: 7, status: 'PUBLISHED', publishedAt: new Date(scheduled), ...data } },
    },
    $transaction: async (fn) => fn(db),
  }
  const mocks = {
    '@/platform/database/prisma': { db },
    '@/modules/identity/server/access': { requirePerm: async () => ({ id: 1 }), requireContentScope: async () => ({ admin: { id: 1 }, authorId: null }) },
    '@/modules/content/server/events': { contentChanged() {} },
    '@/modules/membership/domain/membership': { normalizeAccess: () => 'PUBLIC' },
    '@/shared/content/sanitize': { cleanRichText: value => value, richTextToPlain: value => value },
    '@/shared/content/cover': { validateCover: value => value },
    '@/modules/site/server/categories': { validateCategorySelection: async () => [] },
    '@/extensions/server/modules': { isModuleEnabled: async () => true },
    '@/modules/content/server/revisions': { RevisionError: load('src/modules/content/server/revisions.ts', { '@/platform/database/prisma': { db }, '@/platform/observability/logger': { logEvent() {} } }).RevisionError, recordRevision: async input => { assert.equal(input.client, db); assert.equal(input.strict, true); revisions.push(input) } },
  }
  for (const name of ['@/modules/site/server/page-layout', '@/shared/money', '@/modules/site/domain/categories', '@/modules/catalog/server/product-config', '@/modules/catalog/server/product-input', '@/modules/fx/server/fx', '@/modules/content/server/bulk', '@/platform/audit/server', '@/modules/seo/server/indexnow']) mocks[name] = {}
  const route = load('src/modules/site/server/http/admin/cms/route.ts', mocks)
  const request = (method, body) => new NextRequest('http://localhost/api/admin/cms?type=posts', { method, body: JSON.stringify(body) })
  assert.equal((await route.POST(request('POST', { slug: 'scheduled', title: 'Scheduled article', status: 'PUBLISHED', publishedAt: scheduled }))).status, 200)
  assert.equal(created.publishedAt.toISOString(), scheduled)
  assert.equal((await route.PATCH(request('PATCH', { id: 7, title: 'Edited only' }))).status, 200)
  assert.equal(Object.hasOwn(updated, 'publishedAt'), false, 'old clients and unrelated edits keep the stored schedule')
  assert.equal((await route.PATCH(request('PATCH', { id: 7, publishedAt: '' }))).status, 200)
  assert.ok(updated.publishedAt instanceof Date && updated.publishedAt.getTime() <= Date.now())
  assert.equal((await route.POST(request('POST', { slug: 'bad-date', title: 'Bad date', publishedAt: '2026-10-03T13:30' }))).status, 400)
  assert.equal(revisions.length, 3, 'all successful writes retain the strict transactional revision contract')
})

test('IndexNow receives only due articles and approved products', () => {
  const { publicPathFor } = load('src/modules/seo/server/indexnow.ts', {
    '@/platform/database/prisma': { db: {} },
    '@/modules/settings/server': {},
    './config': {},
  })
  assert.equal(publicPathFor('posts', { slug: 'soon', status: 'PUBLISHED', publishedAt: new Date(Date.now() + 60_000) }), null)
  assert.equal(publicPathFor('posts', { slug: 'unknown', status: 'PUBLISHED' }), null)
  assert.equal(publicPathFor('posts', { slug: 'now', status: 'PUBLISHED', publishedAt: new Date(Date.now() - 60_000) }), '/blog/now')
  assert.equal(publicPathFor('products', { slug: 'pending', active: true, approval: 'PENDING' }), null)
  assert.equal(publicPathFor('products', { slug: 'unknown', active: true }), null)
  assert.equal(publicPathFor('products', { slug: 'approved', active: true, approval: 'APPROVED' }), '/products/approved')
})

test('scheduled announcements move with the date, cancel on draft, and never resend sent rows', async () => {
  let row = null
  const db = { socialPost: {
    findUnique: async () => row,
    upsert: async ({ create, update }) => { row = row ? { ...row, ...update } : { ...create }; return row },
    updateMany: async ({ where, data }) => { if (row?.status !== where.status) return { count: 0 }; row = { ...row, ...data }; return { count: 1 } },
  } }
  const settings = { delayMinutes: 0, types: { post: true }, telegram: { enabled: false }, instagram: { enabled: false }, push: { enabled: true } }
  const social = load('src/modules/social/server/social.ts', {
    '@/platform/database/prisma': { db },
    '@/platform/observability/logger': { logEvent() {} },
    '@/extensions/server/modules': { isModuleEnabled: async () => true },
    '@/modules/settings/server': { readJsonSetting: async () => null },
    '@/modules/providers/server/panel-credentials': {},
    '@/modules/notifications/server/telegram': {},
    '@/modules/site/server/seo': {},
    '@/modules/content/domain/items': {},
    '@/modules/site/server/maintenance': { closedSectionPlugins: async () => new Set(globalThis.__closedSections || []) }, '@/modules/content/server/registry': {},
    '@/modules/push/server/push': {},
    '@/modules/social/domain/social': { DEFAULT_SOCIAL: settings, isAnnounceType: type => type === 'post' },
  })
  const ref = { type: 'post', id: 7 }
  const first = new Date(Date.now() + 86_400_000)
  const later = new Date(first.getTime() + 86_400_000)
  await social.enqueueAnnouncement(ref, first, { channels: ['PUSH'] })
  assert.equal(row.nextAttemptAt.getTime(), first.getTime())
  await social.enqueueAnnouncement(ref, later, { channels: ['PUSH'] })
  assert.equal(row.nextAttemptAt.getTime(), first.getTime(), 'normal enqueue is deduplicated')
  await social.enqueueAnnouncement(ref, later, { channels: ['PUSH'], reschedulePending: true })
  assert.equal(row.nextAttemptAt.getTime(), later.getTime())
  await social.cancelPendingAnnouncement(ref)
  assert.equal(row.status, 'SKIPPED')
  await social.enqueueAnnouncement(ref, first, { channels: ['PUSH'], reschedulePending: true })
  assert.equal(row.status, 'PENDING')
  row.status = 'SENT'
  await social.enqueueAnnouncement(ref, later, { channels: ['PUSH'], reschedulePending: true })
  assert.equal(row.status, 'SENT')
})

test('seller approval and rejection publish through the shared content event', async () => {
  const events = []
  let product = { id: 9, slug: 'seller-product', name: 'Seller product', active: true, approval: 'PENDING', seller: { id: 4, userId: 8 } }
  const db = { product: {
    findFirst: async () => product,
    update: async ({ data }) => { product = { ...product, ...data }; return product },
  } }
  db.$transaction = async write => write(db)
  const marketplace = load('src/modules/marketplace/server/marketplace.ts', {
    '@/modules/catalog/server/price-history': { prepareProductPriceCapture: async () => new Map(), capturePublicProductPrices: async () => 0 },
    '@/platform/database/prisma': { db },
    '@/extensions/server/modules': { isModuleEnabled: async () => true },
    '@/modules/settings/server': {},
    '@/modules/notifications/server/inbox': { createInboxEvent: async () => ({}) },
    '@/modules/catalog/server/product-input': {},
    '@/modules/catalog/server/product-config': {},
    '@/modules/content/server/events': { contentChanged: (...args) => events.push(args) },
  })
  await marketplace.decideProduct({ id: 9, action: 'approve' })
  assert.equal(events.length, 1)
  assert.equal(events[0][1].approval, 'PENDING')
  assert.equal(events[0][2].approval, 'APPROVED')
  await marketplace.decideProduct({ id: 9, action: 'reject', note: 'Needs revision' })
  assert.equal(events.length, 2)
  assert.equal(events[1][1].approval, 'APPROVED')
  assert.equal(events[1][2].approval, 'REJECTED')
})

test('search prepares scheduled posts while public item lookups keep them hidden', async () => {
  const future = new Date(Date.now() + 60_000)
  const post = { id: 41, slug: 'scheduled-search', title: 'Scheduled story', titleEn: '', excerpt: 'Story summary', content: 'Story body', cover: '', status: 'PUBLISHED', access: 'PUBLIC', publishedAt: future, updatedAt: new Date(), views: 0, category: null }
  const queries = []
  const db = { post: { findMany: async (query) => { queries.push(query); return query.where.publishedAt || (query.where.id?.gt ?? 0) >= post.id ? [] : [post] } } }
  const registry = load('src/modules/content/server/registry.ts', {
    // Publication timing is isolated from whole-section audience settings here.
    '@/modules/site/server/maintenance': { closedSectionPlugins: async () => new Set() },
    '@/platform/database/prisma': { db },
    '@/extensions/server/modules': { getModuleStates: async () => ({}) },
    '@/modules/software/server/current-version': { currentSoftwareVersions: async () => new Map(), projectSoftwareVersion: (row) => row },
  })
  assert.equal(await registry.itemCard({ type: 'post', id: post.id }), null)
  assert.equal((await registry.searchIndexCard({ type: 'post', id: post.id })).id, post.id)
  assert.equal((await registry.searchIndexPage('post', 0, 2)).length, 1)
  assert.equal((await registry.searchIndexPage('post', post.id, 2)).length, 0)
  assert.ok(queries[0].where.publishedAt)
  assert.equal(queries[1].where.status, 'PUBLISHED')
  assert.equal(queries[2].where.status, 'PUBLISHED')
  assert.equal(queries[2].where.id.gt, 0)
  assert.deepEqual(queries[2].orderBy, { id: 'asc' })
})

test('search indexes scheduled posts but excludes them from candidates until due', async () => {
  const future = new Date(Date.now() + 60_000)
  const card = { type: 'post', id: 42, title: 'Scheduled story', subtitle: '', summary: '', keywords: '', url: '/journal/scheduled-story', image: '', access: 'PUBLIC', popularity: 0, publishedAt: future }
  let indexed = null
  let candidates = null
  const db = {
    setting: { findUnique: async () => ({ value: new Date().toISOString() }) },
    searchDocument: {
      upsert: async ({ create }) => { indexed = create },
      findMany: async ({ where }) => { candidates = where; return [] },
    },
  }
  const search = load('src/modules/search/server/search.ts', {
    '@/platform/database/prisma': { db },
    '@/extensions/server/modules': { isModuleEnabled: async () => true },
    '@/modules/site/server/maintenance': { closedSectionPlugins: async () => new Set(globalThis.__closedSections || []) }, '@/modules/content/server/registry': { enabledItemTypes: async () => ['post'], searchIndexCard: async () => card, itemCards: async () => new Map() },
    '@/modules/analytics/server/collect': { recordSearch: async () => {} },
  })
  await search.reindexItem({ type: 'post', id: card.id })
  assert.equal(indexed.publishedAt, future)
  await search.searchSite({ q: 'Scheduled', log: false })
  assert.ok(candidates.publishedAt.lte <= future)
})

test('a magazine category and an archive page are pages of their own; a search and an unknown category are not indexed', () => {
  const { journalListingMeta } = load('src/modules/journal/domain/journal.ts')
  const base = '/blog', guides = { slug: 'guides', name: 'آموزش' }
  assert.equal(journalListingMeta({ base }), null, 'the home keeps the section SEO')
  const category = journalListingMeta({ base, categoryAsked: 'guides', category: guides })
  assert.deepEqual([category.canonical, category.index], ['/blog?category=guides', true], 'the address the sitemap lists')
  assert.match(category.title, /^آموزش — مجله$/); assert.match(category.description, /«آموزش»/)
  const second = journalListingMeta({ base, categoryAsked: 'guides', category: guides, page: '2' })
  assert.deepEqual([second.canonical, second.title], ['/blog?category=guides&page=2', 'آموزش — صفحهٔ ۲ — مجله'])
  assert.deepEqual(journalListingMeta({ base, categoryAsked: 'شبکه', category: { slug: 'شبکه', name: 'شبکه' } }).canonical, '/blog?category=%D8%B4%D8%A8%DA%A9%D9%87')
  assert.deepEqual([journalListingMeta({ base, page: '1' }).canonical, journalListingMeta({ base, page: '1' }).title], ['/blog?page=1', 'آرشیو مجله'])
  assert.deepEqual([journalListingMeta({ base, page: '3' }).canonical, journalListingMeta({ base, page: '3' }).title], ['/blog?page=3', 'مجله — صفحهٔ ۳'])
  assert.equal(journalListingMeta({ base, page: 'abc' }).canonical, '/blog?page=1', 'a broken page number is the first archive page')
  assert.equal(journalListingMeta({ base, categoryAsked: 'missing', category: null }).index, false)
  const search = journalListingMeta({ base, query: 'سرور', categoryAsked: 'guides', category: guides })
  assert.deepEqual([search.index, search.canonical], [false, '/blog'], 'a search is never indexed, even inside a category')
})
