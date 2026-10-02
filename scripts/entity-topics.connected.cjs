// Local PostgreSQL + port 3000: node --env-file=.env scripts/entity-topics.connected.cjs
const assert = require('node:assert/strict')
const { PrismaClient } = require('@prisma/client')
const { encode } = require('next-auth/jwt')

process.env.DATABASE_URL = process.env.MOBOCOM_CONNECTED_DATABASE_URL || 'postgresql://mobocom:mobocom-local@127.0.0.1:5435/mobocom?schema=public'
const db = new PrismaClient()
const seed = `codex-entity-topics-${Date.now()}`
const ids = { studio: 0, game: 0, software: 0, draft: 0, publicCategory: 0, privateCategory: 0, threads: [] }

async function main() {
  const admin = await db.user.findUniqueOrThrow({ where: { email: process.env.ADMIN_EMAIL } })
  const token = await encode({ token: { uid: String(admin.id), sub: String(admin.id), email: admin.email, name: admin.name, role: admin.role, roleId: admin.roleId, authAt: Date.now() }, secret: process.env.NEXTAUTH_SECRET, maxAge: 3600 })
  const cookie = `next-auth.session-token=${token}`
  const request = (method, route, body) => fetch(`http://127.0.0.1:3000${route}`, { method, headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(45_000) })
  const page = async (route) => (await (await request('GET', route)).text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  const studio = await db.studio.create({ data: { name: seed, normalizedName: seed } })
  ids.studio = studio.id
  const yesterday = new Date(Date.now() - 86_400_000)
  ids.game = (await db.gameTitle.create({ data: { slug: `${seed}-game`, title: 'Entity forum game', developer: seed, developerStudioId: studio.id, publishedAt: yesterday } })).id
  ids.software = (await db.softwareTitle.create({ data: { slug: `${seed}-software`, title: 'Entity forum software', developer: seed, developerStudioId: studio.id, publishedAt: yesterday } })).id
  ids.draft = (await db.gameTitle.create({ data: { slug: `${seed}-draft`, title: 'Hidden forum game', status: 'DRAFT', publishedAt: yesterday } })).id
  ids.publicCategory = (await db.forumCategory.create({ data: { slug: `${seed}-public`, title: 'Public entity test' } })).id
  ids.privateCategory = (await db.forumCategory.create({ data: { slug: `${seed}-private`, title: 'Private entity test', access: 'MEMBERS' } })).id
  const newPage = await page(`/forum/new?item=game:${ids.game}&kind=question`)
  assert.ok(newPage.includes('پرسش تازه') && newPage.includes('Entity forum game'), 'composer preserves entity and question context')
  const create = async (item, kind, categoryId = ids.publicCategory, title = `Connected ${kind} ${item}`) => {
    const response = await request('POST', '/api/forum/threads', { item, kind, categoryId, title, content: 'This is a connected entity topic.' })
    const body = await response.json()
    return { status: response.status, body }
  }
  const hidden = await create(`game:${ids.draft}`, 'QUESTION')
  assert.equal(hidden.status, 404, 'draft entity cannot receive a topic')
  const privateTopic = await create(`game:${ids.game}`, 'QUESTION', ids.privateCategory)
  assert.equal(privateTopic.status, 422, 'entity topic cannot be created in private category')
  const question = await create(`game:${ids.game}`, 'QUESTION')
  assert.equal(question.status, 201, JSON.stringify(question.body))
  ids.threads.push(question.body.id)
  assert.equal(question.body.pending, false, 'staff topic is public')
  const softwareDiscussion = await create(`software:${ids.software}`, 'DISCUSSION')
  assert.equal(softwareDiscussion.status, 201, JSON.stringify(softwareDiscussion.body))
  ids.threads.push(softwareDiscussion.body.id)
  const studioQuestion = await create(`studio:${ids.studio}`, 'QUESTION')
  assert.equal(studioQuestion.status, 201, JSON.stringify(studioQuestion.body))
  ids.threads.push(studioQuestion.body.id)
  assert.ok((await page(`/games/${seed}-game`)).includes(`/forum/t/${question.body.id}`), 'game links to its public question')
  assert.ok((await page(`/software/${seed}-software`)).includes(`/forum/t/${softwareDiscussion.body.id}`), 'software links to its discussion')
  assert.ok((await page(`/studios/${ids.studio}`)).includes(`/forum/t/${studioQuestion.body.id}`), 'studio links to its question')
  assert.ok((await page(`/forum/t/${question.body.id}`)).includes(`/games/${seed}-game`), 'forum topic links back to the entity')
  await db.forumThread.update({ where: { id: question.body.id }, data: { listed: false } })
  assert.ok(!(await page(`/games/${seed}-game`)).includes(`/forum/t/${question.body.id}`), 'unlisted topic does not enter public entity preview')
  await db.forumThread.update({ where: { id: question.body.id }, data: { listed: true } })
  const bulk = await db.forumThread.createManyAndReturn({ data: Array.from({ length: 21 }, (_, index) => ({ categoryId: ids.publicCategory, userId: admin.id, title: `${seed} question ${index}`, itemType: 'game', itemId: ids.game, kind: 'QUESTION', status: 'VISIBLE', listed: true, postCount: 1 })) })
  ids.threads.push(...bulk.map((row) => row.id))
  const archive1 = await page(`/forum/related/game/${ids.game}?kind=question`)
  const archive2 = await page(`/forum/related/game/${ids.game}?kind=question&page=2`)
  assert.ok(archive1.includes('صفحهٔ بعد') && archive2.includes('صفحهٔ قبل'), 'related archive paginates at 20')
  assert.ok(archive2.includes(`question 0`) || archive2.includes(`/forum/t/${question.body.id}`), 'older topics remain reachable')
  await db.gameTitle.update({ where: { id: ids.game }, data: { status: 'DRAFT' } })
  assert.equal((await request('GET', `/forum/related/game/${ids.game}`)).status, 404, 'archive closes when the entity becomes draft')
  console.log('Entity topics PostgreSQL: composer, public scope, draft/private gates, three hubs, backlinks, hidden topics and 20-item archive OK')
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(async () => {
  if (ids.threads.length) {
    await db.searchDocument.deleteMany({ where: { itemType: 'thread', itemId: { in: ids.threads } } })
    await db.socialPost.deleteMany({ where: { itemType: 'thread', itemId: { in: ids.threads } } }).catch(() => undefined)
    await db.forumThread.deleteMany({ where: { id: { in: ids.threads } } })
  }
  if (ids.publicCategory) await db.forumCategory.deleteMany({ where: { id: ids.publicCategory } })
  if (ids.privateCategory) await db.forumCategory.deleteMany({ where: { id: ids.privateCategory } })
  if (ids.game || ids.draft) await db.gameTitle.deleteMany({ where: { id: { in: [ids.game, ids.draft].filter(Boolean) } } })
  if (ids.software) await db.softwareTitle.deleteMany({ where: { id: ids.software } })
  if (ids.studio) await db.studio.deleteMany({ where: { id: ids.studio } })
  await db.$disconnect()
})
