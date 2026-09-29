import { clientIp, rateLimitHit } from '@/platform/http/rate-limit'
import { extensionJson } from '@/extensions/sdk/server'
import type { PluginServerModule } from '@/extensions/server/types'

type Counter = { up: number; down: number }
type Votes = { pages: Record<string, Counter> }

const MAX_PAGES = 300
const empty = (): Votes => ({ pages: {} })

/** "/blog/x?utm=1#top" → "/blog/x"; anything that is not a plain site path becomes "/". */
export function cleanPath(value: unknown): string {
  const path = String(value ?? '/').split(/[?#]/)[0].slice(0, 160)
  return /^\/(?!\/)[A-Za-z0-9/_%.\-~]*$/.test(path) ? path : '/'
}

/**
 * Server contribution. Routes are served under /api/extensions/sample-feedback/… and only while the plugin is enabled.
 * `ctx.storage` is a small JSON store private to this plugin (values up to ~100 KB).
 */
export const plugin: PluginServerModule = {
  api: [
    {
      method: 'POST', path: '/vote', access: 'public',
      async handler(request, ctx) {
        // Public endpoints must defend themselves: limit by address and validate every field.
        if (!rateLimitHit(`sample-feedback:${clientIp(request.headers)}`, 20, 60_000).ok) return extensionJson({ error: 'too many requests' }, 429)
        const body = await request.json().catch(() => null) as { path?: unknown; value?: unknown } | null
        if (body?.value !== 'up' && body?.value !== 'down') return extensionJson({ error: 'invalid vote' }, 400)
        const path = cleanPath(body.path)
        const votes = (await ctx.storage.get<Votes>('votes')) ?? empty()
        // Keep the stored document small: once the page limit is reached, new pages are counted under "/other".
        const key = votes.pages[path] || Object.keys(votes.pages).length < MAX_PAGES ? path : '/other'
        const counter = votes.pages[key] ?? { up: 0, down: 0 }
        counter[body.value] += 1
        votes.pages[key] = counter
        // Read-modify-write is fine for a sample; a busy site would keep one row per page or use a database table.
        await ctx.storage.set('votes', votes)
        return extensionJson({ ok: true })
      },
    },
    {
      method: 'GET', path: '/summary', access: 'permission:sample-feedback.view',
      async handler(_request, ctx) {
        const votes = (await ctx.storage.get<Votes>('votes')) ?? empty()
        const pages = Object.entries(votes.pages).map(([path, c]) => ({ path, ...c })).sort((a, b) => b.up + b.down - (a.up + a.down))
        const totals = { up: pages.reduce((s, p) => s + p.up, 0), down: pages.reduce((s, p) => s + p.down, 0), orders: (await ctx.storage.get<number>('orders')) ?? 0 }
        return extensionJson({ totals, pages, lastRecount: (await ctx.storage.get<string>('lastRecount')) ?? '' })
      },
    },
    {
      method: 'POST', path: '/reset', access: 'permission:sample-feedback.manage',
      async handler(_request, ctx) {
        await ctx.storage.set('votes', empty())
        return extensionJson({ ok: true, by: ctx.actor?.email })
      },
    },
  ],

  // Events are fire-and-forget notifications from the Core: a failing handler never affects the order itself.
  events: {
    async 'order.created'(_payload, ctx) {
      await ctx.storage.set('orders', ((await ctx.storage.get<number>('orders')) ?? 0) + 1)
      // Slow work belongs in a durable job (retried, deduplicated), not in the handler.
      await ctx.enqueueJob('recount', {}, `recount:${new Date().toISOString().slice(0, 13)}`)
    },
  },

  jobs: {
    async recount(_payload, ctx) {
      await ctx.storage.set('lastRecount', new Date().toISOString())
    },
  },

  /** Runs before the Extension Manager saves the settings: check values that depend on each other. */
  validateSettings(settings) {
    const question = typeof settings.question === 'string' ? settings.question.trim() : ''
    if (!question) throw new Error('متن پرسش نباید خالی باشد')
    const thanks = typeof settings.thanks === 'string' ? settings.thanks : ''
    if (thanks.length > 200) throw new Error('پیام تشکر حداکثر ۲۰۰ نویسه باشد')
  },
}
