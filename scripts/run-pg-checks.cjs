// npm run test:pg — the self-contained checks that need a real PostgreSQL database (DATABASE_URL).
// Each script creates namespaced fixtures, replaces outside services with test doubles and removes what it created.
// Not part of `npm run check`: that gate must run without a database.
const { spawnSync } = require('node:child_process'), path = require('node:path')

const CHECKS = [
  'fulfillment-recovery-window',
  'invoice-void-settle',
  'return-refund-integrity',
  'gift-card-integrity',
  'digital-codes',
  'forum-flag-queue',
  'forum-board-index',
  'forum-activity-stream',
  'moderation-queue',
  'marketplace-seller-money',
  'integrity-report',
  'recommendations-listening', 'community-block-coverage',
  'gift-membership-recovery', 'forum-members-groups',
  'cart-writes', 'guest-cart-ownership', 'cart-checkout-snapshot', 'cart-merge-cap', 'cart-recovery', 'loyalty-awards',
  'inventory-hold-expiry', 'frenzyex-reconciliation', 'newsletter-send', 'queue-jobs', 'social-queue', 'scrub-recent', 'account-reviews', 'review-dimensions', 'compare-dimensions', 'review-badge-backfill',
  'reseller-recovery-provision',
  'community-moderation', 'journal-comment-notifications',
  'referral-reward-recovery', 'loyalty-redemption-recovery',
  'renewal-resume',
  'cinema-calendar',
  'episode-air-alerts',
]

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Example: node --env-file=.env scripts/run-pg-checks.cjs')
  process.exit(2)
}
const only = process.argv.slice(2)
const unknown = only.filter((name) => !CHECKS.includes(name))
if (unknown.length) {
  console.error(`Unknown check: ${unknown.join(', ')}. Available: ${CHECKS.join(', ')}`)
  process.exit(2)
}
let failed = 0
for (const name of only.length ? only : CHECKS) {
  const started = Date.now()
  const run = spawnSync(process.execPath, [path.join(__dirname, `${name}.connected.cjs`)], { encoding: 'utf8', env: process.env })
  const seconds = ((Date.now() - started) / 1000).toFixed(1)
  if (run.status === 0) console.log(`ok   ${name} (${seconds}s)`)
  else {
    failed++
    console.log(`FAIL ${name} (${seconds}s)`)
    console.log(`${run.stdout || ''}${run.stderr || ''}`.trim().split('\n').slice(0, 25).join('\n'))
  }
}
console.log(failed ? `${failed} PostgreSQL check(s) failed` : 'All PostgreSQL checks passed')
process.exit(failed ? 1 : 0)
