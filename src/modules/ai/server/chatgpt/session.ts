import { createHash, randomBytes } from 'node:crypto'
import { acquireLease } from '@/modules/settings/server'
import { AUTH, RESOURCE, CALLBACK, SCOPES, ChatGptError, validClient } from './types'
import { changeState, readState } from './store'
import { discovery, fixedFetch, tokenFields, tokenGrant, verifyIdentity } from './network'

export async function beginLogin(id: number, clientId: string) {
  return changeState(id, state => {
    const account = clientId ? state.accounts.find(a => a.clientId === clientId) : undefined
    if (clientId && !account) throw new ChatGptError('حساب انتخاب‌شده پیدا نشد', 404)
    if (!account && state.accounts.length >= 8) throw new ChatGptError('حداکثر هشت ثبت حساب مجاز است')
    const pending = { state: randomBytes(32).toString('base64url'), nonce: randomBytes(32).toString('base64url'), verifier: randomBytes(48).toString('base64url'), clientId: account?.clientId || '', subject: account?.subject || '', expires: Date.now() + 10 * 60_000 }
    state.pending = pending
    delete state.completing
    const url = new URL(`${AUTH}/api/accounts/authorize`)
    url.search = new URLSearchParams({ client_id: pending.clientId || 'dynamic_agent_client', ext_agent_host_id: state.hostId, response_type: 'code', redirect_uri: CALLBACK, scope: SCOPES, resource: RESOURCE, state: pending.state, nonce: pending.nonce, code_challenge_method: 'S256', code_challenge: createHash('sha256').update(pending.verifier).digest('base64url'), ...(!pending.clientId ? { agent_name_hint: 'MoboComCMS' } : {}), ...(account?.email ? { login_hint: account.email } : {}) }).toString()
    // No retained ID token is exposed in this browser-facing authorization URL.
    return { url: url.toString(), state: pending.state, expires: pending.expires }
  })
}
export async function finishLogin(id: number, input: Record<string, unknown>) {
  const pending = await changeState(id, state => {
    const attempt = state.pending
    if (!attempt || attempt.state !== input.state || attempt.expires < Date.now()) throw new ChatGptError('درخواست ورود منقضی یا قبلاً مصرف شده است', 409)
    delete state.pending
    state.completing = attempt.state
    return attempt
  })
  if (input.error) throw new ChatGptError('ورود یا اجازهٔ مصرف سهمیهٔ ChatGPT تأیید نشد', 403)
  const clientId = typeof input.client_id === 'string' ? input.client_id : pending.clientId
  if (!validClient(clientId) || (pending.clientId && clientId !== pending.clientId) || typeof input.code !== 'string' || !input.code || input.code.length > 8000) throw new ChatGptError('پاسخ ورود ChatGPT معتبر نیست', 401)
  const data = await tokenGrant({ grant_type: 'authorization_code', client_id: clientId, code: input.code, code_verifier: pending.verifier, redirect_uri: CALLBACK })
  if (typeof data.id_token !== 'string') throw new ChatGptError('هویت ورود ChatGPT دریافت نشد', 401)
  const identity = await verifyIdentity(data.id_token, { ...pending, clientId }), tokens = tokenFields(data)
  await changeState(id, state => {
    if (state.completing !== pending.state || state.pending || state.accounts.some(a => a.clientId === clientId && a.subject !== identity.subject)) throw new ChatGptError('اتصال هم‌زمان تغییر کرده است؛ دوباره وارد شوید', 409)
    const account = { clientId, ...identity, ...tokens, idToken: data.id_token as string }
    state.accounts = [...state.accounts.filter(a => a.clientId !== clientId), account]
    state.active = clientId; state.enabled = false; state.model = ''
    delete state.completing
  })
}
export async function activeAccount(id: number) {
  let state = await readState(id), account = state.accounts.find(a => a.clientId === state.active)
  if (!account?.refresh) throw new ChatGptError('ابتدا حساب شخصی ChatGPT را متصل کنید', 409)
  if (account.expires > Date.now() + 90_000) return account
  if (!await acquireLease(`chatgpt.refresh.${id}`, 120_000)) throw new ChatGptError('تمدید اتصال ChatGPT در حال انجام است؛ کمی بعد تلاش کنید', 409)
  // Read again after winning the cluster-wide lease; another request may already have rotated it.
  state = await readState(id); account = state.accounts.find(a => a.clientId === state.active)
  if (!account?.refresh) throw new ChatGptError('اتصال ChatGPT قطع شده است', 409)
  if (account.expires > Date.now() + 90_000) return account
  const previous = account, data = await tokenGrant({ grant_type: 'refresh_token', client_id: account.clientId, refresh_token: account.refresh }), tokens = tokenFields(data, account)
  const renewed = { ...previous, ...tokens }
  await changeState(id, current => {
    const found = current.accounts.find(a => a.clientId === previous.clientId)
    if (current.active !== previous.clientId || found?.refresh !== previous.refresh) throw new ChatGptError('اتصال ChatGPT هم‌زمان تغییر کرد؛ اطلاعات تازه حفظ شد', 409)
    Object.assign(found, renewed)
  })
  return renewed
}
export async function disconnect(id: number) {
  const account = await changeState(id, state => {
    const selected = state.accounts.find(a => a.clientId === state.active), copy = selected ? { ...selected } : null
    if (selected) { selected.access = ''; selected.refresh = ''; selected.idToken = ''; selected.expires = 0 }
    state.enabled = false; delete state.pending; delete state.completing
    return copy
  })
  if (!account?.refresh) return true
  try {
    const meta = await discovery(); if (typeof meta.revocation_endpoint !== 'string') return false
    const response = await fixedFetch(meta.revocation_endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: account.refresh, token_type_hint: 'refresh_token', client_id: account.clientId }) })
    await response.body?.cancel().catch(() => undefined); return response.status === 200
  } catch { return false }
}
