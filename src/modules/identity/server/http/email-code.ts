import type { NextRequest } from 'next/server'
import { clientIp } from '@/platform/http/rate-limit'
import { ok, err } from '@/platform/http/response'
import { requestEmailCode } from '@/modules/identity/server/email-otp'
import { SecurityError } from '@/modules/identity/server/account-security'
import { verifyTurnstile } from '@/modules/identity/server/turnstile'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!await verifyTurnstile(body?.turnstileToken, req.headers, 'login')) return err('اعتبارسنجی امنیتی را کامل کنید', 400)
  try { return ok(await requestEmailCode({ email: body?.email, ip: clientIp(req.headers) })) }
  catch (error) { return err(error instanceof SecurityError ? error.message : 'ارسال کد انجام نشد', error instanceof SecurityError ? error.status : 500) }
}
