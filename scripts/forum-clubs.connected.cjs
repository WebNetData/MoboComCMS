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

  // ---- the rules are the forum's settings, not constants
  const rules = { clubsEnabled: true, clubsMinTrust: 1, clubsMaxOwned: 3 }
  const v = (trustLevel, extra = {}) => ({ userId: 1, groupIds: [], trustLevel, moderator: false, member: false, silenced: false, suspended: false, ...extra })
  assert.deepEqual([clubs.clubRefusal(v(1), rules), typeof clubs.clubRefusal(v(0), rules), clubs.clubRefusal(v(0), { ...rules, clubsMinTrust: 0 }), typeof clubs.clubRefusal(v(3), { ...rules, clubsMinTrust: 4 })], [null, 'string', null, 'string'])
  assert.deepEqual([typeof clubs.clubRefusal(v(4), { ...rules, clubsEnabled: false }), clubs.clubRefusal(v(0, { moderator: true }), { ...rules, clubsEnabled: false }), typeof clubs.clubRefusal({ ...v(4), userId: null }, rules)], ['string', null, 'string'], 'switched off for members, never for staff; a visitor signs in first')

  // ---- closing and reopening: nothing is deleted, and the way in comes back as it was
  await people.groupAction(await as('newbie'), priv.slug, { action: 'request' })
  await refused(clubs.setClubClosed(await as('joiner'), open.slug, true), 403, 'a member closing the club')
  await refused(clubs.setClubClosed(await as('founder'), 'club-no-such-club', true), 404, 'an unknown club')
  for (const [club, kind, mode] of [[open, 'open', 'OPEN'], [priv, 'private', 'REQUEST']]) {
    assert.deepEqual(await clubs.setClubClosed(await as('founder'), club.slug, true), { slug: club.slug, closed: true })
    let row = await prisma.forumGroup.findUnique({ where: { slug: club.slug }, include: { clubCategory: true, members: true } })
    assert.deepEqual([row.joinMode, row.clubCategory.locked, row.members.some(m => m.status === 'PENDING')], ['CLOSED', true, false], 'closed: nobody joins, no topic starts, waiting requests are withdrawn')
    assert.deepEqual((await card(await as('founder'), club.slug)).slice(0, 1).concat((await clubs.listClubs(await as('founder'))).find(item => item.slug === club.slug).closed), [kind, true], 'still listed as the kind it is, marked closed')
    await refused(people.groupAction(await as('newbie'), club.slug, { action: 'join' }), 403, 'joining a closed club')
    await clubs.setClubClosed(await as('founder'), club.slug, false)
    row = await prisma.forumGroup.findUnique({ where: { slug: club.slug }, include: { clubCategory: true } })
    assert.deepEqual([row.joinMode, row.clubCategory.locked], [mode, false], 'opened again as it was')
  }
  const memberOfOpen = await as('joiner')
  await clubs.setClubClosed(await as('founder'), open.slug, true)
  assert.deepEqual(await sees(memberOfOpen, open.slug), [true, false], 'a member of a closed club reads on and starts nothing')
  await refused(actions.createTopic(memberOfOpen, { categoryId: group.clubCategory.id, title: 'into a closed club', content: 'this must be refused' }), 403, 'a topic in a closed club')
  await actions.createReply(memberOfOpen, topic.id, { content: 'finishing what was under way' })
  await clubs.setClubClosed(await as('founder'), open.slug, false)

  // ---- handing over: the new owner runs it and moderates its forum; the giver becomes a member
  await refused(clubs.transferClub(await as('joiner'), open.slug, `${seed}joiner`.slice(0, 20)), 403, 'a member taking the club')
  await refused(clubs.transferClub(await as('founder'), open.slug, `${seed}founder`.slice(0, 20)), 409, 'to oneself')
  await refused(clubs.transferClub(await as('founder'), open.slug, `${seed}newbie`.slice(0, 20)), 409, 'to someone who is not a member')
  await refused(clubs.transferClub(await as('founder'), open.slug, `${seed}nobody`), 404, 'to an unknown name')
  await people.groupAction(await as('newbie'), priv.slug, { action: 'request' })
  await refused(clubs.transferClub(await as('founder'), priv.slug, `${seed}newbie`.slice(0, 20)), 409, 'to someone whose request is still waiting')
  assert.deepEqual(await clubs.transferClub(await as('founder'), open.slug, `@${seed}joiner`.slice(0, 21).toUpperCase()), { slug: open.slug, ownerId: users.joiner.id })
  const handed = await prisma.forumGroup.findUnique({ where: { slug: open.slug }, include: { members: { orderBy: { userId: 'asc' } }, clubCategory: { include: { moderators: true } } } })
  assert.deepEqual([handed.members.filter(m => m.owner).map(m => m.userId), handed.clubCategory.moderators.map(m => m.userId), handed.members.find(m => m.userId === users.founder.id).status], [[users.joiner.id], [users.joiner.id], 'ACTIVE'])
  assert.deepEqual([(await as('joiner')).moderates.includes(handed.clubCategory.id), (await as('founder')).moderates.includes(handed.clubCategory.id), (await clubs.clubOf(await as('joiner'), open.slug)).runs, (await clubs.clubOf(await as('founder'), open.slug)).runs], [true, false, true, false])
  await refused(clubs.setClubClosed(await as('founder'), open.slug, true), 403, 'the former founder closing it')
  // the group's own "make owner" keeps the forum's moderators in step too
  await people.groupAction(await as('joiner'), open.slug, { action: 'owner', username: `${seed}founder`.slice(0, 20) })
  assert.deepEqual((await prisma.forumCategoryModerator.findMany({ where: { categoryId: handed.clubCategory.id }, orderBy: { userId: 'asc' } })).map(m => m.userId), [users.founder.id, users.joiner.id].sort((a, b) => a - b))
  await people.groupAction(await as('joiner'), open.slug, { action: 'unowner', username: `${seed}founder`.slice(0, 20) })
  assert.deepEqual((await prisma.forumCategoryModerator.findMany({ where: { categoryId: handed.clubCategory.id } })).map(m => m.userId), [users.joiner.id])
  assert.deepEqual([await clubs.clubOf(await as('founder'), `${seed}-not-a-club`), (await clubs.clubOf(guest, priv.slug)).kind], [null, 'private'])

  // ---- clubs keep to their own page
  const section = await prisma.forumCategory.findUnique({ where: { slug: 'clubs' } })
  await refused(actions.createTopic(await as('founder'), { categoryId: section.id, title: 'a topic on the section', content: 'this must be refused' }), 409, 'the clubs section takes no topics')
  const index = await board.boardIndex(await as('founder'))
  assert.ok(!JSON.stringify(index.sections).includes(`club-${seed}`) && !index.sections.some(row => row.slug === 'clubs'), 'the board index does not lay clubs out')
  assert.ok(!(await people.listGroups(await as('founder'), 0)).some(row => row.slug.startsWith('club-')), 'nor does the list of user groups')
  console.log('PostgreSQL forum clubs: who may start one (by the forum settings), open and private clubs for visitors, askers, members and the founder, closing and reopening, handing over, limits, and clubs kept to their own page passed')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  try {
    await prisma.forumCategory.deleteMany({ where: { slug: { startsWith: `club-${seed}` } } }); await prisma.forumGroup.deleteMany({ where: { slug: { startsWith: `club-${seed}` } } })
    if (madeSection) await prisma.forumCategory.deleteMany({ where: { slug: 'clubs', children: { none: {} } } })
    if (madeEveryone) await prisma.forumGroup.deleteMany({ where: { slug: `${seed}-everyone` } })
    await prisma.user.deleteMany({ where: { email: { startsWith: seed } } })
  } finally { await prisma.$disconnect() }
})
