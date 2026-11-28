const assert = require('node:assert/strict')

async function main() {
  assert.match(new URL(process.env.DATABASE_URL).pathname, /^\/mobocom_pay_test_/)
  const fixture = await require('./pay-center.fixture.cjs')('financial-period')
  const { db, pay, actors: [manager, reviewer, merchant] } = fixture
  try {
    const saved = await db.payFinancialPeriod.findMany({ select: { fromDay: true, toDay: true } })
    let from, to
    for (let index = 0; !from; index++) {
      const start = new Date(Date.UTC(2001, 0, index * 7 + 1)).toISOString().slice(0, 10)
      const end = new Date(Date.UTC(2001, 0, index * 7 + 4)).toISOString().slice(0, 10)
      if (!saved.some(row => row.fromDay <= end && row.toDay >= start)) [from, to] = [start, end]
    }
    const change = (actor, action, version, extra = {}) => pay.changePayFinancialPeriod(actor, { from, to, action, version, ...extra })
    await assert.rejects(change(merchant, 'SUBMIT', 0, { reviewerId: reviewer.id }), error => error.status === 403)
    const submitted = await change(manager, 'SUBMIT', 0, { reviewerId: reviewer.id })
    assert.equal(submitted.period.version, 1)
    await assert.rejects(change(manager, 'REVIEW', 1, { note: 'Unauthorized review' }), error => error.status === 403)
    await assert.rejects(change(reviewer, 'CLOSE', 1, { note: 'Skipped review' }), error => error.status === 409)
    const attempts = await Promise.allSettled(['Verified references', 'Concurrent review'].map(note => change(reviewer, 'REVIEW', 1, { note })))
    assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1)
    assert.equal(attempts.find(result => result.status === 'rejected').reason.status, 409)
    assert.equal((await change(reviewer, 'CLOSE', 2, { note: 'Approved closing' })).period.status, 'CLOSED')
    assert.equal((await change(manager, 'CORRECT', 3, { note: 'Correction explanation' })).period.version, 4)
    const revision = await pay.payFinancialPeriod(manager, new URLSearchParams({ from, to, revision: '1' }))
    assert.equal(revision.selectedSnapshot.from, from)
    assert.deepEqual(revision.period.history.map(row => row.action), ['CORRECT', 'CLOSE', 'REVIEW', 'SUBMIT'])
    const record = await db.payFinancialPeriod.findUniqueOrThrow({ where: { fromDay_toDay: { fromDay: from, toDay: to } } })
    await assert.rejects(db.payFinancialPeriodRevision.updateMany({ where: { periodId: record.id, version: 1 }, data: { note: 'altered' } }))
    await assert.rejects(pay.changePayFinancialPeriod(manager, { from, to: from, action: 'SUBMIT', version: 0, reviewerId: manager.id }), error => error.status === 409)
    console.log('Financial period review, close, correction, authorization, concurrency and immutable revisions passed')
  } finally {
    await fixture.cleanup()
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
