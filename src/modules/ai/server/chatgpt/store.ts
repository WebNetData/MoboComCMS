import { randomUUID } from 'node:crypto'
import { AsyncLocalStorage } from 'node:async_hooks'
import { db } from '@/platform/database/prisma'
import { updateJsonSetting } from '@/modules/settings/server'
import { decryptPanelCredential, encryptPanelCredential } from '@/modules/providers/server/panel-credentials'
import { ChatGptError, type State } from './types'
import { auditAdminStrict, type AdminAuditInput } from '@/platform/audit/server'

const audit = new AsyncLocalStorage<AdminAuditInput>()
export const withConnectionAudit = <T>(input: AdminAuditInput, work: () => Promise<T>) => audit.run(input, work)

const key = (id: number) => {
  if (!Number.isSafeInteger(id) || id <= 0) throw new ChatGptError('حساب مدیریت معتبر نیست', 403)
  return `ai.chatgpt.personal.v1.${id}`
}
const empty = (): State => ({ version: 1, hostId: `urn:uuid:${randomUUID()}`, enabled: false, active: '', model: '', accounts: [] })
function decode(value: Record<string, unknown>): State {
  if (!Object.keys(value).length) return empty()
  try {
    if (typeof value.encrypted !== 'string') throw new Error('invalid')
    const state = JSON.parse(decryptPanelCredential(value.encrypted)) as State
    if (state.version !== 1 || !/^urn:uuid:[a-f0-9-]{36}$/.test(state.hostId) || !Array.isArray(state.accounts) || state.accounts.length > 8 || typeof state.enabled !== 'boolean') throw new Error('invalid')
    return state
  } catch { throw new ChatGptError('اتصال ذخیره‌شدهٔ ChatGPT قابل خواندن نیست؛ اطلاعات قبلی حفظ شد', 503) }
}
export async function readState(id: number) {
  const row = await db.setting.findUnique({ where: { key: key(id) } })
  try { return row ? decode(JSON.parse(row.value)) : empty() } catch (error) {
    if (error instanceof ChatGptError) throw error
    throw new ChatGptError('خواندن اتصال ChatGPT انجام نشد', 503)
  }
}
export async function changeState<T>(id: number, work: (state: State) => T | Promise<T>): Promise<T> {
  return updateJsonSetting(key(id), async (value, tx) => {
    const state = decode(value), result = await work(state)
    value.encrypted = encryptPanelCredential(JSON.stringify(state))
    const context = audit.getStore(); if (context) await auditAdminStrict(context, tx)
    return result
  })
}
export function publicState(state: State) {
  return { enabled: state.enabled, active: state.active, model: state.model,
    accounts: state.accounts.map(a => ({ id: a.clientId, label: `${a.email || 'حساب ChatGPT'} · ${a.clientId.slice(-6)}`, connected: !!a.refresh })),
    connected: !!state.accounts.find(a => a.clientId === state.active)?.refresh }
}
