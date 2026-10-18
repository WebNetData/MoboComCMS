// Real PostgreSQL cases and staff members through the case service, on two database connections where two
// staff members act together. Sources are named with this script's own prefix, so no real case is read or changed.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript'), { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient(), second = new PrismaClient(), seed = `mcase${Date.now()}`
function world(db) {
  const cache = new Map()
  const load = file => {
    const full = path.resolve(file.endsWith('.ts') ? file : `${file}.ts`)
    if (cache.has(full)) return cache.get(full).exports
    const mod = { exports: {} }; cache.set(full, mod)
    new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(full, 'utf8'), { fileName: full, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText)(name => {
      if (name === '@/platform/database/prisma') return { db }
      if (name.startsWith('@/')) return load(`src/${name.slice(2)}`)
      if (name.startsWith('.')) return load(path.resolve(path.dirname(full), name))
      return require(name)
    }, mod, mod.exports)
    return mod.exports
  }
  return { cases: load('src/modules/moderation/server/cases.ts'), rules: load('src/modules/moderation/domain/cases.ts') }
}
const a = world(prisma), b = world(second)
const refused = async (promise, status, why) => { const error = await promise.then(() => null, caught => caught); assert.equal(error?.status, status, `${why}: expected ${status}, got ${error ? `${error.status} ${error.message}` : 'success'}`) }
const S = `${seed}-reviews`, OTHER = `${seed}-comments`
const HOUR = 3_600_000

async function main() {
  const member = name => prisma.user.create({ data: { email: `${seed}-${name}@example.invalid`, passwordHash: 'test-only', name: `${seed} ${name}`, role: 'ADMIN' } })
  const ana = await member('ana'), bob = await member('bob')
  const view = async (staff, ids = [1, 2, 3], source = S, now) => Object.fromEntries([...(await a.cases.casesFor(source, ids, staff.id, now))].map(([id, row]) => [id, [row.status, row.assignee?.name.split(' ')[1] || null, row.mine, row.note]]))
  const row = id => prisma.moderationCase.findUnique({ where: { source_itemId: { source: S, itemId: id } } })

  // ---- nothing exists until staff do something
  assert.deepEqual([await view(ana), await prisma.moderationCase.count({ where: { source: { startsWith: seed } } })], [{}, 0])

  // ---- taking an item: one holder, seen by both
  assert.deepEqual(await a.cases.claimCase(S, 1, ana.id), { status: 'CLAIMED' })
  assert.deepEqual([await view(ana), await view(bob)], [{ 1: ['CLAIMED', 'ana', true, ''] }, { 1: ['CLAIMED', 'ana', false, ''] }])
  await refused(a.cases.claimCase(S, 1, bob.id), 409, 'a colleague taking what ana holds')
  assert.deepEqual(await a.cases.claimCase(S, 1, ana.id), { status: 'CLAIMED' }, 'one\'s own claim is renewed')
  assert.deepEqual([await a.cases.claimCase(S, 1, bob.id, true), (await view(ana))[1]], [{ status: 'CLAIMED' }, ['CLAIMED', 'bob', false, '']], 'taking over is a deliberate step')
  await refused(a.cases.releaseCase(S, 1, ana.id), 409, 'letting go of what one does not hold')
  assert.deepEqual([await a.cases.releaseCase(S, 1, bob.id), (await view(bob))[1]], [{ status: 'OPEN' }, ['OPEN', null, false, '']])
  // Two staff members click at the same moment: one gets the item.
  const raced = await Promise.allSettled([a.cases.claimCase(S, 2, ana.id), b.cases.claimCase(S, 2, bob.id)])
  assert.deepEqual(raced.map(result => result.status).sort(), ['fulfilled', 'rejected'], 'one of two simultaneous claims wins')
  assert.equal(await prisma.moderationCase.count({ where: { source: S, itemId: 2 } }), 1)

  // ---- a claim nobody finishes frees itself
  await a.cases.claimCase(S, 3, ana.id)
  const later = new Date(Date.now() + (a.rules.CLAIM_HOURS + 1) * HOUR)
  assert.deepEqual([(await view(bob, [3], S, later))[3], await a.cases.myOpenCases(ana.id, [S], later), (await a.cases.myOpenCases(ana.id, [S])).some(item => item.itemId === 3)], [['OPEN', null, false, ''], [], true], 'after the claim time it holds nothing')
  assert.deepEqual(await a.cases.claimCase(S, 3, bob.id, false, later), { status: 'CLAIMED' }, 'and anybody may take it without taking over')

  // ---- a note for colleagues
  assert.deepEqual(await a.cases.noteCase(S, 3, '  <b>ask the author</b> first\u0007 '), { note: 'bask the author/b first' })
  assert.deepEqual([(await view(ana, [3], S, later))[3], await a.cases.noteCase(OTHER, 9, 'kept apart'), await view(ana, [9]), (await view(ana, [9], OTHER))[9]], [['CLAIMED', 'bob', false, 'bask the author/b first'], { note: 'kept apart' }, {}, ['OPEN', null, false, 'kept apart']], 'a case belongs to one source: the same number elsewhere is another item')
  assert.equal((await a.cases.noteCase(S, 3, 'x'.repeat(5000))).note.length, a.rules.MAX_CASE_NOTE)

  // ---- the record of a decision sent from the overview
  await refused(a.cases.recordDecision(S, 3, ana.id, 'maybe'), 400, 'a decision that is not one')
  assert.deepEqual(await a.cases.recordDecision(S, 3, ana.id, 'approve'), { recorded: false }, 'the overview cannot invent an owner decision')
  await prisma.$transaction(tx => a.cases.completeOwnerCase(tx, S, 3, ana.id, 'approve'))
  assert.deepEqual(await a.cases.recordDecision(S, 3, ana.id, 'approve'), { recorded: true })
  const decided = await row(3)
  assert.deepEqual([decided.status, decided.decision, decided.decidedById, decided.assigneeId, decided.decidedAt instanceof Date], ['DECIDED', 'approve', ana.id, null, true])
  assert.deepEqual([await a.cases.recordDecision(S, 3, bob.id, 'reject'), (await row(3)).decision, (await row(3)).decidedById], [{ recorded: false }, 'approve', ana.id], 'decided once: the first record stays')
  await refused(a.cases.claimCase(S, 3, bob.id, true), 409, 'taking a decided item')
  await refused(a.cases.noteCase(S, 3, 'afterthought'), 409, 'noting a decided item')
  await prisma.$transaction(tx => a.cases.completeOwnerCase(tx, S, 7, bob.id, 'reject'))
  assert.deepEqual(await a.cases.recordDecision(S, 7, bob.id, 'reject'), { recorded: true }, 'an owner decision is recorded even without a prior claim')
  const recent = await a.cases.recentDecisions([S])
  assert.deepEqual([recent.map(item => [item.itemId, item.decision, item.by.split(' ')[1]]).sort(), await a.cases.recentDecisions([OTHER]), await a.cases.recentDecisions([])], [[[3, 'approve', 'ana'], [7, 'reject', 'bob']], [], []], 'only the sources asked for')

  // ---- claims left for a week are closed; fresh ones and decided ones are not
  await prisma.moderationCase.updateMany({ where: { source: S, itemId: 2 }, data: { claimedAt: new Date(Date.now() - 8 * 24 * HOUR) } })
  await a.cases.claimCase(S, 5, ana.id)
  const before = await prisma.moderationCase.count({ where: { status: 'CLOSED', source: { startsWith: seed } } })
  await a.cases.closeAbandonedCases()
  assert.deepEqual([(await row(2)).status, (await row(2)).assigneeId, (await row(5)).status, (await row(3)).status, before], ['CLOSED', null, 'CLAIMED', 'DECIDED', 0])
  assert.deepEqual(await a.cases.claimCase(S, 2, bob.id), { status: 'CLAIMED' }, 'a closed case opens again when someone takes the item')
  console.log('PostgreSQL moderation cases: one holder per item (also under two clicks at once), taking over, stale claims, notes kept per source, a decision recorded once, and abandoned claims closed passed')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  try { await prisma.moderationCase.deleteMany({ where: { source: { startsWith: seed } } }); await prisma.user.deleteMany({ where: { email: { startsWith: seed } } }) }
  finally { await prisma.$disconnect(); await second.$disconnect() }
})
