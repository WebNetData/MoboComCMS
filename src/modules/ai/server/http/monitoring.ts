import type { NextRequest } from 'next/server'
import { requirePerm } from '@/modules/identity/server/access'
import { moduleGuard } from '@/extensions/server/modules'
import { err, ok } from '@/platform/http/response'
import { aiMonitoring } from '../monitoring'

export async function GET(req: NextRequest) {
  const off = await moduleGuard('ai-assistant')
  if (off) return off
  if (!await requirePerm(req, 'settings.manage')) return err('دسترسی مجاز نیست', 403)
  try { return ok(await aiMonitoring({ days: req.nextUrl.searchParams.get('days'), purpose: req.nextUrl.searchParams.get('purpose') })) }
  catch { return err('گزارش فعلاً در دسترس نیست؛ وضعیت پایگاه داده و مهاجرت نسخه را بررسی کنید', 503) }
}
