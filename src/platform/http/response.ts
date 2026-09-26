import { NextResponse } from 'next/server'

export type ApiErrorBody = {
  error: string
  code?: string
  [key: string]: unknown
}

/** JSON-safe projection for Prisma BigInt fields and nested DTOs. */
export function jsonSafe<T>(value: T): T {
  if (typeof value === 'bigint') return value.toString() as T
  if (value instanceof Date) return value.toISOString() as T
  if (Array.isArray(value)) return value.map((item) => jsonSafe(item)) as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) out[key] = jsonSafe(item)
    return out as T
  }
  return value
}

export function err(message: string, status = 400, meta?: Record<string, unknown>) {
  return NextResponse.json<ApiErrorBody>(jsonSafe({ error: message, ...(meta || {}) }), { status })
}

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(jsonSafe(data), { status })
}
