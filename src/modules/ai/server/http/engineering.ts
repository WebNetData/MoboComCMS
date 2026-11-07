import type { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { readJsonObject, JsonBodyError } from '@/platform/http/read-json'
import { mutationOrigin } from '@/platform/http/origin-policy'
import { rateLimitStrict } from '@/platform/http/rate-limit'
import { EngineeringError } from '../../domain/engineering'
import { engineeringActor, engineeringView, createEngineeringRun, decideEngineeringRun } from '../engineering/service'
import { saveEngineeringPolicy } from '../engineering/policy'

const response = (value: unknown) => { const out = ok(value); out.headers.set('Cache-Control', 'private, no-store'); return out }
const failure = (error: unknown) => error instanceof EngineeringError || error instanceof JsonBodyError ? err(error.message, error.status, error instanceof EngineeringError && error.code ? { code: error.code } : {}) : err('عملیات مهندسی انجام نشد؛ نتیجهٔ ذخیره‌شده را تازه کنید', 503)
export async function GET(req: NextRequest) { try { return response(await engineeringView(req)) } catch (e) { return failure(e) } }
export async function POST(req: NextRequest) {
  if (mutationOrigin({ origin: req.headers.get('origin'), secFetchSite: req.headers.get('sec-fetch-site'), referer: req.headers.get('referer'), hasCookies: true, hosts: [req.headers.get('host'), req.nextUrl.host, process.env.NEXTAUTH_URL ? new URL(process.env.NEXTAUTH_URL).host : null] }) !== 'allow') return err('Origin معتبر لازم است', 403)
  try {
    const actor = await engineeringActor(req)
    if (!(await rateLimitStrict(`ai:engineering:${actor.id}`, 20, 10 * 60000)).ok) return err('سقف درخواست مهندسی پر شده است؛ کمی بعد تلاش کنید', 429)
    const input = await readJsonObject(req, 150000)
    if (input.action === 'settings') { await saveEngineeringPolicy(input.policy, { req, actor, action: 'ai.engineering.settings', targetType: 'setting', targetId: 'ai.engineering.v1' }); return response(await engineeringView(req)) }
    if (input.action === 'request') return response(await createEngineeringRun(req, input))
    if (['cancel', 'promote', 'rollback', 'repair'].includes(String(input.action))) return response(await decideEngineeringRun(req, input))
    return err('عملیات شناخته‌شده نیست', 400)
  } catch (e) { return failure(e) }
}
