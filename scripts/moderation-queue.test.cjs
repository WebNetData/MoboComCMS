const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
function load(relative, mocks = {}) {
  const source = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', source)((specifier) => Object.hasOwn(mocks, specifier) ? mocks[specifier] : require(specifier), mod, mod.exports)
  return mod.exports
}
const domain = load('src/modules/moderation/domain/queue.ts')
const manifest = (id) => JSON.parse(fs.readFileSync(path.join(root, 'src/plugins', id, 'manifest.json'), 'utf8'))

test('every source belongs to a real module and leads to that module\'s own admin page', () => {
  assert.equal(new Set(domain.QUEUE_SOURCES.map((source) => source.key)).size, domain.QUEUE_SOURCES.length)
  for (const source of domain.QUEUE_SOURCES) {
    const owner = manifest(source.module)
    assert.equal(owner.kind, 'module', source.key)
    const page = source.href.split('?')[0]
    assert.ok((owner.adminPaths || []).some((prefix) => page === prefix || page.startsWith(`${prefix}/`)), `${source.key}: ${page} is not an admin path of ${source.module}`)
    assert.ok(fs.existsSync(path.join(root, 'src/app', page, 'page.tsx')), `${source.key}: ${page} has no page`)
    assert.ok(source.permissions.length > 0 && source.label && source.labelEn)
    for (const permission of source.permissions) assert.ok(domain.QUEUE_PERMISSIONS.includes(permission))
  }
})

test('a staff member gets only the sources of modules that are on and that they may moderate', () => {
  const keys = (states, permissions) => domain.visibleSources(states, (permission) => permissions === null || permissions.includes(permission)).map((source) => source.key)
  assert.equal(keys({}, null).length, domain.QUEUE_SOURCES.length, 'the unrestricted administrator sees everything')
  assert.deepEqual(keys({}, ['forum.moderate']), ['forum-posts', 'forum-flags'])
  assert.deepEqual(keys({}, ['cms.posts']), ['article-comments', 'item-reviews'])
  assert.deepEqual(keys({}, ['cms.products']), ['product-reviews', 'product-questions'])
  assert.deepEqual(keys({}, ['tickets.handle', 'orders.manage']), [])
  assert.deepEqual(keys({ forum: false, store: false }, null), ['article-comments', 'item-reviews', 'community-reports', 'copyright'])
})

test('sources with the longest wait come first and the wait is graded', () => {
  const group = (key, count, oldestAt) => ({ key, label: key, labelEn: key, href: '/admin', count, oldestAt, items: [] })
  const ordered = domain.orderGroups([group('a', 0, null), group('b', 2, '2026-10-05T00:00:00.000Z'), group('c', 0, null), group('d', 9, '2026-10-01T00:00:00.000Z')])
  assert.deepEqual(ordered.map((item) => item.key), ['d', 'b', 'a', 'c'])
  const now = new Date('2026-10-06T12:00:00.000Z')
  assert.equal(domain.waitingTone(null, now), 'none')
  assert.equal(domain.waitingTone('2026-10-06T00:00:00.000Z', now), 'ok')
  assert.equal(domain.waitingTone('2026-10-05T12:00:00.000Z', now), 'warn')
  assert.equal(domain.waitingTone('2026-10-03T12:00:00.000Z', now), 'late')
})

test('the overview asks only the modules it may show and one failing module does not hide the others', async () => {
  const calls = []
  const at = (day) => new Date(`2026-10-0${day}T00:00:00.000Z`)
  const waiting = (count, day) => ({ count, items: count ? [{ id: day, text: 'text', by: 'member', about: 'about', at: at(day) }] : [] })
  const owner = (name, result) => ({ waitingForModeration: async (take) => { calls.push([name, take]); if (result instanceof Error) throw result; return result } })
  const queue = load('src/modules/moderation/server/queue.ts', {
    '@/modules/moderation/domain/queue': domain,
    '@/modules/forum/server/moderation': owner('forum', { posts: waiting(3, 4), flags: waiting(0, 0) }),
    '@/modules/journal/server/admin': owner('journal', waiting(7, 2)),
    '@/modules/reviews/server/reviews': owner('reviews', new Error('database down')),
    '@/modules/store/server/admin': owner('store', { reviews: waiting(1, 5), questions: waiting(2, 3) }),
    '@/modules/community/server/admin': owner('community', waiting(0, 0)),
    '@/modules/copyright/server/copyright': owner('copyright', waiting(1, 1)),
  })
  const all = await queue.moderationQueue({}, () => true)
  assert.deepEqual(calls.map(([name]) => name).sort(), ['community', 'copyright', 'forum', 'journal', 'reviews', 'store'])
  assert.ok(calls.every(([, take]) => take === 5))
  assert.deepEqual(all.failed, ['item-reviews'])
  assert.equal(all.total, 14)
  assert.deepEqual(all.groups.map((group) => [group.key, group.count]), [['copyright', 1], ['article-comments', 7], ['product-questions', 2], ['forum-posts', 3], ['product-reviews', 1], ['forum-flags', 0], ['community-reports', 0]])
  assert.equal(all.groups[0].oldestAt, '2026-10-01T00:00:00.000Z')
  assert.equal(typeof all.groups[0].items[0].at, 'string')

  calls.length = 0
  const forumOnly = await queue.moderationQueue({ store: false }, (permission) => permission === 'forum.moderate' || permission === 'cms.products')
  assert.deepEqual(calls.map(([name]) => name), ['forum'], 'no module is read for a source that will not be shown')
  assert.deepEqual(forumOnly.groups.map((group) => group.key), ['forum-posts', 'forum-flags'])
})

test('the admin menu offers the page to everyone who can moderate something', () => {
  const layout = fs.readFileSync(path.join(root, 'src/app/admin/layout.tsx'), 'utf8')
  assert.match(layout, /href: '\/admin\/moderation'[^\n]*perm: \[\.\.\.QUEUE_PERMISSIONS\]/)
})
