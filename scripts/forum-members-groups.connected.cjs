// Real PostgreSQL users, forum profiles and groups. The member directory and the list of groups are asked as
// different viewers: what a group shows of its members must follow who may see the group at all.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript-api'), { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient(), seed = `mg${Date.now()}`
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
    if (name === '@/extensions/server/modules') return { isModuleEnabled: async () => true, getModuleSettings: async () => ({}), getModuleStates: async () => ({}) }
    if (name.endsWith('.json')) return JSON.parse(fs.readFileSync(name.startsWith('@/') ? `src/${name.slice(2)}` : path.join(path.dirname(full), name), 'utf8'))
    if (name.startsWith('@/')) return load(`src/${name.slice(2)}`)
    if (name.startsWith('.')) return load(path.join(path.dirname(full), name))
    return require(name)
  }, mod, mod.exports)
  return mod.exports
}
const people = load('src/modules/forum/server/people.ts')

async function main() {
  const names = ['owner', 'early', 'late', 'pending', 'gone', 'outsider']
  const users = {}
  for (const name of names) users[name] = await prisma.user.create({ data: { email: `${seed}-${name}@example.invalid`, passwordHash: 'test-only', name: `${seed} ${name}`, status: name === 'gone' ? 'SUSPENDED' : 'ACTIVE' } })
  // "early" and "late" have never posted or visited: quiet accounts, kept out of the plain list.
  const counts = { owner: [3, 1], early: [0, 0], late: [0, 0], pending: [9, 1], gone: [8, 1], outsider: [5, 1] }
  for (const name of names) await prisma.forumProfile.create({ data: { userId: users[name].id, username: `${seed}${name}`, postCount: counts[name][0], daysVisited: counts[name][1] } })
  const open = await prisma.forumGroup.create({ data: { slug: `${seed}-open`, name: `${seed} open`, color: '#123456', joinMode: 'OPEN', memberCount: 3 } })
  const secret = await prisma.forumGroup.create({ data: { slug: `${seed}-secret`, name: `${seed} secret`, visibility: 'MEMBERS', memberCount: 1 } })
  const empty = await prisma.forumGroup.create({ data: { slug: `${seed}-empty`, name: `${seed} empty`, memberCount: 0 } })
  const join = (group, name, minutes, data = {}) => prisma.forumGroupMember.create({ data: { groupId: group.id, userId: users[name].id, createdAt: new Date(Date.now() - minutes * 60_000), ...data } })
  await join(open, 'late', 10); await join(open, 'early', 50); await join(open, 'owner', 30, { owner: true })
  await join(open, 'pending', 90, { status: 'PENDING' }); await join(open, 'gone', 80)
  await join(secret, 'owner', 5, { owner: true })

  const viewer = (userId, moderator = false) => ({ userId, member: false, moderator, staff: false, trustLevel: 0, groupIds: [], silenced: false, suspended: false })
  const stranger = viewer(users.outsider.id), insider = viewer(users.owner.id)
  const mine = rows => rows.filter(row => row.slug.startsWith(seed))
  const handles = result => result.users.map(row => row.author.username.replace(seed, ''))

  // ---- the list of groups: only what this viewer may see, with the first members as faces
  const seen = mine(await people.listGroups(stranger))
  assert.deepEqual(seen.map(row => row.slug).sort(), [`${seed}-empty`, `${seed}-open`], 'a members-only group is not listed to an outsider')
  const openRow = seen.find(row => row.slug === `${seed}-open`)
  assert.deepEqual(openRow.faces.map(face => face.username.replace(seed, '')), ['owner', 'early', 'late'], 'owners first, then the earliest; no pending request and no suspended account among the faces')
  assert.deepEqual(mine(await people.listGroups(stranger, 2)).find(row => row.slug === `${seed}-open`).faces.length, 2, 'no more faces than asked')
  assert.deepEqual(mine(await people.listGroups(stranger, 0)).find(row => row.slug === `${seed}-open`).faces, [], 'no faces when none are asked')
  assert.deepEqual(mine(await people.listGroups(insider)).map(row => row.slug).sort(), [`${seed}-empty`, `${seed}-open`, `${seed}-secret`], 'its member sees the members-only group')
  assert.equal(mine(await people.listGroups(insider)).find(row => row.slug === `${seed}-secret`).faces[0].username, `${seed}owner`)
  assert.equal(mine(await people.listGroups(viewer(null))).some(row => row.slug === `${seed}-secret`), false, 'nor is it listed to a guest')

  // ---- the directory narrowed to a group
  const inOpen = await people.userDirectory({ group: `${seed}-open`, sort: 'postCount' }, stranger)
  assert.deepEqual([handles(inOpen).sort(), inOpen.total, inOpen.group.name], [['early', 'late', 'owner'], 3, `${seed} open`], 'active members only, quiet ones included, by posts')
  assert.equal(handles(inOpen)[0], 'owner')
  assert.deepEqual(mine(inOpen.groups).map(row => row.slug), [`${seed}-open`], 'groups without members are not offered as a filter')

  // ---- a group the viewer may not see is no filter at all, and tells nothing about its members
  const blocked = await people.userDirectory({ group: `${seed}-secret`, q: seed }, stranger)
  assert.deepEqual([blocked.group, handles(blocked).sort()], [null, ['early', 'late', 'outsider', 'owner', 'pending']], 'the slug is ignored: the plain search result, not the secret group')
  const allowed = await people.userDirectory({ group: `${seed}-secret` }, insider)
  assert.deepEqual([handles(allowed), allowed.group.slug], [['owner'], `${seed}-secret`])
  // Without a viewer there are no groups to narrow by, as before this slice.
  const plain = await people.userDirectory({ group: `${seed}-open`, q: seed })
  assert.deepEqual([plain.group, plain.groups, plain.total], [null, [], 5])
  // The plain list keeps quiet accounts out; searching by name still finds them.
  assert.equal(handles(await people.userDirectory({ q: `${seed}early` }, stranger)).join(), 'early')
  console.log('PostgreSQL members and groups: faces of visible groups only, owners first without pending or suspended; directory narrowed to a visible group and never to a hidden one passed')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  try {
    await prisma.forumGroup.deleteMany({ where: { slug: { startsWith: seed } } })
    await prisma.user.deleteMany({ where: { email: { startsWith: seed } } })
  } finally { await prisma.$disconnect() }
})
