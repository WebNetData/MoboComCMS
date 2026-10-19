// Real PostgreSQL members. The forum profile is asked as different viewers: standing by reputation, and the
// social numbers and follow state that come from the one shared identity.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript-api'), { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient(), seed = `mp${Date.now()}`
const cache = new Map()
let community = true
function load(file) {
  const full = path.resolve(file.endsWith('.ts') || file.endsWith('.tsx') ? file : fs.existsSync(`${file}.ts`) ? `${file}.ts` : fs.existsSync(`${file}.tsx`) ? `${file}.tsx` : path.join(file, 'index.ts'))
  if (cache.has(full)) return cache.get(full).exports
  const mod = { exports: {} }; cache.set(full, mod)
  const source = ts.transpileModule(fs.readFileSync(full, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText
  new Function('require', 'module', 'exports', source)(name => {
    if (name === '@/platform/database/prisma') return { db: prisma }
    if (name === '@/platform/observability/logger') return { logEvent: () => {} }
    if (name === '@/modules/notifications/server/inbox') return { createInboxEvent: async () => {} }
    if (name === '@/extensions/server/modules') return { isModuleEnabled: async id => id !== 'community' || community, getModuleSettings: async () => ({}), getModuleStates: async () => ({}) }
    if (name.endsWith('.json')) return JSON.parse(fs.readFileSync(name.startsWith('@/') ? `src/${name.slice(2)}` : path.join(path.dirname(full), name), 'utf8'))
    if (name.startsWith('@/')) return load(`src/${name.slice(2)}`)
    if (name.startsWith('.')) return load(path.join(path.dirname(full), name))
    return require(name)
  }, mod, mod.exports)
  return mod.exports
}
const people = load('src/modules/forum/server/people.ts'), identity = load('src/modules/identity/server/profile.ts')
// Far above anything real, so the fixtures lead the ranking whatever else the database holds.
const TOP = 2_000_000_000

async function main() {
  const likes = { star: TOP, second: TOP - 10, banned: TOP - 5, fresh: 0, fan: 0, foe: 0 }
  const users = {}
  for (const name of Object.keys(likes)) {
    users[name] = await prisma.user.create({ data: { email: `${seed}-${name}@example.invalid`, passwordHash: 'test-only', name: `${seed} ${name}`, status: name === 'banned' ? 'SUSPENDED' : 'ACTIVE' } })
    await prisma.forumProfile.create({ data: { userId: users[name].id, username: `${seed}${name}`.slice(0, 20), likesReceived: likes[name], reputation: likes[name] } })
  }
  const handle = name => `${seed}${name}`.slice(0, 20)
  const viewer = userId => ({ userId, member: false, moderator: false, staff: false, trustLevel: 0, groupIds: [], silenced: false, suspended: false })
  const profile = (name, as) => people.getProfile(handle(name), viewer(as ? users[as].id : null))

  // ---- standing by reputation
  assert.equal((await profile('star')).rank, 1)
  assert.equal((await profile('second')).rank, 2, 'a suspended account ahead of them does not push a member down')
  assert.equal((await profile('fresh')).rank, null, 'no standing before the first like')
  assert.equal(await profile('banned'), null, 'a suspended account has no profile page')

  // ---- the social layer: one identity, read as different viewers
  await identity.follow(users.fan.id, users.star.id); await identity.follow(users.star.id, users.second.id); await identity.follow(users.star.id, users.fan.id)
  const pick = data => data.social && [data.social.followers, data.social.following, data.social.isFollowing, data.social.followsViewer, data.social.canFollow]
  assert.deepEqual(pick(await profile('star', 'fan')), [1, 2, true, true, true], 'a follower who is followed back')
  assert.deepEqual(pick(await profile('star', 'second')), [1, 2, false, true, true], 'followed by them, not following')
  assert.deepEqual(pick(await profile('star')), [1, 2, false, false, true], 'a visitor is offered the button (it leads to sign-in)')
  const own = await profile('star', 'star')
  assert.deepEqual([own.own, pick(own)], [true, [1, 2, false, false, false]], 'nobody follows themselves')

  // ---- a block ends following and takes the button away, in both directions
  await identity.block(users.foe.id, users.star.id)
  assert.deepEqual(pick(await profile('star', 'foe')).slice(2), [false, false, false], 'the one who blocked')
  assert.deepEqual(pick(await profile('foe', 'star')).slice(2), [false, false, false], 'the one who was blocked')
  await identity.block(users.star.id, users.fan.id)
  assert.deepEqual(pick(await profile('star', 'fan')), [0, 1, false, false, false], 'blocking a follower removes the follow and its count')

  // ---- the social module switched off: the forum profile stands alone
  community = false
  const alone = await profile('star', 'second')
  assert.deepEqual([alone.social, alone.rank, alone.author.name], [null, 1, `${seed} star`])
  console.log('PostgreSQL member profile: standing by reputation, follow state and counts per viewer, blocks and the social switch passed')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  try { await prisma.user.deleteMany({ where: { email: { startsWith: seed } } }) } finally { await prisma.$disconnect() }
})
