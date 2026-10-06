// Real PostgreSQL accounts, roles and forums. Three things are asked of the same functions the pages call:
// managers of the site's sections, who may change a staff account at all, and the forum's team of three ranks.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript'), { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient(), seed = `st${Date.now()}`
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
    // The guard reads only the shape of the signed-in account; the request layer behind it is the web server's.
    if (name === '@/modules/identity/server/access') return {}
    if (name.endsWith('.json')) return JSON.parse(fs.readFileSync(name.startsWith('@/') ? `src/${name.slice(2)}` : path.join(path.dirname(full), name), 'utf8'))
    if (name.startsWith('@/')) return load(`src/${name.slice(2)}`)
    if (name.startsWith('.')) return load(path.join(path.dirname(full), name))
    return require(name)
  }, mod, mod.exports)
  return mod.exports
}
const managers = load('src/modules/identity/server/section-managers.ts'), guard = load('src/modules/identity/server/staff-guard.ts'), rbac = load('src/modules/identity/rbac.ts')
const team = load('src/modules/forum/server/team.ts'), community = load('src/modules/forum/server/community.ts'), board = load('src/modules/forum/server/board.ts'), forum = load('src/modules/forum/server/forum.ts')
const refused = async (promise, status, why) => { const error = await promise.then(() => null, caught => caught); assert.equal(error?.status, status, `${why}: expected ${status}, got ${error ? `${error.status} ${error.message}` : 'success'}`) }
const roleNames = []

async function main() {
  const account = async (name, data = {}) => {
    const user = await prisma.user.create({ data: { email: `${seed}-${name}@example.invalid`, passwordHash: 'test-only', name: `${seed} ${name}`, ...data } })
    await prisma.forumProfile.create({ data: { userId: user.id, username: `${seed}${name}`.slice(0, 20) } })
    return user
  }
  const role = async (name, permissions) => { roleNames.push(`${seed}-${name}`); return prisma.role.create({ data: { name: `${seed}-${name}`, permissions } }) }
  const [supportRole, rolesRole, everything] = [await role('support', 'dashboard.view,users.manage,tickets.handle'), await role('roles', 'dashboard.view,roles.manage,music.manage'), await role('everything', '*')]
  const owner = await account('owner', { role: 'ADMIN' })                       // staff without a role: full access
  const support = await account('support', { role: 'ADMIN', roleId: supportRole.id })
  const hr = await account('hr', { role: 'ADMIN', roleId: rolesRole.id })        // may give roles, not full access
  const [ali, sara, banned, kian, mina] = [await account('ali'), await account('sara'), await account('banned', { status: 'BANNED' }), await account('kian'), await account('mina')]
  const fresh = id => prisma.user.findUnique({ where: { id }, include: { roleRef: true } })
  const email = user => user.email

  // ================= managers of the site's sections
  let done = await managers.setSectionManager(owner.id, { email: email(ali) }, ['music'])
  let row = await fresh(ali.id)
  assert.deepEqual([row.role, row.roleRef.name, row.roleRef.permissions], ['ADMIN', 'sections:music', 'dashboard.view,music.manage'], 'the music manager holds the panel and music, nothing else')
  roleNames.push('sections:music')
  // a second manager of the same section shares the role; adding a section moves to the role of both
  await managers.setSectionManager(owner.id, { userId: sara.id }, ['music'])
  assert.equal((await fresh(sara.id)).roleId, done.roleId)
  await managers.setSectionManager(owner.id, { userId: ali.id }, ['games', 'music', 'music', 'nonsense'])
  row = await fresh(ali.id)
  assert.deepEqual([row.roleRef.name, row.roleRef.permissions.split(',').sort()], ['sections:music+games', ['dashboard.view', 'games.manage', 'music.manage']], 'sections in their fixed order, each once, unknown ones dropped')
  assert.equal((await fresh(sara.id)).roleRef.permissions, 'dashboard.view,music.manage', 'the other manager is not touched')
  // the store is two permissions; a role edited by hand is put back to exactly its sections
  await managers.setSectionManager(owner.id, { userId: kian.id }, ['store'])
  assert.equal((await fresh(kian.id)).roleRef.permissions, 'dashboard.view,cms.products,orders.manage')
  await prisma.role.update({ where: { name: 'sections:music' }, data: { permissions: 'dashboard.view,music.manage,users.manage,roles.manage' } })
  await managers.setSectionManager(owner.id, { userId: mina.id }, ['music'])
  assert.equal((await fresh(mina.id)).roleRef.permissions, 'dashboard.view,music.manage', 'a section role never keeps more than its sections')
  const listed = (await managers.listStaff()).filter(item => item.email.startsWith(seed))
  const of = user => listed.find(item => item.id === user.id)
  assert.deepEqual([of(owner).kind, of(support).kind, of(ali).kind, of(ali).sections, of(kian).sections], ['full', 'custom', 'sections', ['music', 'games'], ['store']])
  assert.equal(of(owner).sections.length, 8, 'full access covers every section')

  // ---- taking a manager back: role and standing leave together, never "staff without a role"
  await managers.setSectionManager(owner.id, { userId: mina.id }, [])
  row = await fresh(mina.id)
  assert.deepEqual([row.role, row.roleId], ['CUSTOMER', null])
  // ---- refusals
  await refused(managers.setSectionManager(owner.id, { userId: owner.id }, ['music']), 403, 'their own account')
  await refused(managers.setSectionManager(hr.id, { userId: owner.id }, []), 403, 'a full-access account')
  await refused(managers.setSectionManager(owner.id, { userId: support.id }, ['music']), 409, 'an account with a hand-made role')
  await refused(managers.setSectionManager(owner.id, { email: `${seed}-nobody@example.invalid` }, ['music']), 404, 'an unknown email')
  await refused(managers.setSectionManager(owner.id, { userId: banned.id }, ['music']), 409, 'a banned account')
  await refused(managers.setSectionManager(owner.id, { userId: sara.id }, ['nonsense']), 400, 'a list naming nothing known must not remove the manager')
  await refused(managers.setSectionManager(owner.id, { userId: sara.id }, 'music'), 400, 'not a list')
  assert.deepEqual([(await fresh(owner.id)).roleId, (await fresh(support.id)).roleId, (await fresh(sara.id)).role, (await fresh(banned.id)).role], [null, supportRole.id, 'ADMIN', 'CUSTOMER'], 'nothing changed by the refused requests')

  // ================= who may change a staff account
  const actor = async user => { const u = await fresh(user.id); return { id: u.id, email: u.email, role: u.role, roleId: u.roleId, permissions: u.roleId ? rbac.parsePermissions(u.roleRef.permissions) : null } }
  const [asOwner, asSupport, asHr] = [await actor(owner), await actor(support), await actor(hr)]
  const no = async (who, id, change, why) => assert.equal(typeof await guard.accountChangeRefusal(who, id, change), 'string', why)
  const yes = async (who, id, change, why) => assert.equal(await guard.accountChangeRefusal(who, id, change), null, why)
  assert.deepEqual([guard.actorHasFullAccess(asOwner), guard.actorHasFullAccess(asSupport), guard.actorHasFullAccess(asHr)], [true, false, false])
  // support staff manage customers, not staff standing
  await yes(asSupport, banned.id, { sensitive: true }, 'support may unban or reset a customer')
  await no(asSupport, banned.id, { role: 'ADMIN', roleId: null }, 'support cannot make a full-access admin')
  await no(asSupport, support.id, { role: 'ADMIN', roleId: null }, 'nor promote themselves')
  await no(asSupport, banned.id, { role: 'ADMIN', roleId: supportRole.id }, 'nor give any role')
  await no(asSupport, null, { role: 'ADMIN', roleId: null }, 'nor create a staff account')
  await no(asSupport, owner.id, { sensitive: true }, 'nor set the owner\'s password')
  await no(asSupport, ali.id, { sensitive: true }, 'nor a manager\'s password')
  await yes(asSupport, banned.id, { role: 'CUSTOMER' }, 'repeating a customer\'s standing in an ordinary edit is not a change')
  // someone who may give roles, without full access
  await yes(asHr, banned.id, { role: 'ADMIN', roleId: supportRole.id }, 'gives an ordinary role')
  await yes(asHr, ali.id, { sensitive: true }, 'resets a manager\'s password')
  await yes(asHr, ali.id, { role: 'CUSTOMER' }, 'takes a role back')
  await no(asHr, banned.id, { role: 'ADMIN', roleId: null }, 'cannot give full access (no role)')
  await no(asHr, banned.id, { role: 'ADMIN', roleId: everything.id }, 'nor a full-access role')
  await no(asHr, banned.id, { role: 'ADMIN', roleId: 2147483000 }, 'nor a role that does not exist')
  await no(asHr, owner.id, { role: 'CUSTOMER' }, 'cannot demote the owner')
  await no(asHr, owner.id, { sensitive: true }, 'nor set the owner\'s password')
  await no(asHr, hr.id, { role: 'ADMIN', roleId: supportRole.id }, 'nor change their own role')
  // full access
  await yes(asOwner, banned.id, { role: 'ADMIN', roleId: null }, 'the owner makes another owner')
  await yes(asOwner, support.id, { role: 'ADMIN', roleId: everything.id })
  await no(asOwner, owner.id, { role: 'CUSTOMER' }, 'but not a change to their own standing')
  await yes(asOwner, owner.id, { sensitive: true }, 'their own password is theirs')

  // ================= the forum's team
  const forumRole = await role('forum', 'dashboard.view,forum.moderate')
  const chief = await account('chief', { role: 'ADMIN', roleId: forumRole.id })
  const open = await prisma.forumCategory.create({ data: { slug: `${seed}-open`, title: `${seed} open`, sortOrder: 9000 } })
  const group = await prisma.forumGroup.create({ data: { slug: seed, name: seed } })
  const hidden = await prisma.forumCategory.create({ data: { slug: `${seed}-hidden`, title: `${seed} hidden`, sortOrder: 9001, permissions: { create: [{ groupId: group.id, level: 'CREATE' }] } } })
  const handle = user => `${seed}${user.name.split(' ')[1]}`.slice(0, 20)
  await team.setForumModerator(handle(sara), open.id, true); await team.setForumModerator(`@${handle(sara).toUpperCase()}`, hidden.id, true)
  await team.setForumModerator(handle(mina), hidden.id, true); await team.setForumModerator(handle(kian), open.id, true)
  await team.setDeputy(handle(kian), true)
  let ranks = await team.forumRanks([chief.id, kian.id, sara.id, mina.id, ali.id, owner.id, support.id])
  assert.deepEqual([ranks.get(chief.id), ranks.get(owner.id), ranks.get(kian.id), ranks.get(sara.id), ranks.get(mina.id), ranks.get(ali.id), ranks.get(support.id)], ['admin', 'admin', 'deputy', 'moderator', 'moderator', undefined, undefined], 'the highest rank held; a music manager or support staff is not forum staff')
  // what each rank can do is the access behind it
  const [vKian, vSara, vChief, vAli] = await Promise.all([kian, sara, chief, ali].map(user => community.viewerFor(user.id)))
  assert.deepEqual([vKian.moderator, vSara.moderator, vSara.moderates.sort(), vChief.moderator, vAli.moderator, vAli.moderates], [true, false, [open.id, hidden.id].sort(), true, false, []], 'a deputy moderates everywhere, a forum moderator in their forums, a section manager of music nowhere')
  assert.equal((await forum.authorsFor([kian.id])).get(kian.id).rank, 'deputy', 'the rank travels with the author card')
  // the public page: a hidden forum is not named, and a moderator of only hidden forums is not listed
  const mine = list => list.filter(person => person.name.startsWith(seed)).map(person => [person.name.split(' ')[1], person.forums.map(item => item.title.split(' ')[1])])
  const stranger = { userId: null, groupIds: [], trustLevel: 0, moderator: false, member: false, silenced: false, suspended: false }
  const pub = await board.forumTeam(stranger)
  assert.deepEqual([mine(pub.admins).map(item => item[0]).sort(), mine(pub.deputies), mine(pub.moderators)], [['chief', 'owner'], [['kian', []]], [['sara', ['open']]]], 'as a visitor sees it')
  assert.ok(!JSON.stringify(pub).includes('hidden'))
  const inside = await board.forumTeam({ ...stranger, userId: ali.id, groupIds: [group.id] })
  assert.deepEqual(mine(inside.moderators).map(item => item[0]).sort(), ['mina', 'sara'], 'a member of the group sees the hidden forum and its moderator')
  // taking ranks back
  await team.setDeputy(handle(kian), false)
  ranks = await team.forumRanks([kian.id])
  assert.equal(ranks.get(kian.id), 'moderator', 'no longer a deputy, still a forum\'s moderator')
  assert.equal((await community.viewerFor(kian.id)).moderator, false)
  await team.setForumModerator(handle(kian), open.id, false)
  assert.equal((await team.forumRanks([kian.id])).get(kian.id), undefined)
  await refused(team.setDeputy(`${seed}nobody`, true), 404, 'an unknown username')
  await refused(team.setForumModerator(handle(sara), 2147483000, true), 404, 'an unknown forum')
  await refused(team.setDeputy(handle(banned), true), 404, 'a banned account')
  console.log('PostgreSQL staff teams: section managers hold exactly their sections, staff standing changes only within the actor\'s reach, and the forum team\'s three ranks match the access behind them passed')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  try {
    await prisma.forumCategory.deleteMany({ where: { slug: { startsWith: seed } } }); await prisma.forumGroup.deleteMany({ where: { slug: seed } })
    await prisma.user.deleteMany({ where: { email: { startsWith: seed } } })
    // Section roles are shared by name; they are removed only when this test made them and nobody else holds them.
    for (const name of [...roleNames, 'sections:music+games', 'sections:store']) await prisma.role.deleteMany({ where: { name, users: { none: {} } } })
  } finally { await prisma.$disconnect() }
})
