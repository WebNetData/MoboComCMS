// Public: what the shop tells the browser about the bot. No secrets — just
// whether a bot exists and its handle, so the profile page and the mini app can
// decide what to render.
import { NextResponse } from 'next/server'
import { telegramConfig } from '@/modules/notifications/server/telegram'

export const dynamic = 'force-dynamic'

export async function GET() {
  const cfg = await telegramConfig()
  return NextResponse.json(
    { enabled: cfg.ready, botUsername: cfg.username || '' },
    { headers: { 'cache-control': 'no-store' } }
  )
}
