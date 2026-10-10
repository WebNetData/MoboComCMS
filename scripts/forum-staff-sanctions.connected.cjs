// Actual PATCH handler + canonical staff guard against PostgreSQL; only session/module boundaries and unrelated effects are injected.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript')
const { PrismaClient } = require('@prisma/client'), { NextRequest } = require('next/server')
const db = new PrismaClient(), seed = `forum-sanctions-${Date.now()}`
let actor, enabled = true
const mocks = {
  '@/platform/database/prisma': { db },
  '@/modules/identity/server/access': { requirePerm: async (_req, key) => actor?.permissions === null || actor?.permissions?.includes(key) ? actor : null },
  '@/extensions/server/modules': { moduleGuard: async () => enabled ? null : new Response('{}', { status: 404 }), isModuleEnabled: async () => enabled },
  '@/modules/forum/server/community': { refreshStats: async () => {} },
  '@/modules/forum/server/actions': {}, '@/modules/forum/server/people': {}, '@/modules/forum/server/team': {}, '@/modules/forum/server/forum': {},
}
const cache = new Map()
function load(file) {
  const full = path.resolve(file.endsWith('.ts') ? file : fs.existsSync(`${file}.ts`) ? `${file}.ts` : path.join(file, 'index.ts'))
  if (cache.has(full)) return cache.get(full).exports
  const mod = { exports: {} }; cache.set(full, mod)
  const source = ts.transpileModule(fs.readFileSync(full, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  new Function('require', 'module', 'exports', source)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name]
    if (name.endsWith('.json')) return JSON.parse(fs.readFileSync(name.startsWith('@/') ? `src/${name.slice(2)}` : path.resolve(path.dirname(full), name), 'utf8'))
    if (name.startsWith('@/')) return load(`src/${name.slice(2)}`)
    if (name.startsWith('.')) return load(path.resolve(path.dirname(full), name))
    return require(name)
  }, mod, mod.exports)
  return mod.exports
}
const route = load('src/modules/forum/server/http/admin.ts')
const patch = (userId, data) => route.PATCH(new NextRequest('http://localhost:3000/api/admin/forum', { method: 'PATCH', headers: { Origin: 'http://localhost:3000', 'Content-Type': 'application/json' }, body: JSON.stringify({ section: 'users', userId, ...data }) }))
const actors = [], roles = [], targets = []
async function main() {
  for (const [name, permissions] of [['forum', ['dashboard.view', 'forum.moderate']], ['roles', ['dashboard.view', 'forum.moderate', 'roles.manage']]]) {
    const role = await db.role.create({ data: { name: `${seed}-${name}`, permissions: permissions.join(',') } }); roles.push(role)
    const user = await db.user.create({ data: { email: `${seed}-${name}@example.invalid`, passwordHash: 'test-only', role: 'ADMIN', roleId: role.id } }); actors.push({ ...user, permissions })
  }
  const full = await db.user.create({ data: { email: `${seed}-full@example.invalid`, passwordHash: 'test-only', role: 'ADMIN' } }); actors.push({ ...full, permissions: null })
  for (const [name, data] of [['customer', {}], ['staff', { role: 'ADMIN', roleId: roles[0].id }], ['owner', { role: 'ADMIN' }]]) {
    const user = await db.user.create({ data: { email: `${seed}-${name}@example.invalid`, passwordHash: 'test-only', ...data } }); targets.push(user)
    await db.forumProfile.create({ data: { userId: user.id, username: `${seed}-${name}`, silencedUntil: new Date(Date.now() + 60000), suspendedUntil: new Date(Date.now() + 60000), moderationNote: 'existing reason' } })
  }
  const refused = async (who, target, data) => {
    actor = who
    const before = await db.forumProfile.findUniqueOrThrow({ where: { userId: target.id } }), count = await db.auditLog.count({ where: { actorUserId: who.id } })
    assert.equal((await patch(target.id, data)).status, 403, `${who.email} must not sanction ${target.email}`)
    assert.deepEqual(await db.forumProfile.findUniqueOrThrow({ where: { userId: target.id } }), before, 'refusal precedes every profile write')
    assert.equal(await db.auditLog.count({ where: { actorUserId: who.id } }), count, 'refusal has no successful-change audit')
  }
  for (const field of ['silenceDays', 'suspendDays']) for (const days of [0, 3]) {
    await refused(actors[0], targets[1], { [field]: days, moderationNote: 'must not overwrite' })
    await refused(actors[0], targets[2], { [field]: days })
    await refused(actors[1], targets[2], { [field]: days })
  }
  for (const [who, target] of [[actors[0], targets[0]], [actors[1], targets[1]], [actors[2], targets[2]]]) {
    actor = who
    assert.equal((await patch(target.id, { silenceDays: 3, suspendDays: 2, moderationNote: 'fixture reason' })).status, 200)
    const profile = await db.forumProfile.findUniqueOrThrow({ where: { userId: target.id } })
    assert.ok(profile.silencedUntil > new Date()); assert.ok(profile.suspendedUntil > new Date())
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: target.id } })).status, 'ACTIVE', 'forum-only sanction leaves global identity standing unchanged')
    assert.equal((await patch(target.id, { silenceDays: 0, suspendDays: 0 })).status, 200)
    const cleared = await db.forumProfile.findUniqueOrThrow({ where: { userId: target.id } })
    assert.equal(cleared.silencedUntil, null); assert.equal(cleared.suspendedUntil, null)
  }
  actor = actors[0]
  assert.equal((await patch(targets[2].id, { title: 'Cosmetic title' })).status, 200, 'cosmetic edit retains existing behavior')
  assert.equal((await patch(2147483000, { silenceDays: 3 })).status, 404)
  actor = { ...actors[0], permissions: ['dashboard.view'] }
  assert.equal((await patch(targets[0].id, { silenceDays: 3 })).status, 403)
  actor = actors[2]; enabled = false
  assert.equal((await patch(targets[0].id, { silenceDays: 3 })).status, 404)
  console.log('Forum staff sanctions: actual handler + canonical guard; apply/clear refusals, role/full-access hierarchy, untouched rejected rows, audit, forum scope and module-off passed')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  try {
    const ids = [...actors, ...targets].map(u => u.id)
    await db.auditLog.deleteMany({ where: { actorUserId: { in: actors.map(u => u.id) } } })
    await db.forumProfile.deleteMany({ where: { userId: { in: ids } } })
    await db.user.deleteMany({ where: { id: { in: ids }, email: { startsWith: seed } } })
    await db.role.deleteMany({ where: { id: { in: roles.map(r => r.id) }, name: { startsWith: seed } } })
  } finally { await db.$disconnect() }
})
