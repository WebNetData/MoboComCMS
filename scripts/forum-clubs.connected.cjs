// Real PostgreSQL groups, forums and members. A member starts clubs and others join them; what each of them
// may then see and do is asked of the same functions the forum pages use.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript'), { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient(), seed = `ck${Date.now()}`.slice(0, 12)
const cache = new Map()
function load(file) {
  const full = path.resolve(file.endsWith('.ts') || file.endsWith('.tsx') ? file : fs.existsSync(`${file}.ts`) ? `${file}.ts` : fs.existsSync(`${file}.tsx`) ? `${file}.tsx` : path.join(file, 'index.ts'))
  if (cache.has(full)) return cache.get(full).exports
  const mod = { exports: {} }; cache.set(full, mod)
  const source = ts.transpileModule(fs.readFileSync(full, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText
  new Function('require', 'module', 'exports', source)(name => {
    if (name === '@/platform/database/prisma') return { db: prisma }
    if (name === '@/platform/observability/logger') return { logEvent: () => {} }
    if (name === '@/modules/notifications/server/inbox') return { createInboxEvent: async () => {} }
    if (name === '@/modules/content/server/events') return { contentChanged: () => {} }
    if (name === '@/extensions/server/modules') return { isModuleEnabled: async () => true, getModuleSettings: async () => ({}), getModuleStates: async () => ({}) }
    if (name === 'react') return { ...require('react'), cache: fn => fn }
    if (name === '@/modules/membership/server/membership') return { getViewer: async () => null, isMember: async () => false }
    if (name.endsWith('.json')) return JSON.parse(fs.readFileSync(name.startsWith('@/') ? `src/${name.slice(2)}` : path.join(path.dirname(full), name), 'utf8'))
    if (name.startsWith('@/')) return load(`src/${name.slice(2)}`)
    if (name.startsWith('.')) return load(path.join(path.dirname(full), name))
    return require(name)
  }, mod, mod.exports)
  return mod.exports
}
const clubs = load('src/modules/forum/server/clubs.ts'), community = load('src/modules/forum/server/community.ts'), forum = load('src/modules/forum/server/forum.ts')
const people = load('src/modules/forum/server/people.ts'), board = load('src/modules/forum/server/board.ts'), actions = load('src/modules/forum/server/actions.ts')
const refused = async (promise, status, why) => { const error = await promise.then(() => null, caught => caught); assert.equal(error?.status, status, `${why}: expected ${status}, got ${error ? `${error.status} ${error.message}` : 'success'}`) }
let madeEveryone = false, madeSection = false

async function main() {
  if (!await prisma.forumGroup.findUnique({ where: { automatic: 'everyone' } })) { await prisma.forumGroup.create({ data: { slug: `${seed}-everyone`, name: 'everyone', automatic: 'everyone' } }); madeEveryone = true }
  madeSection = !await prisma.forumCategory.findUnique({ where: { slug: 'clubs' } })
  const users = {}
  for (const [name, trust, data] of [['founder', 1, {}], ['joiner', 1, {}], ['asker', 0, {}], ['newbie', 0, {}], ['muted', 2, { silencedUntil: new Date(Date.now() + 86_400_000) }]]) {
    users[name] = await prisma.user.create({ data: { email: `${seed}-${name}@example.invalid`, passwordHash: 'test-only', name: `${seed} ${name}` } })
    await prisma.forumProfile.create({ data: { userId: users[name].id, username: `${seed}${name}`.slice(0, 20), trustLevel: trust, ...data } })
  }
  const as = name => community.viewerFor(users[name].id)
  const guest = await community.viewerFor(null)
  const sees = async (who, slug) => { const row = (await forum.visibleCategories(who)).find(category => category.slug === slug); return row ? [row.access.see, row.access.create] : null }

  // ---- who may start a club
  await refused(clubs.createClub(guest, { name: 'guest club', slug: `${seed}-g` }), 401, 'a visitor')
  await refused(clubs.createClub(await as('newbie'), { name: 'too early', slug: `${seed}-n` }), 403, 'a brand-new member')
  await refused(clubs.createClub(await as('muted'), { name: 'muted club', slug: `${seed}-m` }), 403, 'a silenced member')
  await refused(clubs.createClub(await as('founder'), { name: 'ab', slug: `${seed}-s` }), 400, 'a name too short')
  await refused(clubs.createClub(await as('founder'), { name: 'bad address', slug: 'نشانی' }), 400, 'an address not in latin letters')

  // ---- an open club: everyone reads, members write, the founder moderates
  const open = await clubs.createClub(await as('founder'), { name: `${seed} open club`, slug: `${seed}-open`, description: 'for everyone', kind: 'open', color: '#10b981', icon: '🎬' })
  const group = await prisma.forumGroup.findUnique({ where: { slug: open.slug }, include: { members: true, clubCategory: { include: { parent: true, permissions: true, moderators: true } } } })
  assert.deepEqual([open.slug, group.joinMode, group.visibility, group.memberCount, group.members.map(row => [row.userId, row.owner, row.status])], [`club-${seed}-open`, 'OPEN', 'PUBLIC', 1, [[users.founder.id, true, 'ACTIVE']]])
  assert.deepEqual([group.clubCategory.slug, group.clubCategory.parent.slug, group.clubCategory.color, group.clubCategory.moderators.map(row => row.userId), group.clubCategory.permissions.map(row => row.level).sort()], [open.slug, 'clubs', '#10b981', [users.founder.id], ['CREATE', 'SEE']], 'its forum sits under the clubs section; the founder is its moderator')
  assert.deepEqual([(await as('founder')).moderates, await sees(await as('founder'), open.slug)], [[group.clubCategory.id], [true, true]])
  assert.deepEqual([await sees(guest, open.slug), await sees(await as('joiner'), open.slug)], [[true, false], [true, false]], 'anyone reads an open club; only members write')
  await refused(actions.createTopic(await as('joiner'), { categoryId: group.clubCategory.id, title: 'not a member yet', content: 'this must be refused' }), 403, 'writing before joining')
  assert.deepEqual(await people.groupAction(await as('joiner'), open.slug, { action: 'join' }), { status: 'ACTIVE' })
  assert.deepEqual(await sees(await as('joiner'), open.slug), [true, true], 'joining is all it takes')
  const topic = await actions.createTopic(await as('joiner'), { categoryId: group.clubCategory.id, title: 'first topic of the club', content: 'hello to the club' })
  // the founder moderates here and nowhere else
  assert.equal((await actions.moderateThread(await as('founder'), topic.id, { pinned: true })).pinned, true)
  await refused(actions.moderateThread(await as('joiner'), topic.id, { pinned: false }), 403, 'a member is not its moderator')

  // ---- a private club: listed, but what is inside is for members
  const priv = await clubs.createClub(await as('founder'), { name: `${seed} private club`, slug: `${seed}-priv`, kind: 'private' })
  const privGroup = await prisma.forumGroup.findUnique({ where: { slug: priv.slug }, include: { clubCategory: { include: { permissions: true } } } })
  assert.deepEqual([privGroup.joinMode, privGroup.clubCategory.permissions.map(row => [row.groupId === privGroup.id, row.level])], ['REQUEST', [[true, 'CREATE']]])
  await prisma.forumCategory.update({ where: { id: privGroup.clubCategory.id }, data: { threadCount: 7, postCount: 9, lastPostAt: new Date() } })
  assert.deepEqual([await sees(guest, priv.slug), await sees(await as('asker'), priv.slug)], [null, null], 'outsiders do not see a private club\'s forum')
  const card = async (who, slug) => { const row = (await clubs.listClubs(who)).find(item => item.slug === slug); return row && [row.kind, row.open, row.membership, row.topics, row.posts, row.lastPostAt === null, row.members, row.founder?.name.split(' ')[1]] }
  assert.deepEqual(await card(await as('asker'), priv.slug), ['private', false, 'NONE', 0, 0, true, 1, 'founder'], 'it is listed so one can ask to join, without its numbers')
  assert.deepEqual(await people.groupAction(await as('asker'), priv.slug, { action: 'request' }), { status: 'PENDING' })
  assert.deepEqual([await sees(await as('asker'), priv.slug), (await card(await as('asker'), priv.slug))[2]], [null, 'PENDING'], 'asking is not being in')
  await people.groupAction(await as('founder'), priv.slug, { action: 'accept', username: `${seed}asker`.slice(0, 20) })
  assert.deepEqual([await sees(await as('asker'), priv.slug), await card(await as('asker'), priv.slug)], [[true, true], ['private', true, 'ACTIVE', 7, 9, false, 2, 'founder']], 'accepted by the founder: in, and its numbers show')
  assert.deepEqual([(await card(await as('founder'), open.slug)).slice(0, 3), (await card(await as('joiner'), open.slug)).slice(0, 3), (await card(guest, open.slug)).slice(0, 3)], [['open', true, 'OWNER'], ['open', true, 'ACTIVE'], ['open', true, 'NONE']])

  // ---- addresses are taken once; a founder holds three clubs at most
  await refused(clubs.createClub(await as('joiner'), { name: 'same address', slug: `${seed}-open` }), 409, 'an address already taken')
  await clubs.createClub(await as('founder'), { name: `${seed} third club`, slug: `${seed}-third` })
  await refused(clubs.createClub(await as('founder'), { name: `${seed} fourth club`, slug: `${seed}-fourth` }), 409, 'a fourth club')
  assert.equal(await prisma.forumCategory.count({ where: { slug: `club-${seed}-fourth` } }), 0, 'a refused club leaves nothing behind')

  // ---- clubs keep to their own page
  const section = await prisma.forumCategory.findUnique({ where: { slug: 'clubs' } })
  await refused(actions.createTopic(await as('founder'), { categoryId: section.id, title: 'a topic on the section', content: 'this must be refused' }), 409, 'the clubs section takes no topics')
  const index = await board.boardIndex(await as('founder'))
  assert.ok(!JSON.stringify(index.sections).includes(`club-${seed}`) && !index.sections.some(row => row.slug === 'clubs'), 'the board index does not lay clubs out')
  assert.ok(!(await people.listGroups(await as('founder'), 0)).some(row => row.slug.startsWith('club-')), 'nor does the list of user groups')
  console.log('PostgreSQL forum clubs: who may start one, open and private clubs for visitors, askers, members and the founder, limits, and clubs kept to their own page passed')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  try {
    await prisma.forumCategory.deleteMany({ where: { slug: { startsWith: `club-${seed}` } } }); await prisma.forumGroup.deleteMany({ where: { slug: { startsWith: `club-${seed}` } } })
    if (madeSection) await prisma.forumCategory.deleteMany({ where: { slug: 'clubs', children: { none: {} } } })
    if (madeEveryone) await prisma.forumGroup.deleteMany({ where: { slug: `${seed}-everyone` } })
    await prisma.user.deleteMany({ where: { email: { startsWith: seed } } })
  } finally { await prisma.$disconnect() }
})
