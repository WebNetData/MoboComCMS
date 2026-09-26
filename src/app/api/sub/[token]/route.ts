// Legacy subscription path — still served for links that are already in the
// wild. The real implementation is `serveSubscription` in `lib/subs.ts`; the
// short `/s/<token>` route is the one the dashboard hands out today.
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ error: 'پروفایل خام غیرفعال است؛ از برنامه Happ استفاده کنید.' }, { status: 410, headers: { 'cache-control': 'no-store' } })
}
