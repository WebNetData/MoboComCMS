// Real PostgreSQL game, series, updates, episodes, articles and forum topics through the public timeline of
// an item. Only this script's rows are created and removed.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript'), { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient(), seed = `itime${Date.now()}`
const state = { off: new Set() }
const cache = new Map()
function load(file) {
  const full = path.resolve(file.endsWith('.ts') || file.endsWith('.tsx') ? file : fs.existsSync(`${file}.ts`) ? `${file}.ts` : fs.existsSync(`${file}.tsx`) ? `${file}.tsx` : path.join(file, 'index.ts'))
  if (cache.has(full)) return cache.get(full).exports
  const mod = { exports: {} }; cache.set(full, mod)
  const source = ts.transpileModule(fs.readFileSync(full, 'utf8'), { fileName: full, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText
  new Function('require', 'module', 'exports', source)(name => {
    if (name === '@/platform/database/prisma') return { db: prisma }
    if (name === '@/platform/observability/logger') return { logEvent: () => {} }
    if (name === '@/extensions/server/modules') return { isModuleEnabled: async id => !state.off.has(id), getModuleSettings: async () => ({}), getModuleStates: async () => ({}) }
    if (name === '@/modules/membership/server/membership') return { getViewer: async () => null, isMember: async () => false }
    if (name === '@/modules/notifications/server/inbox') return { createInboxEvent: async () => {} }
    if (name === 'react') return { ...require('react'), cache: fn => fn }
    if (name.endsWith('.json')) return JSON.parse(fs.readFileSync(name.startsWith('@/') ? `src/${name.slice(2)}` : path.join(path.dirname(full), name), 'utf8'))
    if (name.startsWith('@/')) return load(`src/${name.slice(2)}`)
    if (name.startsWith('.')) return load(path.join(path.dirname(full), name))
    return require(name)
  }, mod, mod.exports)
  return mod.exports
}
const { itemTimeline } = load('src/modules/content/server/timeline.ts'), rules = load('src/modules/content/domain/timeline.ts')
const NOW = new Date(), ago = days => new Date(NOW.getTime() - days * 86_400_000)

async function main() {
  const user = await prisma.user.create({ data: { email: `${seed}@example.invalid`, passwordHash: 'test-only' } })
  const game = await prisma.gameTitle.create({ data: { slug: `${seed}-game`, title: `${seed} game`, status: 'PUBLISHED', publishedAt: ago(30) } })
  const draft = await prisma.gameTitle.create({ data: { slug: `${seed}-draft`, title: `${seed} draft`, status: 'DRAFT' } })
  await prisma.gameUpdate.createMany({ data: [{ gameId: game.id, title: 'patch one', version: '1.1', releasedAt: ago(20) }, { gameId: game.id, title: 'patch two', version: '1.2', releasedAt: ago(5) }, { gameId: game.id, title: 'not out yet', version: '2.0', releasedAt: ago(-5) }] })
  const post = (name, data) => prisma.post.create({ data: { slug: `${seed}-${name}`, title: `${seed} ${name}`, content: 'x', status: 'PUBLISHED', publishedAt: ago(10), itemLinks: { create: [{ itemType: 'game', itemId: game.id }] }, ...data } })
  await post('review', {}); await post('unpublished', { status: 'DRAFT' }); await post('scheduled', { publishedAt: ago(-3) })
  const group = await prisma.forumGroup.create({ data: { slug: seed, name: seed } })
  const forum = (name, data = {}) => prisma.forumCategory.create({ data: { slug: `${seed}-${name}`, title: `${seed} ${name}`, sortOrder: 9600, ...data } })
  const open = await forum('open'), closed = await forum('closed', { permissions: { create: [{ groupId: group.id, level: 'CREATE' }] } })
  const topic = (cat, name, data = {}) => prisma.forumThread.create({ data: { categoryId: cat.id, userId: user.id, title: `${seed} ${name}`, itemType: 'game', itemId: game.id, createdAt: ago(8), ...data } })
  await topic(open, 'question'); await topic(closed, 'private talk'); await topic(open, 'hidden', { status: 'HIDDEN' }); await topic(open, 'unlisted', { listed: false })
  await prisma.forumThread.create({ data: { categoryId: open.id, userId: user.id, title: `${seed} about another game`, itemType: 'game', itemId: draft.id, createdAt: ago(8) } })

  // ---- a game: only what a visitor could already see, newest first, nothing from the future
  const seen = await itemTimeline({ type: 'game', id: game.id }, NOW)
  const names = result => result.events.map(event => [event.kind, event.title.replace(`${seed} `, ''), event.detail])
  assert.deepEqual([seen.item.title, names(seen)], [`${seed} game`, [['release', 'patch two', '1.2'], ['topic', 'question', ''], ['article', 'review', ''], ['release', 'patch one', '1.1'], ['published', 'game', '']]], 'no update that is not out, no draft or scheduled article, no topic of a group\'s forum, hidden or unlisted')
  assert.deepEqual(seen.events.map(event => event.href.replace(/\d+$/, 'N')).filter(href => href.startsWith('/forum') || href.startsWith('/blog')), ['/forum/t/N', `/blog/${seed}-review`])
  assert.ok(!JSON.stringify(seen).includes(user.email) && !/edited|restored|approved|admin/i.test(JSON.stringify(seen)), 'nothing of who did what in the admin panel')
  assert.equal(await itemTimeline({ type: 'game', id: draft.id }, NOW), null, 'an item that is not public has no timeline')

  // ---- a module that is off contributes nothing
  state.off.add('forum'); state.off.add('journal')
  assert.deepEqual(names(await itemTimeline({ type: 'game', id: game.id }, NOW)).map(row => row[0]), ['release', 'release', 'published'])
  state.off.clear()

  // ---- a series: its episodes as they air, and its release day
  const series = await prisma.cinemaTitle.create({ data: { slug: `${seed}-series`, title: `${seed} series`, kind: 'SERIES', status: 'PUBLISHED', publishedAt: ago(40), releaseDate: ago(39), seasons: { create: [{ number: 2, episodes: { create: [{ number: 1, title: 'aired', airDate: ago(3) }, { number: 2, title: 'next week', airDate: ago(-7) }, { number: 3, title: 'no date' }] } }] } } })
  assert.deepEqual(names(await itemTimeline({ type: 'title', id: series.id }, NOW)), [['episode', 'aired', 'S02E01'], ['premiere', 'series', ''], ['published', 'series', '']])

  // ---- the ordering rule itself
  const e = (kind, days, title = kind) => ({ kind, at: ago(days).toISOString(), title, href: '/x', detail: '' })
  assert.deepEqual(rules.orderTimeline([e('article', 2), e('release', 1), e('release', 1), e('topic', -1), { ...e('published', 3), at: 'nonsense' }], NOW).map(event => event.kind), ['release', 'article'], 'each event once, nothing dated in the future or not dated at all')
  assert.equal(rules.orderTimeline(Array.from({ length: 80 }, (_, n) => e('release', n + 1, `r${n}`)), NOW).length, rules.TIMELINE_LIMIT)
  console.log('PostgreSQL item timeline: public facts only (releases out, episodes aired, published articles, topics a visitor may read), newest first, nothing from the admin side, modules off, and the limit passed')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  try {
    await prisma.forumCategory.deleteMany({ where: { slug: { startsWith: seed } } }); await prisma.forumGroup.deleteMany({ where: { slug: seed } })
    await prisma.post.deleteMany({ where: { slug: { startsWith: seed } } }); await prisma.gameTitle.deleteMany({ where: { slug: { startsWith: seed } } })
    await prisma.cinemaTitle.deleteMany({ where: { slug: { startsWith: seed } } }); await prisma.user.deleteMany({ where: { email: { startsWith: seed } } })
  } finally { await prisma.$disconnect() }
})
