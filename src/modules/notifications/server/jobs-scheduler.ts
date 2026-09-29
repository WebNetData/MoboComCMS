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
    // Newsletter campaigns, a batch per minute within the email daily cap.
    name: 'newsletter', everyMs: 60_000,
    run: async () => (await import('@/modules/mail/server/newsletter')).runNewsletter(),
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
