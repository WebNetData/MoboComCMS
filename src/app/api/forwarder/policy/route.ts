import { NextResponse } from 'next/server'
import { getAutomaticForwarderPolicy } from '@/modules/forwarder/server/forwarder'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(await getAutomaticForwarderPolicy(), { headers: { 'Cache-Control': 'no-store' } })
}
