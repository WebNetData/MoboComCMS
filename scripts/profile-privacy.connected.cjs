// Local Docker PostgreSQL/API check. Creates and removes only namespaced temporary identities.
const assert = require('node:assert/strict')
const { PrismaClient } = require('@prisma/client')
const { encode } = require('next-auth/jwt')
const db = new PrismaClient()
const base = 'http://localhost:3000'
const seed = `pv${Date.now().toString(36)}`
const users = {}
const ids = []
async function cookie(user) {
  return `next-auth.session-token=${await encode({ token: { uid: String(user.id), sub: String(user.id), email: user.email, authAt: Date.now() }, secret: process.env.NEXTAUTH_SECRET })}`
}
async function get(path, auth = '') {
  return fetch(`${base}${path}`, { headers: auth ? { cookie: auth } : {}, signal: AbortSignal.timeout(60_000) })
}
async function main() {
  for (const name of ['owner', 'viewer', 'visible', 'blocked', 'inactive', 'admin']) {
    const user = await db.user.create({ data: { email: `${seed}-${name}@example.invalid`, passwordHash: 'test-only', status: name === 'inactive' ? 'BANNED' : 'ACTIVE', role: name === 'admin' ? 'ADMIN' : 'USER' } })
    ids.push(user.id); users[name] = user
    await db.userProfile.create({ data: { userId: user.id, username: `${seed}_${name}`, privacy: JSON.stringify(name === 'owner' ? { profile: 'PRIVATE' } : {}) } })
  }
  const { owner, viewer, visible, blocked, inactive, admin } = users
  await db.userFollow.createMany({ data: [viewer, visible, blocked, inactive].flatMap(user => [
    { followerId: user.id, followingId: owner.id }, { followerId: owner.id, followingId: user.id },
  ]) })
  const own = await cookie(owner), member = await cookie(viewer), staff = await cookie(admin)
  const paths = ['followers', 'following'].map(list => `/api/people/${seed}_owner/${list}`)
  const setPrivacy = privacy => db.userProfile.update({ where: { userId: owner.id }, data: { privacy: JSON.stringify(privacy) } })
  for (const path of paths) {
    assert.equal((await get(path)).status, 403)
    assert.equal((await get(path, member)).status, 403)
    const ownResponse = await get(path, own)
    assert.equal(ownResponse.status, 200)
    assert.equal((await ownResponse.json()).total, 3, 'inactive identities are excluded before counting')
    assert.equal((await get(path, staff)).status, 200, 'existing staff profile visibility is retained')
  }
  await setPrivacy({ profile: 'PRIVATE', showFollows: false })
  assert.equal((await get(paths[0], own)).status, 200)
  assert.equal((await get(paths[0], staff)).status, 403, 'showFollows keeps its existing owner-only override')
  await setPrivacy({ profile: 'MEMBERS' })
  assert.equal((await get(paths[0])).status, 403)
  assert.equal((await get(paths[0], member)).status, 200)
  await setPrivacy({ profile: 'FOLLOWERS' })
  assert.equal((await get(paths[0], member)).status, 200)
  await db.userFollow.delete({ where: { followerId_followingId: { followerId: viewer.id, followingId: owner.id } } })
  assert.equal((await get(paths[0], member)).status, 403)
  await db.userFollow.create({ data: { followerId: viewer.id, followingId: owner.id } })
  await setPrivacy({ profile: 'PUBLIC' })
  await db.userBlock.create({ data: { blockerId: owner.id, blockedId: viewer.id } })
  assert.equal((await get(paths[0], member)).status, 403)
  await db.userBlock.deleteMany({ where: { blockerId: owner.id, blockedId: viewer.id } })
  for (const reverse of [false, true]) {
    await db.userBlock.create({ data: { blockerId: reverse ? blocked.id : viewer.id, blockedId: reverse ? viewer.id : blocked.id } })
    for (const path of paths) {
      const response = await get(path, member)
      assert.equal(response.status, 200)
      const data = await response.json()
      assert.equal(data.total, 2)
      assert.deepEqual(new Set(data.people.map(person => person.userId)), new Set([viewer.id, visible.id]))
    }
    const directory = await get(`/api/people?q=${seed}`, member)
    assert.equal(directory.status, 200)
    const data = await directory.json()
    assert.equal(data.total, 4)
    assert.ok(data.people.every(person => person.userId !== blocked.id && person.userId !== inactive.id))
    await db.userBlock.deleteMany({ where: { OR: [{ blockerId: viewer.id, blockedId: blocked.id }, { blockerId: blocked.id, blockedId: viewer.id }] } })
  }
  console.log('Profile privacy: guest/member/follower/owner/staff access, both block directions, inactive identities and exact totals passed')
}
main().catch(error => { console.error(error.message); process.exitCode = 1 }).finally(async () => {
  try {
    if (ids.length) await db.user.deleteMany({ where: { id: { in: ids }, email: { startsWith: `${seed}-` } } })
    assert.equal(await db.user.count({ where: { email: { startsWith: `${seed}-` } } }), 0)
  } catch (error) { console.error('Fixture cleanup failed:', error.message); process.exitCode = 1 }
  await db.$disconnect()
})
