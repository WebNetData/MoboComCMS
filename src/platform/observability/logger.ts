import { recordError } from '@/platform/observability/metrics'

const REDACT = /password|secret|token|authorization|cookie|api[_-]?key|private[_-]?key/i

function safeValue(value: unknown, depth = 0): unknown {
  if (depth > 5) return '[max-depth]'
  if (value instanceof Error) return { name: value.name, message: value.message }
  if (typeof value === 'bigint') return value.toString()
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => safeValue(item, depth + 1))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = REDACT.test(key) ? '[redacted]' : safeValue(item, depth + 1)
    }
    return out
  }
  if (typeof value === 'string' && value.length > 2000) return `${value.slice(0, 2000)}…`
  return value
}

export function requestIdFrom(headers: Headers | { get(name: string): string | null | undefined }) {
  return headers.get('x-request-id')?.trim() || 'unknown'
}

export function logEvent(
  level: 'info' | 'warn' | 'error',
  event: string,
  fields: Record<string, unknown> = {},
) {
  const record = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...safeValue(fields) as Record<string, unknown>,
  })
  if (level === 'error') {
    const f = fields as Record<string, unknown>
    recordError(event, String((f.error instanceof Error ? f.error.message : f.error) ?? f.message ?? ''), String(f.path ?? ''))
    console.error(record)
  } else if (level === 'warn') console.warn(record)
  else console.info(record)
}
