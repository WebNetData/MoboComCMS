const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), {execFileSync} = require('node:child_process'), ts = require('typescript-api')
// JOB_STEPS_BASELINE=<git ref> loads that revision instead (to see the old behaviour fail these tests).
const source = file => process.env.JOB_STEPS_BASELINE ? execFileSync('git', ['show', `${process.env.JOB_STEPS_BASELINE}:${file}`], {encoding: 'utf8'}) : fs.readFileSync(file, 'utf8')
function load(file, steps, fail) {
 const calls = [], logs = []
 const step = (name, value) => async () => {calls.push(name); if (fail.includes(name)) throw new Error(`${name} failed`); return value}
 const modules = Object.fromEntries(Object.entries(steps).map(([path, exports]) => [path, Object.fromEntries(Object.entries(exports).map(([name, value]) => [name, step(name, value)]))]))
 modules['@/platform/observability/logger'] = {logEvent: (level, event, data) => logs.push([level, event, data.step])}
 const mod = {exports: {}}
 new Function('require', 'module', 'exports', ts.transpileModule(source(file), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText)(name => modules[name] || require(name), mod, mod.exports)
 return {...mod.exports, calls, logs}
}
const ENGAGEMENT = {
 '@/modules/social/server/social': {releaseStuckSocialPosts: 0, processSocialQueue: 2},
 '@/modules/music/server/release-notifications': {processTrackReleaseNotifications: {checked: 1, sent: 1}},
 '@/modules/games/server/release-notifications': {processGameUpdateReleaseNotifications: {checked: 0, sent: 0}},
 '@/modules/software/server/release-notifications': {processSoftwareReleaseNotifications: {checked: 0, sent: 0}},
 '@/modules/studios/server/publication-notifications': {processStudioPublicationNotifications: {checked: 0, sent: 0}},
 '@/modules/cinema/server/episode-notifications': {processEpisodeAirNotifications: {checked: 0, sent: 0}},
 '@/modules/search/server/search': {rebuildSearchIndex: 7},
 '@/modules/downloads/server/guard': {pruneDownloadLogs: 1},
 '@/modules/reviews/server/reviews': {backfillVerifiedBadges: {checked: 0, badged: 0, failed: 0}},
 '@/modules/analytics/server/collect': {pruneAnalytics: 1},
}
const WORKER = {
 '@/modules/billing/server/billing': {recoverVoidInvoiceCredit: {checked: 0, released: 0, failed: 0}},
 '@/modules/billing/server/frenzyex-reconciliation': {processFrenzyReconciliationBatch: {checked: 1, paid: 1, pending: 0, expired: 0, canceled: 0, failed: 0, untracked: 0, deferred: 0}},
 '@/modules/fulfillment/server/jobs': {recoverPaidWalletTopups: {checked: 0, credited: 0, failed: 0}, recoverMissingPaidFulfillment: {checked: 0, enqueued: 0, failed: 0}, processFulfillmentBatch: {checked: 2, done: 2, failed: 0}},
 '@/modules/notifications/server/inbox': {syncRecentInvoiceEvents: {checked: 0}},
 '@/modules/referrals/server/referrals': {recoverReferralRewards: {checked: 0, paid: 0, failed: 0}},
 '@/modules/store/server/returns': {recoverInterruptedRefunds: {checked: 0, finished: 0, failed: 0}},
 '@/modules/store/server/orders': {recoverStoreSaleRecords: {checked: 0, recorded: 0, failed: 0}, eraseFinishedOrderInputs: 0},
 '@/modules/reseller/server/reseller-bot-sales': {retryResellerDeliveries: 0, cleanupResellerBotUpdates: 0},
 '@/modules/promotions/server/promotions': {releaseTerminalPromotionReservations: 0},
 '@/modules/fulfillment/server/alerts': {alertStuckFulfillment: {sent: 0, failed: 0}},
 '@/modules/catalog/server/inventory': {releaseExpiredReservations: 3},
 '@/modules/store/server/digital-codes': {syncAllCodeStock: {checked: 0, changed: 0, failed: 0}},
}
test('a failing release step does not hold back the other engagement steps, and the run still fails', async () => {
 const jobs = load('src/modules/content/server/jobs.ts', ENGAGEMENT, ['processTrackReleaseNotifications'])
 await assert.rejects(jobs.runEngagementJobs({full: true}), /processTrackReleaseNotifications failed/)
 assert.deepEqual(jobs.calls, ['releaseStuckSocialPosts', 'processSocialQueue', 'processTrackReleaseNotifications', 'processGameUpdateReleaseNotifications', 'processSoftwareReleaseNotifications', 'processStudioPublicationNotifications', 'processEpisodeAirNotifications', 'rebuildSearchIndex', 'backfillVerifiedBadges', 'pruneDownloadLogs', 'pruneAnalytics'])
 assert.deepEqual(jobs.logs, [['error', 'engagement.step_failed', 'music.releases']])
})
test('a quick engagement run with a failing step also finishes its steps and fails', async () => {
 const jobs = load('src/modules/content/server/jobs.ts', ENGAGEMENT, ['processSocialQueue'])
 await assert.rejects(jobs.runEngagementJobs(), /processSocialQueue failed/)
 assert.equal(jobs.calls.at(-1), 'processEpisodeAirNotifications'); assert.ok(!jobs.calls.includes('rebuildSearchIndex'))
})
test('a healthy engagement run keeps its result', async () => {
 const jobs = load('src/modules/content/server/jobs.ts', ENGAGEMENT, [])
 assert.deepEqual(await jobs.runEngagementJobs(), {released: 0, announced: 2, trackNotifications: {checked: 1, sent: 1}, gameNotifications: {checked: 0, sent: 0}, softwareNotifications: {checked: 0, sent: 0}, studioNotifications: {checked: 0, sent: 0}, episodeNotifications: {checked: 0, sent: 0}})
 assert.deepEqual(Object.keys(await jobs.runEngagementJobs({full: true})).slice(-3), ['indexed', 'prunedDownloadLogs', 'analytics'])
})
test('paid orders are delivered and holds released while payment reconciliation fails', async () => {
 const worker = load('src/modules/fulfillment/server/worker.ts', WORKER, ['processFrenzyReconciliationBatch', 'recoverPaidWalletTopups'])
 const result = await worker.runFulfillmentWorker(20, 'test')
 assert.ok(worker.calls.includes('processFulfillmentBatch')); assert.equal(worker.calls.at(-1), 'syncAllCodeStock'); assert.ok(worker.calls.includes('releaseExpiredReservations'))
 assert.equal(result.payments.failed, 1); assert.equal(result.payments.checked, 0); assert.equal(result.topups.failed, 1)
 assert.deepEqual(result.fulfillment, {checked: 2, done: 2, failed: 0}); assert.equal(result.releasedReservations, 3)
 assert.deepEqual(worker.logs.slice(0, 2), [['error', 'worker.step_failed', 'payments'], ['error', 'worker.step_failed', 'topups']])
 assert.equal(worker.logs.at(-1)[0], 'warn', 'the batch is reported as degraded')
})
test('a failing delivery or reservation step is reported and does not throw', async () => {
 const worker = load('src/modules/fulfillment/server/worker.ts', WORKER, ['processFulfillmentBatch', 'releaseExpiredReservations'])
 const result = await worker.runFulfillmentWorker(20, 'test')
 assert.deepEqual(result.fulfillment, {checked: 0, done: 0, failed: 1}); assert.equal(result.releasedReservations, -1); assert.equal(result.payments.paid, 1)
 assert.equal(worker.logs.at(-1)[0], 'warn')
})
test('a healthy worker run keeps its result and is reported as info', async () => {
 const worker = load('src/modules/fulfillment/server/worker.ts', WORKER, [])
 const result = await worker.runFulfillmentWorker(20, 'test')
 assert.equal(result.payments.paid, 1); assert.equal(result.releasedReservations, 3); assert.deepEqual(worker.logs.map(row => row[0]), ['info'])
})
