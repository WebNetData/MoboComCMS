// Select only the fixture author's editorial intents; never run external channel/provider jobs.
const assert = require('node:assert/strict')
module.exports = async function drainEditorialNotices(load, db, authorId) {
  const rows = await db.backgroundJob.findMany({ where: { kind: 'journal.editorial-decision', status: 'QUEUED' } })
  const ids = rows.filter(row => JSON.parse(row.payload).authorId === authorId).map(row => row.id)
  const original = db.backgroundJob.findFirst
  db.backgroundJob.findFirst = args => original.call(db.backgroundJob, { ...args, where: { ...args.where, id: { in: ids } } })
  try { await load('src/modules/operations/server/queue.ts').runQueue(5000) }
  finally { db.backgroundJob.findFirst = original }
  assert.equal(await db.backgroundJob.count({ where: { id: { in: ids }, status: { not: 'DONE' } } }), 0, 'editorial worker completes its fixture leases')
}
