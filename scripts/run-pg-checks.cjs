// npm run test:pg — the self-contained checks that need a real PostgreSQL database (DATABASE_URL).
// Each script creates namespaced fixtures, replaces outside services with test doubles and removes what it created.
// Not part of `npm run check`: that gate must run without a database.
const { spawnSync } = require('node:child_process'), path = require('node:path')

const CHECKS = [
  'import-profiles',
  'prompt-master',
  'page-lifecycle',
  'editor-media',
  'editor-groups-experts',
  'editorial-schedule',
  'editor-patterns',
  'editor-synced-patterns',
  'editor-role-templates',
  'configuration-history',
  'authoring-migrations',
  'media-library',
  'journal-pagination',
  'games-editorial',
  'invoice-logo',
  'identity-otp',
  'mobile-account-entry',
  'vpn-group-access',
  'digital-content-pricing',
  'digital-content-pricing-migration',
  'business-trust',
  'business-trust-migration',
  'livechat-placement',
  'business-experiences',
  'business-authority',
  'business-requests-migration',
  'fulfillment-recovery-window', 'seo-entities', 'content-revisions',
  'money-state-rules', 'order-closure', 'site-popups', 'user-groups', 'vip-memberships', 'product-bundles', 'editor-page-documents', 'section-maintenance', 'invoice-void-settle', 'invoice-viewer-access', 'import-provenance', 'admin-saved-views', 'item-timeline',
  'return-refund-integrity',
  'journal-admin-filters',
  'journal-review',
  'journal-proposals',
  'gift-card-integrity',
  'digital-codes',
  'database-insert-compat', 'analytics-integrity', 'notification-dedup-integrity', 'seed-role-preservation',
  'global-authentication',
  'current-account-consumers',
  'unified-avatar',
  'member-avatar-surfaces',
  'import-edit-protection',
  'profile-merges',
  'content-management',
  'content-restore-atomic',
  'moderation-rounds',
  'copyright-decision',
  'moderation-rounds-migration',
  'settings-history',
  'section-settings-history',
  'owner-settings-history',
  'editor-module-blocks',
  'search-advanced-scale',
  'search-scan-cap',
  'repository-license-owner',
  'masked-file-authority',
  'global-restriction-admin',
  'telegram-authority',
  'telegram-merge-safety',
  'extension-state',
  'extension-state-integrity',
  'module-availability',
  'package-integrity',
  'package-command',
  'package-authority',
  'package-crud',
  'package-source',
  'repository-install',
  'repository-entitlement',
  'repository-license-map',
  'repository-vendor-licenses',
  'repository-purchase',
  'repository-purchase-recovery',
  'repository-purchase-diagnostics',
  'repository-vendor-admin',
  'repository-vendor-files',
  'repository-archive-diagnostics',
  'repository-upload-reservations',
  'repository-upload-crash',
  'repository-upload-recovery',
  'repository-upload-recovery-live',
  'repository-upload-migration',
  'repository-owner-integrity',
  'queue-lease',
  'queue-authority',
  'import-execution-authority',
  'import-execution-authority-migration',
  'forum-flag-queue', 'forum-category-moderators', 'forum-staff-sanctions', 'scoped-restrictions', 'scoped-restrictions-migration', 'scoped-restrictions-single-connection',
  'forum-board-index', 'forum-clubs',
  'forum-activity-stream', 'forum-leaderboard', 'forum-reputation',
  'moderation-queue', 'moderation-cases', 'posts-permission-migration',
  'marketplace-seller-money', 'staff-teams',
  'integrity-report', 'forum-member-profile', 'editorial-collections',
  'recommendations-listening', 'recommendation-providers', 'community-block-coverage', 'music-language',
  'gift-membership-recovery', 'forum-members-groups', 'member-lists',
  'cart-writes', 'guest-cart-ownership', 'cart-checkout-snapshot', 'cart-merge-cap', 'cart-recovery', 'loyalty-awards',
  'inventory-hold-expiry', 'frenzyex-reconciliation', 'newsletter-send', 'queue-jobs', 'social-queue', 'scrub-recent', 'account-reviews', 'review-dimensions', 'compare-dimensions', 'review-badge-backfill',
  'reseller-recovery-provision', 'search-facets',
  'community-moderation', 'journal-comment-notifications',
  'referral-reward-recovery', 'loyalty-redemption-recovery',
  'renewal-resume', 'notification-policy',
  'cinema-calendar', 'media-tracks', 'player-subtitles',
  'episode-air-alerts', 'cinema-people', 'cinema-people-admin', 'music-artist-profiles', 'celebrity-profile', 'cinema-discovery', 'cinema-formats', 'vocabulary', 'builder-history',
]

// These invoke optional tools/protocol servers, queue workers or canonical-setting fixtures.
// Media checks require owned mobocom_media_*; reliability checks require mobocom_reliability_*.
// Journal review reliability requires its own mobocom_review_reliability_* database.
// Run explicitly on those isolated databases, never the site's database.
// Web operations needs an empty first-owner database; import compatibility also requires an explicitly disposable DB.
const OPTIONAL_CHECKS = ['web-operations', 'installer-host-setup', 'import-content-compat', 'media-archive', 'media-storage', 'content-authoring', 'journal-notification-intents', 'compatible-audio', 'admin-policy-history', 'journal-review-reliability', 'journal-block-proposals']
const REGISTERED = [...CHECKS, ...OPTIONAL_CHECKS]
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Example: node --env-file=.env scripts/run-pg-checks.cjs')
  process.exit(2)
}
const only = process.argv.slice(2)
const unknown = only.filter((name) => !REGISTERED.includes(name))
if (unknown.length) {
  console.error(`Unknown check: ${unknown.join(', ')}. Available: ${REGISTERED.join(', ')}`)
  process.exit(2)
}
let failed = 0
for (const name of only.length ? only : CHECKS) {
  const started = Date.now()
  const run = spawnSync(process.execPath, [path.join(__dirname, `${name}.connected.cjs`)], { encoding: 'utf8', env: process.env })
  const seconds = ((Date.now() - started) / 1000).toFixed(1)
  if (run.status === 0) { console.log(`ok   ${name} (${seconds}s)`); if (name === 'search-advanced-scale') console.log(run.stdout.trim()) }
  else {
    failed++
    console.log(`FAIL ${name} (${seconds}s)`)
    console.log(`${run.stdout || ''}${run.stderr || ''}`.trim().split('\n').slice(0, 25).join('\n'))
  }
}
console.log(failed ? `${failed} PostgreSQL check(s) failed` : 'Requested PostgreSQL checks passed')
if (!only.length) console.log(`Optional isolated checks not run: ${OPTIONAL_CHECKS.join(', ')}`)
process.exit(failed ? 1 : 0)
