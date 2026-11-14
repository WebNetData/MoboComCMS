// Run against a disposable PostgreSQL database: node scripts/content-publication.connected.cjs
const assert = require('node:assert/strict'), { PrismaClient } = require('@prisma/client'), { NextRequest } = require('next/server')
assert(/test|check/i.test(new URL(process.env.DATABASE_URL).pathname), 'Disposable PostgreSQL required')
const db = new PrismaClient(), stamp = `publication-${Date.now()}`, ids = { users: [], roles: [], games: [], products: [], posts: [] }
let viewer = null
const load = require('./connected-source-loader.cjs')({
  '@/platform/database/prisma': { db },
  react: { ...require('react'), cache: fn => fn },
  'next-auth/jwt': { getToken: async () => viewer ? { uid: String(viewer.id), authAt: Date.now() } : null },
  '@/extensions/server/modules': { isModuleEnabled: async () => true, moduleGuard: async () => null },
  '@/extensions/server/runtime': { emitExtensionEvent: async () => {} },
  '@/modules/content/server/events': { MEDIA_RESOURCE_TYPE: { games: 'game', software: 'software', 'cinema-titles': 'cinema', 'music-tracks': 'track', 'music-albums': 'album' }, contentChanged: () => {} },
})
const media = load('src/modules/media/server/admin.ts')
const gameAdmin = load('src/modules/games/server/admin.ts')
const catalog = load('src/modules/catalog/server/create.ts')
const journal = load('src/modules/journal/server/create.ts')
const request = (url, method, body) => new NextRequest(`http://localhost${url}`, { method, headers: { Origin: 'http://localhost', Host: 'localhost', 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })

async function main() {
  const role = await db.role.create({ data: { name: stamp, permissions: 'games.manage' } }); ids.roles.push(role.id)
  const user = await db.user.create({ data: { email: `${stamp}@test.invalid`, passwordHash: 'test-only', name: stamp, role: 'ADMIN', roleId: role.id, totpEnabledAt: new Date() } }); ids.users.push(user.id); viewer = user

  const game = await db.gameTitle.create({ data: { slug: stamp, title: 'Incomplete game', status: 'DRAFT', platforms: 'PC' } }); ids.games.push(game.id)
  const one = await media.PATCH(request('/api/admin/cms/media?type=games', 'PATCH', { id: game.id, status: 'PUBLISHED' }))
  assert.equal(one.status, 400, 'single-item publication rejects missing essentials')
  assert.match((await one.json()).error, /جلد بازی|معرفی کوتاه|سیستم موردنیاز/)
  assert.equal((await db.gameTitle.findUniqueOrThrow({ where: { id: game.id } })).status, 'DRAFT', 'failed publish leaves the stored status unchanged')

  const bulk = await media.BULK(request('/api/admin/cms/media?type=games', 'POST', { ids: [game.id], action: 'publish' }))
  assert.equal(bulk.status, 200)
  const result = await bulk.json()
  assert.equal(result.changed, 0)
  assert.match(result.failed.find(row => row.id === game.id).reason, /جلد بازی/)
  assert.equal((await db.gameTitle.findUniqueOrThrow({ where: { id: game.id } })).status, 'DRAFT', 'failed bulk publish preserves the draft')

  const completed = await media.PATCH(request('/api/admin/cms/media?type=games', 'PATCH', { id: game.id, status: 'PUBLISHED', cover: 'https://assets.test.invalid/game.webp', summary: 'A sufficiently clear introduction to this game.', platforms: 'PC', requirements: { min: { os: 'Windows', cpu: 'Example CPU', memory: '8 GB' } }, links: [{ url: 'https://downloads.test.invalid/game.zip', label: 'Download', kind: 'DOWNLOAD' }] }))
  assert.equal(completed.status, 200, await completed.clone().text())
  assert.equal((await db.gameTitle.findUniqueOrThrow({ where: { id: game.id } })).status, 'PUBLISHED', 'the same owner publishes after the blocking fields are fixed')

  const dedicated = await db.gameTitle.create({ data: { slug: `${stamp}-dedicated`, title: 'Dedicated bulk incomplete game', status: 'DRAFT', platforms: 'PC' } }); ids.games.push(dedicated.id)
  const blocked = await gameAdmin.bulkGames({ ids: [dedicated.id], action: 'publish' }, { authorId: null }, user.id)
  assert.equal(blocked.changed, 0, 'dedicated game batch refuses a game with missing essentials')
  assert.match(blocked.failed[0].reason, /جلد بازی|معرفی کوتاه|سیستم موردنیاز/)
  assert.equal((await db.gameTitle.findUniqueOrThrow({ where: { id: dedicated.id } })).status, 'DRAFT', 'dedicated batch keeps blocked game a draft')
  await db.gameTitle.update({ where: { id: dedicated.id }, data: { cover: 'https://assets.test.invalid/dedicated.webp', summary: 'A sufficiently clear introduction to the dedicated game.', platforms: 'PC', requirements: JSON.stringify({ min: { os: 'Windows', cpu: 'Example CPU', memory: '8 GB' } }) } })
  await db.mediaLink.create({ data: { ownerType: 'game', ownerId: dedicated.id, label: 'Download', kind: 'DOWNLOAD', url: 'https://downloads.test.invalid/dedicated.zip' } })
  const published = await gameAdmin.bulkGames({ ids: [dedicated.id], action: 'publish' }, { authorId: null }, user.id)
  assert.equal(published.changed, 1, 'dedicated game batch publishes after essentials are present')
  assert.equal((await db.gameTitle.findUniqueOrThrow({ where: { id: dedicated.id } })).status, 'PUBLISHED')

  const beforeProducts = await db.product.count({ where: { slug: `${stamp}-missing-photo` } })
  await assert.rejects(catalog.createCatalogProduct({ slug: `${stamp}-missing-photo`, name: 'Missing photo fixture', kind: 'PHYSICAL', currency: 'IRT', price: 100, stock: 0, active: true }, { id: user.id, email: user.email }), /photo/)
  assert.equal(await db.product.count({ where: { slug: `${stamp}-missing-photo` } }), beforeProducts, 'failed Store create rolls back the product')

  const beforePosts = await db.post.count({ where: { slug: `${stamp}-missing-cover` } })
  await assert.rejects(journal.createJournalPost({}, { slug: `${stamp}-missing-cover`, title: 'Incomplete article', status: 'PUBLISHED', cover: '', excerpt: '', content: 'short' }, { id: user.id, email: user.email }), /cover|excerpt|category|short/)
  assert.equal(await db.post.count({ where: { slug: `${stamp}-missing-cover` } }), beforePosts, 'failed Magazine create rolls back the article')

  console.log('Content publication PostgreSQL passed: shared media single/bulk gates, dedicated Games bulk gate and publish, issue details, draft preservation, Store quality rollback, Magazine quality rollback')
}

main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  if (ids.games.length) await db.mediaLink.deleteMany({ where: { ownerType: 'game', ownerId: { in: ids.games } } })
  if (ids.games.length) await db.gameTitle.deleteMany({ where: { id: { in: ids.games } } })
  if (ids.posts.length) await db.post.deleteMany({ where: { id: { in: ids.posts } } })
  if (ids.games.length) await db.gameTitle.deleteMany({ where: { id: { in: ids.games } } })
  if (ids.products.length) await db.product.deleteMany({ where: { id: { in: ids.products } } })
  if (ids.users.length) await db.auditLog.deleteMany({ where: { actorUserId: { in: ids.users } } })
  if (ids.users.length) await db.user.deleteMany({ where: { id: { in: ids.users } } })
  if (ids.roles.length) await db.role.deleteMany({ where: { id: { in: ids.roles } } })
  await db.$disconnect()
})
