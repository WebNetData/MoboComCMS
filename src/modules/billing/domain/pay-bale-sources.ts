import { baleBinding, type BaleBinding } from './pay-bale'

export type BaleServerSource = BaleBinding & { id: string; secret: string; verified: boolean; enabled: boolean }
type Environment = Record<string, string | undefined>
const keys = ['id', 'alias', 'instanceId', 'accountId', 'bankPeerId', 'bankAccountId', 'ownerUserId', 'secret', 'enabled', 'verified']
const validSecret = (value: unknown): value is string => typeof value === 'string' && /^[\x20-\x7e]{32,256}$/.test(value)

/** Reject duplicate decoded keys before JSON.parse can silently overwrite them. */
function uniqueKeys(raw: string): boolean {
  let at = 0
  const whitespace = () => { while (/[\t\n\r ]/.test(raw[at] || '\0')) at++ }
  const string = (): string => {
    const start = at++
    while (at < raw.length) {
      if (raw[at] === '\\') { at += 2; continue }
      if (raw[at++] === '"') return JSON.parse(raw.slice(start, at)) as string
    }
    throw new Error('unterminated string')
  }
  const value = (depth: number): void => {
    if (depth > 4) throw new Error('depth')
    whitespace()
    if (raw[at] === '"') { string(); return }
    if (raw[at] === '{') {
      at++; whitespace(); const seen = new Set<string>()
      if (raw[at] === '}') { at++; return }
      do {
        whitespace(); if (raw[at] !== '"') throw new Error('key')
        const key = string(); if (seen.has(key)) throw new Error('duplicate'); seen.add(key)
        whitespace(); if (raw[at++] !== ':') throw new Error('colon')
        value(depth + 1); whitespace()
        if (raw[at] === '}') { at++; return }
        if (raw[at++] !== ',') throw new Error('comma')
      } while (at < raw.length)
    } else if (raw[at] === '[') {
      at++; whitespace(); if (raw[at] === ']') { at++; return }
      do {
        value(depth + 1); whitespace()
        if (raw[at] === ']') { at++; return }
        if (raw[at++] !== ',') throw new Error('comma')
      } while (at < raw.length)
    } else {
      const start = at
      while (at < raw.length && !/[\s,\]}]/.test(raw[at])) at++
      JSON.parse(raw.slice(start, at)); return
    }
    throw new Error('end')
  }
  try { value(0); whitespace(); return at === raw.length } catch { return false }
}

export function baleSourceConfiguration(env: Environment): { sources: BaleServerSource[]; invalid: boolean } {
  const raw = env.MOBOCOM_PAY_BALE_SOURCES
  if (!raw) {
    const binding = baleBinding(env), secret = env.MOBOCOM_PAY_BALE_WEBHOOK_SECRET
    return { sources: binding && secret ? [{ ...binding, id: 'legacy', secret, enabled: true, verified: env.MOBOCOM_PAY_BALE_VERIFIED === 'true' }] : [], invalid: false }
  }
  const invalid = { sources: [], invalid: true }
  if (Buffer.byteLength(raw, 'utf8') > 65536 || !uniqueKeys(raw)) return invalid
  let records: unknown
  try { records = JSON.parse(raw) } catch { return invalid }
  if (!Array.isArray(records) || records.length < 1 || records.length > 32) return invalid
  const sources: BaleServerSource[] = [], ids = new Set<string>(), instances = new Set<string>(), accounts = new Set<string>(), banks = new Set<number>()
  for (const entry of records) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) || Object.keys(entry).length !== keys.length || keys.some(key => !Object.hasOwn(entry, key))) return invalid
    const e = entry as Record<string, unknown>
    if (typeof e.id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(e.id) || e.id === 'legacy' ||
      typeof e.alias !== 'string' || typeof e.instanceId !== 'string' || typeof e.accountId !== 'string' || typeof e.bankPeerId !== 'string' ||
      typeof e.bankAccountId !== 'number' || typeof e.ownerUserId !== 'number' || !validSecret(e.secret) || typeof e.enabled !== 'boolean' || typeof e.verified !== 'boolean') return invalid
    const binding = baleBinding({ MOBOCOM_PAY_BALE_ENABLED: 'true', MOBOCOM_PAY_BALE_SESSION: e.alias, MOBOCOM_PAY_BALE_INSTANCE: e.instanceId,
      MOBOCOM_PAY_BALE_ACCOUNT: e.accountId, MOBOCOM_PAY_BALE_BANK_PEER: e.bankPeerId, MOBOCOM_PAY_BALE_BANK_ACCOUNT: String(e.bankAccountId),
      MOBOCOM_PAY_BALE_OWNER_USER_ID: String(e.ownerUserId), MOBOCOM_PAY_BALE_WEBHOOK_SECRET: e.secret })
    if (!binding) return invalid
    const account = `${binding.alias}\0${binding.accountId}`
    if (ids.has(e.id) || instances.has(binding.instanceId) || accounts.has(account) || banks.has(binding.bankAccountId)) return invalid
    ids.add(e.id); instances.add(binding.instanceId); accounts.add(account); banks.add(binding.bankAccountId)
    sources.push({ ...binding, id: e.id, secret: e.secret, enabled: e.enabled, verified: e.verified })
  }
  return { sources, invalid: false }
}

export function configuredBaleSources(env: Environment): BaleServerSource[] { return baleSourceConfiguration(env).sources }
export function selectedBaleSource(env: Environment, id?: string): BaleServerSource | null {
  const sources = configuredBaleSources(env)
  return sources.find(source => source.enabled && source.id === (id === undefined ? 'legacy' : id)) || null
}
