import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'mobocomcms',
    release: process.env.APP_RELEASE || 'unknown',
    uptimeSec: Math.floor(process.uptime()),
  }, { headers: { 'Cache-Control': 'no-store' } })
}
