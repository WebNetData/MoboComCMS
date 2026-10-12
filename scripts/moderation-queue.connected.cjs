// Real PostgreSQL rows in every table the staff moderation overview reads. Each owner module's reader runs
// against them; the fixtures are dated years ago so they are the oldest waiting items whatever else the database holds.
const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript'), { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient(), seed = `modq-${Date.now()}`
const compile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
const real = {}
function load(file, extra = {}) {
  // Only the database and the pure text helpers are real; nothing else of a module is needed to read its waiting items.
  const stub = new Proxy({}, { get: (_, key) => key === '__esModule' ? false : () => { throw new Error(`test double called: ${String(key)}`) } })
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', compile(file))(name => name === '@/platform/database/prisma' ? { db: prisma } : Object.hasOwn(extra, name) ? extra[name] : Object.hasOwn(real, name) ? real[name] : name.startsWith('@/') || name.startsWith('.') ? stub : require(name), mod, mod.exports)
  return mod.exports
}
real['@/shared/text/plain'] = load('src/shared/text/plain.ts')
real['@/modules/forum/domain/markdown'] = load('src/modules/forum/domain/markdown.ts')
const old = n => new Date(Date.UTC(2001, 0, n))

async function main() {
  const forum = load('src/modules/forum/server/moderation.ts'), journal = load('src/modules/journal/server/admin.ts'), community = load('src/modules/community/server/admin.ts')
  const reviews = load('src/modules/reviews/server/reviews.ts', { '@/modules/content/server/registry': { itemCards: async refs => new Map(refs.map(ref => [`${ref.type}:${ref.id}`, { title: `item ${ref.id}` }])), itemCard: async () => null } })
  const store = load('src/modules/store/server/admin.ts'), copyright = load('src/modules/copyright/server/copyright.ts')
  const before = { forum: await forum.waitingForModeration(1), journal: await journal.waitingForModeration(1), community: await community.waitingForModeration(1), reviews: await reviews.waitingForModeration(1), store: await store.waitingForModeration(1), copyright: await copyright.waitingForModeration(1) }

  const [author, reporter] = await Promise.all(['author', 'reporter'].map(name => prisma.user.create({ data: { email: `${seed}-${name}@example.invalid`, passwordHash: 'test-only', name: `${seed} ${name}` } })))
  const category = await prisma.forumCategory.create({ data: { slug: seed, title: seed } })
  const thread = await prisma.forumThread.create({ data: { categoryId: category.id, userId: author.id, title: `${seed} topic` } })
  // Three held posts (out of order), one visible one; two flags waiting and one already settled.
  const posts = []
  for (const [n, status] of [[3, 'PENDING'], [1, 'PENDING'], [2, 'PENDING'], [1, 'VISIBLE']]) posts.push(await prisma.forumPost.create({ data: { threadId: thread.id, userId: author.id, content: `**held** post ${n} ${'x'.repeat(300)}`, status, createdAt: old(n) } }))
  await prisma.forumFlag.createMany({ data: [
    { postId: posts[3].id, userId: reporter.id, reason: 'SPAM', note: '<b>looks</b> like an advert', status: 'PENDING', createdAt: old(2) },
    { postId: posts[3].id, userId: author.id, reason: 'OTHER', note: '', status: 'PENDING', createdAt: old(1) },
    { postId: posts[0].id, userId: reporter.id, reason: 'OTHER', note: 'settled', status: 'AGREED', createdAt: old(1) },
  ] })
  const article = await prisma.post.create({ data: { slug: seed, title: `${seed} article`, content: 'text' } })
  await prisma.postComment.createMany({ data: [
    { postId: article.id, userId: author.id, body: 'second <script>x</script>comment', status: 'PENDING', createdAt: old(2) },
    { postId: article.id, userId: author.id, body: 'first comment', status: 'PENDING', createdAt: old(1) },
    { postId: article.id, userId: author.id, body: 'published', status: 'APPROVED', createdAt: old(1) },
    { postId: article.id, userId: author.id, body: '', status: 'DELETED', createdAt: old(1) },
  ] })
  const social = await prisma.communityPost.create({ data: { authorId: author.id, content: `${seed} social post` } })
  await prisma.communityReport.createMany({ data: [
    { postId: social.id, reporterId: reporter.id, reason: 'SPAM', note: '', status: 'OPEN', createdAt: old(1) },
    { postId: social.id, reporterId: author.id, reason: 'ABUSE', note: 'closed already', status: 'RESOLVED', createdAt: old(1) },
  ] })
  await prisma.itemReview.createMany({ data: [
    { itemType: 'game', itemId: 987_654_001, userId: author.id, rating: 4, body: 'waiting review', status: 'PENDING', createdAt: old(1) },
    { itemType: 'game', itemId: 987_654_002, userId: author.id, rating: 5, body: 'published review', status: 'APPROVED', createdAt: old(1) },
  ] })
  const product = await prisma.product.create({ data: { slug: seed, name: `${seed} product` } })
  await prisma.productReview.createMany({ data: [
    { productId: product.id, userId: author.id, rating: 3, title: 'title', body: 'waiting product review', status: 'PENDING', createdAt: old(1) },
    { productId: product.id, userId: reporter.id, rating: 3, body: 'published', status: 'APPROVED', createdAt: old(1) },
  ] })
  await prisma.productQuestion.createMany({ data: [
    { productId: product.id, userId: null, guestName: 'a guest', body: 'does it fit?', status: 'PENDING', createdAt: old(1) },
    { productId: product.id, userId: author.id, body: 'answered', answer: 'yes', status: 'APPROVED', createdAt: old(1) },
  ] })
  const report = n => ({ code: `${seed}-${n}`, name: 'Owner', email: 'owner@example.invalid', organization: n === 1 ? 'Studio' : '', workTitle: `work ${n}`, infringingUrls: 'https://example.invalid/x', description: 'd', signature: 's', createdAt: old(n) })
  await prisma.copyrightReport.createMany({ data: [{ ...report(2), status: 'REVIEWING' }, { ...report(1), status: 'NEW' }, { ...report(3), status: 'REJECTED' }] })

  // ---- forum
  const f = await forum.waitingForModeration(2)
  assert.equal(f.posts.count, before.forum.posts.count + 3)
  assert.deepEqual(f.posts.items.map(item => item.at.toISOString()), [old(1), old(2)].map(d => d.toISOString()), 'oldest first, limited')
  assert.deepEqual([f.posts.items[0].by, f.posts.items[0].about], [`${seed} author`, `${seed} topic`])
  assert.ok(f.posts.items[0].text.startsWith('held post 1') && f.posts.items[0].text.length <= 161, 'markdown is reduced to a short plain excerpt')
  assert.ok(f.posts.items[0].full.startsWith('held post 1') && f.posts.items[0].full.endsWith('x'.repeat(50)) && f.posts.items[0].full.length > 300, 'the whole text comes along for the decision')
  assert.equal(f.flags.count, before.forum.flags.count + 2)
  assert.deepEqual(f.flags.items.map(item => item.by), [`${seed} author`, `${seed} reporter`])
  assert.ok(f.flags.items[0].text.startsWith('held post 1'), 'a flag without a note shows what was flagged')
  assert.equal(f.flags.items[1].text, 'looks like an advert')
  // ---- article comments
  const j = await journal.waitingForModeration(5)
  assert.equal(j.count, before.journal.count + 2)
  assert.deepEqual(j.items.slice(0, 2).map(item => [item.text, item.about]), [['first comment', `${seed} article`], ['second comment', `${seed} article`]])
  assert.deepEqual(j.items.slice(0, 2).map(item => item.full), ['first comment', 'second comment'], 'plain text only')
  // ---- community
  const c = await community.waitingForModeration(5)
  assert.equal(c.count, before.community.count + 1)
  assert.deepEqual([c.items[0].text, c.items[0].by, c.items[0].about], ['SPAM', `${seed} reporter`, `${seed} social post`])
  // ---- content reviews
  const r = await reviews.waitingForModeration(5)
  assert.equal(r.count, before.reviews.count + 1)
  assert.deepEqual([r.items[0].text, r.items[0].about], ['waiting review', 'item 987654001'])
  // ---- store
  const s = await store.waitingForModeration(5)
  assert.deepEqual([s.reviews.count, s.questions.count], [before.store.reviews.count + 1, before.store.questions.count + 1])
  assert.deepEqual([s.reviews.items[0].text, s.reviews.items[0].about], ['waiting product review', `${seed} product`])
  assert.equal(s.reviews.items[0].full, 'title — waiting product review')
  assert.deepEqual([s.questions.items[0].text, s.questions.items[0].by], ['does it fit?', 'a guest'])
  // ---- copyright
  const k = await copyright.waitingForModeration(5)
  assert.equal(k.count, before.copyright.count + 2)
  assert.deepEqual(k.items.slice(0, 2).map(item => [item.text, item.by]), [['work 1', 'Studio'], ['work 2', 'Owner']])
  console.log('PostgreSQL moderation overview: every owner module reports its waiting items oldest first, with counts, and leaves out what is already decided passed')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  try {
    const ids = (await prisma.user.findMany({ where: { email: { startsWith: seed } }, select: { id: true } })).map(row => row.id)
    await prisma.copyrightReport.deleteMany({ where: { code: { startsWith: seed } } })
    await prisma.productQuestion.deleteMany({ where: { product: { slug: seed } } }); await prisma.productReview.deleteMany({ where: { product: { slug: seed } } }); await prisma.product.deleteMany({ where: { slug: seed } })
    await prisma.itemReview.deleteMany({ where: { userId: { in: ids } } })
    await prisma.communityReport.deleteMany({ where: { reporterId: { in: ids } } }); await prisma.communityPost.deleteMany({ where: { authorId: { in: ids } } })
    await prisma.postComment.deleteMany({ where: { userId: { in: ids } } }); await prisma.post.deleteMany({ where: { slug: seed } })
    await prisma.forumCategory.deleteMany({ where: { slug: seed } })
    await prisma.user.deleteMany({ where: { id: { in: ids } } })
  } finally { await prisma.$disconnect() }
})
