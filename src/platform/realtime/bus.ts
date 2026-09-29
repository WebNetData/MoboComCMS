import { EventEmitter } from 'node:events'
import { logEvent } from '@/platform/observability/logger'

/**
 * Realtime event bus for server-sent events (live chat and the like). With
 * REDIS_URL every app instance shares events through Redis pub/sub, so a
 * visitor connected to one instance hears an operator who replied on another;
 * without it, events stay inside this process (one instance installs).
 *
 * Events are hints ("something changed"), not the source of truth: listeners
 * read the database for the actual data, so a lost event is healed by the next
 * one or by the client's reconnect catch-up.
 */

export type BusEvent = Record<string, unknown> & { type: string }
type Handler = (event: BusEvent) => void

const PREFIX = `${process.env.REDIS_PREFIX || 'mobo:'}rt:`

type RedisClient = import('ioredis').Redis
interface Bus {
  kind: 'redis' | 'memory'
  local: EventEmitter
  publisher?: RedisClient
  subscriber?: RedisClient
}

const globalBus = globalThis as unknown as { __mobocomBus?: Promise<Bus> }

async function connect(): Promise<Bus> {
  const local = new EventEmitter()
  local.setMaxListeners(0)
  const url = process.env.REDIS_URL
  if (!url) return { kind: 'memory', local }
  try {
    const { default: Redis } = await import('ioredis')
    const options = { maxRetriesPerRequest: 2, lazyConnect: true, connectTimeout: 3000 }
    const publisher = new Redis(url, { ...options, enableOfflineQueue: false })
    const subscriber = new Redis(url, options)
    for (const client of [publisher, subscriber]) client.on('error', (error) => logEvent('warn', 'realtime.redis_error', { error: error.message }))
    await Promise.all([publisher.connect(), subscriber.connect()])
    subscriber.on('message', (channel: string, raw: string) => {
      if (!channel.startsWith(PREFIX)) return
      try { local.emit(channel.slice(PREFIX.length), JSON.parse(raw)) } catch { /* ignore a malformed event */ }
    })
    return { kind: 'redis', local, publisher, subscriber }
  } catch (error) {
    logEvent('error', 'realtime.redis_unavailable', { error: error instanceof Error ? error.message : String(error) })
    return { kind: 'memory', local }
  }
}

function bus() {
  globalBus.__mobocomBus ??= connect()
  return globalBus.__mobocomBus
}

/** Sends an event to every subscriber of `channel` on every instance. Never throws. */
export async function publish(channel: string, event: BusEvent) {
  try {
    const current = await bus()
    if (current.kind === 'redis' && current.publisher) {
      await current.publisher.publish(PREFIX + channel, JSON.stringify(event))
      return
    }
    current.local.emit(channel, event)
  } catch (error) {
    logEvent('warn', 'realtime.publish_failed', { channel, error: error instanceof Error ? error.message : String(error) })
  }
}

/** Listens to `channel`; the returned function stops listening. */
export async function subscribe(channel: string, handler: Handler): Promise<() => void> {
  const current = await bus()
  const first = current.local.listenerCount(channel) === 0
  current.local.on(channel, handler)
  if (current.kind === 'redis' && current.subscriber && first) await current.subscriber.subscribe(PREFIX + channel).catch(() => undefined)
  return () => {
    current.local.off(channel, handler)
    if (current.kind === 'redis' && current.subscriber && current.local.listenerCount(channel) === 0) void current.subscriber.unsubscribe(PREFIX + channel).catch(() => undefined)
  }
}

export async function busKind() {
  return (await bus()).kind
}

const encoder = new TextEncoder()

/**
 * A server-sent events response. `start` wires the stream (send events,
 * subscribe) and returns a cleanup. A comment line every 20 s keeps proxies
 * from closing the connection; after `maxMs` the stream ends and the browser's
 * EventSource reconnects on its own (with Last-Event-ID for catch-up).
 */
export function sseResponse(signal: AbortSignal, start: (send: (event: string, data: unknown, id?: string | number) => void) => Promise<() => void>, maxMs = 5 * 60_000) {
  let cleanup: (() => void) | null = null
  let closed = false
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (text: string) => { if (!closed) { try { controller.enqueue(encoder.encode(text)) } catch { close() } } }
      const close = () => {
        if (closed) return
        closed = true
        clearInterval(ping)
        clearTimeout(limit)
        cleanup?.()
        try { controller.close() } catch { /* already closed */ }
      }
      const ping = setInterval(() => write(': ping\n\n'), 20_000)
      const limit = setTimeout(close, maxMs)
      signal.addEventListener('abort', close)
      write('retry: 3000\n\n')
      const send = (event: string, data: unknown, id?: string | number) => write(`${id !== undefined ? `id: ${id}\n` : ''}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
      try {
        cleanup = await start(send)
        if (closed) cleanup()
      } catch (error) {
        logEvent('warn', 'realtime.stream_failed', { error: error instanceof Error ? error.message : String(error) })
        close()
      }
    },
    cancel() { closed = true; cleanup?.() },
  })
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, no-transform',
      Connection: 'keep-alive',
      // nginx and compression must not buffer the stream.
      'X-Accel-Buffering': 'no',
      'Content-Encoding': 'none',
    },
  })
}
