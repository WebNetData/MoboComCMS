const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

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
