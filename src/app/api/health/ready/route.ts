import { NextResponse } from 'next/server'
import { databaseReady } from '@/platform/health/readiness'

export const dynamic = 'force-dynamic'

export async function GET() {
  const ready = await databaseReady()
  return NextResponse.json(
    { ok: ready, database: ready ? 'ready' : 'unavailable' },
    { status: ready ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  )
}
