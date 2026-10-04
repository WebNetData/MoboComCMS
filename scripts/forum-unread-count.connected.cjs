// Local PostgreSQL check: creates and removes only its own namespaced fixtures.
const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript')
const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient(), seed = `unread-${Date.now()}`, users = []
const mod = { exports: {} }
const code = ts.transpileModule(fs.readFileSync('src/modules/forum/server/message-counts.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
new Function('require', 'module', 'exports', code)(name => {
  if (name === '@/platform/database/prisma') return { db }
  throw Error(`Unexpected counter dependency: ${name}`)
}, mod, mod.exports)
async function main() {
  for (const suffix of ['member', 'outsider']) users.push(await db.user.create({ data: { email: `${seed}-${suffix}@example.invalid`, passwordHash: 'test-only', role: 'USER' } }))
  const [member, outsider] = users
  const memberships = [
    { lastRead: 0 }, { lastRead: 2 }, { lastRead: 3 },
    { lastRead: 0, archived: true }, { lastRead: 0, left: true },
  ]
  for (const [i, membership] of memberships.entries()) {
    const conversation = await db.forumConversation.create({ data: { title: `${seed}-${i}`, userId: member.id, postCount: 2 } })
    await db.forumConversationUser.create({ data: { userId: member.id, conversationId: conversation.id, ...membership } })
  }
  assert.equal(await mod.exports.unreadMessageCount(null), 0)
  assert.equal(await mod.exports.unreadMessageCount(outsider.id), 0)
  assert.equal(await mod.exports.unreadMessageCount(member.id), 1)
  await db.forumConversationUser.updateMany({ where: { userId: member.id }, data: { lastRead: 2 } })
  assert.equal(await mod.exports.unreadMessageCount(member.id), 0)
  console.log('Real PostgreSQL unread counter: guest, nonmember, read positions, archived/left exclusions and read transition passed')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  try {
    await db.forumConversation.deleteMany({ where: { userId: { in: users.map(user => user.id) }, title: { startsWith: seed } } })
    await db.user.deleteMany({ where: { id: { in: users.map(user => user.id) }, email: { startsWith: seed } } })
  } finally { await db.$disconnect() }
})
