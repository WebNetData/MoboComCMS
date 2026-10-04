// Local Docker PostgreSQL/API check; restores settings and removes namespaced fixtures.
const assert = require('node:assert/strict')
const { PrismaClient } = require('@prisma/client')
const { encode } = require('next-auth/jwt')
const db = new PrismaClient()
const base = 'http://localhost:3000'
const seed = `pm${Date.now().toString(36)}`
const ids = []
let originalSettings, settingsRead = false, groupId, conversationId
async function cookie(user) {
  return `next-auth.session-token=${await encode({ token: { uid: String(user.id), sub: String(user.id), email: user.email, authAt: Date.now() }, secret: process.env.NEXTAUTH_SECRET })}`
}
async function call(path, method, auth, data) {
  return fetch(`${base}${path}`, { method, headers: { cookie: auth, origin: base, 'content-type': 'application/json' }, ...(data ? { body: JSON.stringify(data) } : {}), signal: AbortSignal.timeout(60_000) })
}
async function main() {
  originalSettings = await db.setting.findUnique({ where: { key: 'forum.settings.v1' } }); settingsRead = true
  let stored = {}; try { stored = JSON.parse(originalSettings?.value || '{}') } catch {}
  const setMessages = async enabled => {
    const value = JSON.stringify({ ...stored, messagesEnabled: enabled, messagesMinTrust: 0 })
    await db.setting.upsert({ where: { key: 'forum.settings.v1' }, create: { key: 'forum.settings.v1', value }, update: { value } })
  }
  await setMessages(true)
  const users = []
  for (const name of ['sender', 'target', 'admin']) {
    const user = await db.user.create({ data: { email: `${seed}-${name}@example.invalid`, passwordHash: 'test-only', role: name === 'admin' ? 'ADMIN' : 'USER' } })
    ids.push(user.id); users.push(user)
    await db.userProfile.create({ data: { userId: user.id, username: `${seed}_${name}` } })
    await db.forumProfile.create({ data: { userId: user.id, username: `${seed}_${name}`, trustLevel: 0, trustLocked: true } })
  }
  const [sender, target, admin] = users
  const auth = await cookie(sender), other = await cookie(target), staff = await cookie(admin)
  const conversation = await db.forumConversation.create({ data: { title: `${seed} existing conversation`, userId: sender.id, postCount: 1, lastPostUserId: sender.id } })
  conversationId = conversation.id
  await db.forumMessage.create({ data: { conversationId, userId: sender.id, number: 1, content: `${seed} initial private message` } })
  await db.forumConversationUser.createMany({ data: users.map(user => ({ conversationId, userId: user.id })) })
  const replyPath = `/api/forum/messages/${conversationId}`
  const reply = auth => call(replyPath, 'POST', auth, { content: `${seed} private reply` })
  assert.equal((await reply(auth)).status, 201, 'existing participant may reply at trust zero')
  const snapshot = async () => ({
    messages: await db.forumMessage.count({ where: { conversationId } }),
    counter: (await db.forumConversation.findUniqueOrThrow({ where: { id: conversationId } })).postCount,
    notifications: await db.userNotification.count({ where: { userId: { in: ids } } }),
  })
  for (const reverse of [false, true]) {
    await db.userBlock.create({ data: { blockerId: reverse ? sender.id : target.id, blockedId: reverse ? target.id : sender.id } })
    const before = await snapshot()
    assert.equal((await reply(auth)).status, 403)
    assert.equal((await reply(other)).status, 403)
    assert.deepEqual(await snapshot(), before, 'blocked reply cannot write a message/counter/notification')
    await db.userBlock.deleteMany({ where: { OR: [{ blockerId: sender.id, blockedId: target.id }, { blockerId: target.id, blockedId: sender.id }] } })
  }
  const group = await db.forumGroup.create({ data: { slug: `${seed}-group`, name: `${seed} group`, mentionable: true } }); groupId = group.id
  await db.forumGroupMember.create({ data: { groupId, userId: target.id } })
  await db.userBlock.create({ data: { blockerId: target.id, blockedId: sender.id } })
  const groupInput = { groups: [group.slug], title: `${seed} group conversation`, content: `${seed} group message` }
  assert.equal((await call('/api/forum/messages', 'POST', auth, groupInput)).status, 403)
  assert.equal(await db.forumConversation.count({ where: { title: groupInput.title } }), 0)
  await db.userBlock.deleteMany({ where: { blockerId: target.id, blockedId: sender.id } })
  await setMessages(false)
  const beforePause = await snapshot()
  assert.equal((await reply(auth)).status, 403)
  assert.equal((await call(replyPath, 'PATCH', auth, { action: 'invite', to: `${seed}_target` })).status, 403)
  assert.deepEqual(await snapshot(), beforePause)
  const history = await call(`/forum/messages/${conversationId}`, 'GET', auth)
  assert.equal(history.status, 200)
  assert.ok((await history.text()).includes(`${seed} initial private message`), 'message pause keeps existing history readable')
  assert.equal((await call(replyPath, 'PATCH', auth, { action: 'archive' })).status, 200)
  await db.userBlock.create({ data: { blockerId: target.id, blockedId: admin.id } })
  assert.equal((await reply(staff)).status, 201, 'existing moderator exemption remains')
  assert.equal((await call('/api/forum/messages', 'POST', staff, groupInput)).status, 201)
  await setMessages(true)
  assert.equal((await reply(auth)).status, 201)
  console.log('Forum messages: both block directions, group bypass, Admin pause, no denied side effects, readable history/archive and moderator exemption passed')
}
main().catch(error => { console.error(error.message); process.exitCode = 1 }).finally(async () => {
  try {
    if (settingsRead && originalSettings) await db.setting.update({ where: { key: 'forum.settings.v1' }, data: { value: originalSettings.value } })
    else if (settingsRead) await db.setting.deleteMany({ where: { key: 'forum.settings.v1' } })
    if (ids.length) {
      const notices = await db.userNotification.findMany({ where: { userId: { in: ids } }, select: { id: true } })
      await db.backgroundJob.deleteMany({ where: { dedupeKey: { in: notices.flatMap(notice => ['sms', 'email', 'push'].map(channel => `notification:${notice.id}:${channel}`)) } } })
      await db.forumConversation.deleteMany({ where: { userId: { in: ids }, title: { startsWith: seed } } })
      await db.user.deleteMany({ where: { id: { in: ids }, email: { startsWith: `${seed}-` } } })
    }
    if (groupId) await db.forumGroup.deleteMany({ where: { id: groupId, slug: `${seed}-group` } })
    assert.equal(await db.user.count({ where: { email: { startsWith: `${seed}-` } } }), 0)
    assert.equal(await db.forumConversation.count({ where: { title: { startsWith: seed } } }), 0)
  } catch (error) { console.error('Fixture cleanup failed:', error.message); process.exitCode = 1 }
  await db.$disconnect()
})
