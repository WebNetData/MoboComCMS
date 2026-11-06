import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { moduleGuard } from '@/extensions/server/modules'
import { rateLimitStrict } from '@/platform/http/rate-limit'
import { JsonBodyError, readJsonObject } from '@/platform/http/read-json'
import { auditAdmin } from '@/platform/audit/server'
import { ChatGptError, validModel } from '../chatgpt/types'
import { changeState, publicState, readState, withConnectionAudit } from '../chatgpt/store'
import { beginLogin, disconnect, finishLogin } from '../chatgpt/session'
import { modelsFor } from '../chatgpt/inference'
import { localLoginHelper } from '../chatgpt/helper'

const safeFail = (error: unknown) => error instanceof ChatGptError ? err(error.message, error.status) : err('عملیات اتصال شخصی ChatGPT انجام نشد؛ دوباره تلاش کنید', 503)
export async function GET(req: NextRequest) {
  const off = await moduleGuard('ai-assistant'); if (off) return off
  const actor = await requirePerm(req, 'settings.manage'); if (!actor) return err('forbidden', 403)
  try { const response = ok(publicState(await readState(actor.id))); response.headers.set('Cache-Control', 'private, no-store'); return response } catch (error) { return safeFail(error) }
}
export async function POST(req: NextRequest) {
  const off = await moduleGuard('ai-assistant'); if (off) return off
  const actor = await requirePerm(req, 'settings.manage'); if (!actor) return err('forbidden', 403)
  if (!(await rateLimitStrict(`ai:chatgpt:${actor.id}`, 30, 60_000)).ok) return err('درخواست‌های اتصال زیاد است؛ کمی صبر کنید', 429)
  let input: Record<string, unknown>
  try { input = await readJsonObject(req, 20_000) } catch (error) { return error instanceof JsonBodyError ? err(error.message, error.status) : err('درخواست معتبر نیست') }
  try {
    let extra: Record<string, unknown> = {}
    await withConnectionAudit({ req, actor, action: `ai.chatgpt.${String(input.action)}`, targetType: 'user', targetId: actor.id }, async () => {
    switch (input.action) {
      case 'begin': {
        if (input.personalUse !== true) throw new ChatGptError('استفادهٔ شخصی از سهمیه برای ابزارهای مدیریت را تأیید کنید')
        const origin = new URL(process.env.NEXTAUTH_URL || '').origin
        if (!origin.startsWith('https://') && process.env.NODE_ENV === 'production') throw new ChatGptError('نشانی امن سایت را تنظیم کنید')
        const login = await beginLogin(actor.id, String(input.account || ''))
        extra = { helper: localLoginHelper(login.url, login.state, origin), expires: login.expires }; break
      }
      case 'finish': await finishLogin(actor.id, input); break
      case 'models': extra = { models: await modelsFor(actor.id) }; break
      case 'save': {
        const model = String(input.model || ''), enabled = input.enabled === true
        if (!validModel(model)) throw new ChatGptError('مدل حساب را انتخاب کنید')
        const selected = (await readState(actor.id)).active
        const models = await modelsFor(actor.id); if (!models.some(m => m.id === model)) throw new ChatGptError('مدل برای این حساب در دسترس نیست')
        await changeState(actor.id, state => { if (state.active !== selected || !state.accounts.find(a => a.clientId === selected)?.refresh) throw new ChatGptError('حساب هم‌زمان تغییر کرد', 409); state.model = model; state.enabled = enabled }); break
      }
      case 'disable': await changeState(actor.id, state => { state.enabled = false }); break
      case 'select': await changeState(actor.id, state => {
        if (!state.accounts.some(a => a.clientId === input.account)) throw new ChatGptError('حساب پیدا نشد', 404)
        state.active = String(input.account); state.enabled = false; state.model = ''; delete state.pending; delete state.completing
      }); break
      case 'disconnect': extra = { revoked: await disconnect(actor.id) }; break
      default: throw new ChatGptError('unknown action', 404)
    }
    })
    // Deliberately exclude OAuth payloads, codes and account identifiers from logs/audit.
    await auditAdmin({ req, actor, action: `ai.chatgpt.${String(input.action)}`, targetType: 'user', targetId: actor.id })
    const response = ok({ ...publicState(await readState(actor.id)), ...extra }); response.headers.set('Cache-Control', 'private, no-store'); return response
  } catch (error) { return safeFail(error) }
}
