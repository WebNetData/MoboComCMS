import { logEvent } from '@/platform/observability/logger'
import { acquireLease } from '@/modules/settings/server'

/**
 * Built-in background jobs, so a plain server needs no cron:
 *  - order worker (payments, fulfillment, reservations) every minute
 *  - announcement queue every minute; search index + retention every 15 minutes
 * A database lease makes sure only one app instance runs each slot. Set
 * BACKGROUND_JOBS=false to switch this off when an external cron calls the
 * /api/internal/<job>/run routes instead.
 */

type Job = { name: string; everyMs: number; run: (tick: number) => Promise<unknown> }

const state = globalThis as typeof globalThis & { jobsTimer?: ReturnType<typeof setInterval>; jobsBusy?: Set<string>; jobsTick?: number }

const JOBS: Job[] = [
  {
    name: 'fulfillment', everyMs: 60_000,
    run: async () => (await import('@/modules/fulfillment/server/worker')).runFulfillmentWorker(20, 'scheduler'),
  },
  {
    name: 'engagement', everyMs: 60_000,
    // Every 15th minute also rebuilds the search index and prunes old stats.
    run: async (tick) => (await import('@/modules/content/server/jobs')).runEngagementJobs({ full: tick % 15 === 0 }),
  },
  {
    // Back-in-stock alerts, abandoned cart reminders and customer club points.
    name: 'store-marketing', everyMs: 60_000,
    run: async () => (await import('@/modules/store/server/marketing')).runMarketingJobs(),
  },
  {
    // Marketplace: seller sales that were paid and delivered but never reached the seller's ledger.
    name: 'marketplace', everyMs: 5 * 60_000,
    run: async () => (await import('@/modules/marketplace/server/marketplace')).recoverMarketplaceSales(),
  },
  {
    // Newsletter campaigns, a batch per minute within the email daily cap.
    name: 'newsletter', everyMs: 60_000,
    run: async () => (await import('@/modules/mail/server/newsletter')).runNewsletter(),
  },
  {
    // Membership: VIP gift days of paid orders that were never granted.
    name: 'membership-gifts', everyMs: 5 * 60_000,
    run: async () => (await import('@/modules/membership/server/membership')).recoverGiftMemberships(),
  },
  {
    // Background queue (heavy admin tasks) and a week of performance samples.
    name: 'queue', everyMs: 60_000,
    run: async (tick) => {
      const { runQueue } = await import('@/modules/operations/server/queue')
      if (tick % 60 === 0) await (await import('@/modules/operations/server/monitoring')).prunePerfSamples()
      return runQueue()
    },
  },
  {
    // Subscriptions: wallet renewals that stopped part-way and were not retried.
    name: 'renewals', everyMs: 5 * 60_000,
    run: async () => (await import('@/modules/subscriptions/server/renewal-recovery')).recoverPendingRenewals(),
  },
  {
    // Invoices: rate-bound ones that ran out of time or whose rate jumped, overdue ones, and recurring invoices that are due.
    name: 'invoice-rules', everyMs: 60_000,
    run: async () => { await (await import('@/modules/billing/server/invoice-rules')).processInvoiceRules() },
  },
  {
    // Bulk import: restarts import jobs whose queue chain was lost and prunes week-old drafts (the work itself runs on the queue).
    name: 'imports', everyMs: 5 * 60_000,
    run: async () => (await import('@/modules/imports/server/engine')).sweepImportJobs(),
  },
  {
    // Advertising: writes impression/click counters, ends finished campaigns, prunes old daily rows.
    name: 'ads', everyMs: 60_000,
    run: async (tick) => {
      const ads = await import('@/modules/ads/server/serving')
      await ads.flushAdStats()
      if (tick % 720 === 0) {
        const { db } = await import('@/platform/database/prisma')
        await db.adStatDaily.deleteMany({ where: { day: { lt: new Date(Date.now() - 800 * 86_400_000).toISOString().slice(0, 10) } } })
      }
    },
  },
  {
    // Repository: asks the vendor about each stored license once a day; a revoked license switches its package off.
    name: 'repository', everyMs: 24 * 3_600_000,
    run: async () => { await (await import('@/modules/repository/server/client')).refreshRepositoryLicenses() },
  },
  {
    // Updates: asks the release feed and tells administrators once when a newer version exists.
    name: 'updates', everyMs: 6 * 3_600_000,
    run: async () => { await (await import('@/modules/updater/server/service')).notifyNewVersion() },
  },
  {
    // Member notifications: removes notices past their keeping time and queues the day's summary emails (both off until set).
    name: 'notification-policy', everyMs: 30 * 60_000,
    run: async () => (await import('@/modules/notifications/server/policy')).runNotificationPolicy(),
  },
  {
    // Cinema: reads the people (director, cast) out of titles saved before people existed; nothing to do once all are read.
    name: 'cinema-people', everyMs: 5 * 60_000,
    run: async () => (await import('@/modules/cinema/server/people')).backfillCredits(),
  },
  {
    // Moderation: claims on waiting items that nobody finished for a week are closed.
    name: 'moderation-cases', everyMs: 6 * 3_600_000,
    run: async () => (await import('@/modules/moderation/server/cases')).closeAbandonedCases(),
  },
  {
    // Forms: attachments that were uploaded but never submitted are removed after a day.
    // Automation rules: waiting events, scans for what has waited too long, scheduled reports.
    name: 'automation', everyMs: 60_000,
    run: async () => { await (await import('@/modules/automation/server/engine')).processAutomation() },
  },
  {
    name: 'forms', everyMs: 3_600_000,
    run: async () => { await (await import('@/modules/forms/server/service')).pruneUploads(); const paid = await import('@/modules/forms/server/paid'); await paid.eraseFinishedSecrets(); await paid.releaseUnpaidSlots() },
  },
  {
    // Guest page cache: keeps the sections' entry pages warm and writes the visits served from the cache.
    name: 'pagecache', everyMs: 60_000,
    run: async () => {
      const cache = await import('@/modules/performance/server/pagecache')
      await cache.flushViews()
      await cache.runWarmJob()
    },
  },
  {
    // Live exchange rates; FX-priced products follow them (interval set in the currency page).
    name: 'fx', everyMs: 60_000,
    run: async () => (await import('@/modules/fx/server/fx')).runFxJob(),
  },
  {
    // New and edited content: copies images from other sites here and removes source names and links.
    name: 'scrub', everyMs: 5 * 60_000,
    run: async () => (await import('@/modules/downloads/server/scrub')).scrubRecent(),
  },
]

export function startJobScheduler() {
  if (state.jobsTimer || process.env.BACKGROUND_JOBS === 'false') return
  state.jobsBusy = new Set()
  state.jobsTick = 0
  const tick = async () => {
    const current = state.jobsTick = (state.jobsTick || 0) + 1
    for (const job of JOBS) {
      if (state.jobsBusy?.has(job.name)) continue
      state.jobsBusy?.add(job.name)
      try {
        // The lease is a little shorter than the interval so the next slot is free on time.
        if (await acquireLease(`jobs.${job.name}`, job.everyMs - 5_000)) await job.run(current)
      } catch (error) {
        logEvent('error', 'jobs.failed', { job: job.name, error })
      } finally {
        state.jobsBusy?.delete(job.name)
      }
    }
  }
  // First run shortly after boot, then every minute.
  setTimeout(() => void tick(), 20_000).unref?.()
  state.jobsTimer = setInterval(() => void tick(), 60_000)
  state.jobsTimer.unref?.()
}
