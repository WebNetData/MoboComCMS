import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { clientIp } from '@/platform/http/rate-limit'
import { requireUser } from '@/modules/identity/server/access'
import { verifyHuman } from '@/modules/identity/server/human-check'
import { SmsError, attachPhone, requestOtp, verifyOtp } from '@/modules/sms/server/sms'
import { displayMobile } from '@/modules/sms/domain/sms'

const fail = (error: unknown) => error instanceof SmsError ? err(error.message, error.status) : err('انجام نشد', 500)

/** POST { phone, turnstileToken? } — sends a login code. The code is checked by the "sms-otp" sign-in provider. */
export async function POST_login_code(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!await verifyHuman(body?.turnstileToken, req.headers, 'entry')) return err('اعتبارسنجی امنیتی را کامل کنید', 400, { code: 'HUMAN_CHECK' })
  try {
    const sent = await requestOtp({ phone: body?.phone, purpose: 'LOGIN', ip: clientIp(req.headers) })
    return ok({ ...sent, display: displayMobile(sent.phone) })
  } catch (error) { return fail(error) }
}

/** Signed-in users: POST { phone } sends a verification code; PUT { phone, code } links the number. */
export async function POST_verify_code(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return err('unauthorized', 401)
  const body = await req.json().catch(() => null)
  try {
    const sent = await requestOtp({ phone: body?.phone, purpose: 'VERIFY', ip: clientIp(req.headers), userId: user.id })
    return ok({ ...sent, display: displayMobile(sent.phone) })
  } catch (error) { return fail(error) }
}

export async function PUT_verify_code(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return err('unauthorized', 401)
  const body = await req.json().catch(() => null)
  try {
    const phone = await verifyOtp({ phone: body?.phone, code: body?.code, purpose: 'VERIFY', userId: user.id })
    await attachPhone(user.id, phone)
    return ok({ phone, display: displayMobile(phone) })
  } catch (error) { return fail(error) }
}
