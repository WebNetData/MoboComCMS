const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript-api')

const cache = new Map()
function load(relative) {
  const file = path.resolve(__dirname, '..', relative.endsWith('.ts') ? relative : `${relative}.ts`)
  if (cache.has(file)) return cache.get(file).exports
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const mod = { exports: {} }
  cache.set(file, mod)
  const localRequire = (specifier) => (specifier.startsWith('@/') ? load(`src/${specifier.slice(2)}`) : require(specifier))
  new Function('require', 'module', 'exports', source)(localRequire, mod, mod.exports)
  return mod.exports
}

const p = load('src/modules/identity/domain/profile')
const c = load('src/modules/community/domain/community')

const rel = (patch = {}) => ({ self: false, staff: false, signedIn: true, following: false, followedBy: false, blocked: false, blockedBy: false, ...patch })

function loadService(mocks, relative = 'src/modules/identity/server/profile.ts', serviceCache = new Map()) {
  const file = path.resolve(__dirname, '..', relative)
  if (serviceCache.has(file)) return serviceCache.get(file).exports
  const mod = { exports: {} }; serviceCache.set(file, mod)
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const localRequire = name => {
    if (Object.hasOwn(mocks, name)) return mocks[name]
    if (name.startsWith('@/')) return loadService(mocks, `src/${name.slice(2)}.ts`, serviceCache)
    return require(name)
  }
  new Function('require', 'module', 'exports', source)(localRequire, mod, mod.exports)
  return mod.exports
}

test('follow lists enforce profile visibility before reading the social graph', async () => {
  for (const scenario of [
    { privacy: { profile: 'PRIVATE' }, viewer: null },
    { privacy: { profile: 'MEMBERS' }, viewer: null },
    { privacy: { profile: 'FOLLOWERS' }, viewer: 2 },
    { privacy: { showFollows: false }, viewer: 2 },
    { privacy: {}, viewer: 2, blockedBy: true },
  ]) {
    let reads = 0
    const service = loadService({
      '@/platform/database/prisma': { db: {
        userProfile: { findUnique: async () => ({ privacy: JSON.stringify(scenario.privacy), user: { status: 'ACTIVE' } }) },
        user: { findUnique: async () => ({ role: 'USER', status: 'ACTIVE' }) },
        userFollow: { count: async ({ where }) => {
          if (Object.keys(where).length === 2) return 0
          reads++; return 0
        }, findMany: async () => { reads++; return [] } },
        userBlock: { count: async ({ where }) => scenario.blockedBy && where.blockerId === 1 ? 1 : 0 },
      } },
      '@/modules/settings/server': {},
      '@/platform/http/rate-limit': {},
    })
    await assert.rejects(service.followList(1, 'following', scenario.viewer), error => error.status === 403)
    assert.equal(reads, 0, 'denied callers must not read follow-list rows')
  }
})

test('authorized follow lists filter blocked and inactive identities before pagination and counting', async () => {
  for (const scenario of [
    { privacy: {}, viewer: null },
    { privacy: { profile: 'PRIVATE', showFollows: false }, viewer: 1 },
    { privacy: { profile: 'MEMBERS' }, viewer: 2 },
    { privacy: { profile: 'FOLLOWERS' }, viewer: 2, following: true },
    { privacy: { profile: 'PRIVATE' }, viewer: 2, staff: true },
  ]) {
    const queries = []
    const counts = []
    const service = loadService({
      '@/platform/database/prisma': { db: {
        userProfile: { findUnique: async () => ({ privacy: JSON.stringify(scenario.privacy), user: { status: 'ACTIVE' } }) },
        user: { findUnique: async () => ({ role: scenario.staff ? 'ADMIN' : 'USER', status: 'ACTIVE' }) },
        userBlock: { count: async () => 0, findMany: async () => [{ blockerId: scenario.viewer, blockedId: 3 }, { blockerId: 4, blockedId: scenario.viewer }] },
        userFollow: {
          findMany: async args => { if ('skip' in args) queries.push(args); return [] },
          count: async ({ where }) => {
            if (Object.keys(where).length === 2 && typeof where.followerId === 'number' && typeof where.followingId === 'number') return scenario.following && where.followerId === 2 ? 1 : 0
            counts.push(where); return 0
          },
        },
      } },
      '@/modules/settings/server': {}, '@/platform/http/rate-limit': {},
    })
    for (const direction of ['followers', 'following']) {
      const result = await service.followList(1, direction, scenario.viewer, 2)
      assert.deepEqual(result, { total: 0, page: 2, pages: 1, people: [] })
      const query = queries.at(-1)
      const edge = direction === 'followers' ? 'follower' : 'following'
      assert.equal(query.skip, 30)
      assert.equal(query.take, 30)
      assert.deepEqual(query.where[`${edge}Id`], { notIn: scenario.viewer ? [3, 4] : [] })
      assert.deepEqual(query.where[edge], { status: 'ACTIVE' })
      assert.deepEqual(counts.at(-1), query.where)
    }
  }
})

test('people directory excludes both block directions in rows and totals', async () => {
  let rowsWhere, countWhere
  const service = loadService({
    '@/platform/database/prisma': { db: {
      userBlock: { findMany: async () => [{ blockerId: 1, blockedId: 2 }, { blockerId: 3, blockedId: 1 }] },
      userProfile: { findMany: async ({ where }) => { rowsWhere = where; return [] }, count: async ({ where }) => { countWhere = where; return 0 } },
      userFollow: { findMany: async () => [] },
    } },
    '@/modules/settings/server': {}, '@/platform/http/rate-limit': {},
  })
  const result = await service.peopleDirectory({}, 1)
  assert.equal(result.total, 0)
  assert.deepEqual(rowsWhere.userId, { notIn: [2, 3] })
  assert.deepEqual(countWhere, rowsWhere)
})

test('usernames and seeds', () => {
  assert.equal(p.normalizeUsername('@Ali_Rz'), 'ali_rz')
  assert.throws(() => p.normalizeUsername('ab'), /نام کاربری/)
  assert.throws(() => p.normalizeUsername('admin'), /رزرو/)
  assert.equal(p.usernameSeed({ email: 'me@x.com' }), 'meuser')
  assert.equal(p.usernameSeed({ email: '989121234567@phone.local', name: 'Sara K' }), 'sara_k')
  assert.equal(p.usernameSeed({ email: 'admin@x.com' }), 'admin_1')
})

test('social links belong to their network, https only, one each', () => {
  assert.deepEqual(p.normalizeLinks([{ kind: 'telegram', url: 't.me/ali' }, { kind: 'telegram', url: 'https://t.me/other' }]), [{ kind: 'telegram', url: 'https://t.me/ali' }])
  assert.throws(() => p.normalizeLinks([{ kind: 'instagram', url: 'https://evil.com/x' }]), /instagram/)
  assert.throws(() => p.normalizeLinks([{ kind: 'myspace', url: 'https://myspace.com' }]), /نامعتبر/)
  assert.equal(p.normalizeWebsite(''), '')
  assert.throws(() => p.normalizeWebsite('javascript:alert(1)'), /http/)
  assert.equal(p.mediaPath('/api/profile/media/12345678-1234-1234-1234-123456789012.png'), '/api/profile/media/12345678-1234-1234-1234-123456789012.png')
  assert.throws(() => p.mediaPath('https://x.y/a.png'), /تصویر/)
})

test('privacy decides who sees the profile and who may message', () => {
  const priv = (patch) => p.normalizePrivacy(patch)
  assert.equal(p.normalizePrivacy('garbage').profile, 'PUBLIC')
  assert.equal(p.canViewProfile(priv({ profile: 'PUBLIC' }), rel({ signedIn: false })), true)
  assert.equal(p.canViewProfile(priv({ profile: 'MEMBERS' }), rel({ signedIn: false })), false)
  assert.equal(p.canViewProfile(priv({ profile: 'FOLLOWERS' }), rel()), false)
  assert.equal(p.canViewProfile(priv({ profile: 'FOLLOWERS' }), rel({ following: true })), true)
  assert.equal(p.canViewProfile(priv({ profile: 'PRIVATE' }), rel({ following: true })), false)
  assert.equal(p.canViewProfile(priv({ profile: 'PRIVATE' }), rel({ staff: true })), true)
  assert.equal(p.canViewProfile(priv({}), rel({ blockedBy: true })), false)
  assert.equal(p.canMessage(priv({ messages: 'EVERYONE' }), rel()), true)
  assert.equal(p.canMessage(priv({ messages: 'EVERYONE' }), rel({ blocked: true })), false)
  assert.equal(p.canMessage(priv({ messages: 'FOLLOWING' }), rel()), false)
  assert.equal(p.canMessage(priv({ messages: 'FOLLOWING' }), rel({ followedBy: true })), true)
  assert.equal(p.canMessage(priv({ messages: 'NOBODY' }), rel({ staff: true })), true)
  assert.equal(p.canMessage(priv({}), rel({ self: true })), false)
  assert.equal(p.canFollow(rel({ blockedBy: true })), false)
})

test('post validation and settings', () => {
  const s = c.normalizeCommunitySettings({ 'posts.max-length': 50, 'posts.images': false })
  assert.equal(s.maxPostLength, 140)
  assert.equal(s.imagesEnabled, false)
  const d = c.DEFAULT_COMMUNITY_SETTINGS
  assert.deepEqual(c.validatePost({ content: '  سلام\n\n\n\nدنیا  ' }, d), { content: 'سلام\n\nدنیا', images: [], visibility: 'PUBLIC' })
  assert.throws(() => c.validatePost({ content: ' ' }, d), /متن یا تصویری/)
  assert.throws(() => c.validatePost({ content: 'x'.repeat(2001) }, d), /حداکثر/)
  assert.throws(() => c.validatePost({ content: 'x', images: ['/api/profile/media/12345678-1234-1234-1234-123456789012.png'] }, s), /تصویر/)
  assert.throws(() => c.normalizeImages(Array(5).fill(0).map((_, i) => `/api/profile/media/12345678-1234-1234-1234-12345678901${i}.png`)), /چهار/)
  assert.equal(c.validatePost({ content: 'x', visibility: 'FOLLOWERS' }, d).visibility, 'FOLLOWERS')
  assert.throws(() => c.validateComment('x'.repeat(1001)), /۱۰۰۰/)
})

test('rendering escapes HTML and links mentions, tags and URLs', () => {
  const html = c.renderBody('سلام @Ali و #بازی_خوب <b>x</b> https://ex.com/a?b=1.\nخط دوم email@x.com')
  assert.ok(!html.includes('<b>'))
  assert.ok(html.includes('&lt;b&gt;'))
  assert.ok(html.includes('href="/u/ali" class="cm-mention">@Ali<'))
  assert.ok(html.includes('class="cm-tag">#بازی_خوب<'))
  assert.ok(html.includes('href="https://ex.com/a?b=1"'))
  assert.ok(html.includes('<br>'))
  assert.ok(!html.includes('href="/u/x"'), 'emails are not mentions')
  assert.deepEqual(c.mentionsIn('@a @bob @bob x@carol'), ['bob'])
  assert.deepEqual(c.hashtagsIn('#یک #two #یک'), ['یک', 'two'])
  assert.equal(c.normalizeTag('#تست'), 'تست')
  assert.equal(c.normalizeTag('<x>'), '')
})

test('edit window, reasons, cursor and activity merge', () => {
  assert.equal(c.canEdit(new Date(Date.now() - 10 * 60_000)), true)
  assert.equal(c.canEdit(new Date(Date.now() - 31 * 60_000)), false)
  assert.equal(c.normalizeReason('spam'), 'SPAM')
  assert.throws(() => c.normalizeReason('x'), /دلیل/)
  assert.equal(c.parseCursor('nope'), null)
  const at = (m) => new Date(Date.UTC(2026, 0, 1, 0, m))
  const merged = c.mergeActivity([[{ key: 'a', at: at(1) }, { key: 'b', at: at(5) }], [{ key: 'a', at: at(1) }, { key: 'c', at: at(3) }]], 2)
  assert.deepEqual(merged.map((x) => x.key), ['b', 'c'])
})
