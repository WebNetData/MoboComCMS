import type { DriverConnection } from '@/modules/hosting/server/drivers/contract'
import type { CloudOperationInput, CloudOperationResult } from '@/modules/hosting/server/drivers/operations'
import { hostingRequest } from '@/modules/hosting/server/drivers/http'
type Reply = { headers: Map<string, string>; body: string; ok: boolean }
function parse(text: string, status: number): Reply {
  const split = text.search(/\r?\n\r?\n/),
    head = split < 0 ? text : text.slice(0, split),
    body = split < 0 ? '' : text.slice(split).trim(),
    headers = new Map<string, string>()
  let valid = true
  for (const line of head.split(/\r?\n/)) {
    if (!line.trim()) continue
    const m = /^([A-Za-z][A-Za-z0-9-]*):\s*(.*?)\s*$/.exec(line)
    if (!m || headers.has(m[1].toLowerCase())) {
      valid = false
      break
    }
    headers.set(m[1].toLowerCase(), m[2])
  }
  return {
    headers,
    body,
    ok:
      valid &&
      status === 200 &&
      !headers.has('error') &&
      (!headers.has('result') || headers.get('result') === 'ACK') &&
      (!headers.has('status-code') || /^(0|1\d{3})$/.test(headers.get('status-code')!)),
  }
}
const unknown = (): CloudOperationResult => ({ state: 'UNKNOWN', code: 'REGISTRY_RESULT_UNKNOWN' })
export async function jokerOperation(
  c: DriverConnection,
  i: CloudOperationInput,
  reference: string,
  inspect: boolean,
): Promise<CloudOperationResult> {
  let sid = ''
  const call = async (command: string, fields: Record<string, string>) => {
    const r = await hostingRequest('https://dmapi.joker.com/request/' + command, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ ...fields, ...(sid ? { 'auth-sid': sid } : {}) }).toString(),
      timeoutMs: 30000,
    })
    return parse(r.text, r.status)
  }
  try {
    const login = await call(
      'login',
      c.config.authMode === 'PASSWORD' ? { username: c.username, password: c.secret } : { 'api-key': c.secret },
    )
    sid = login.headers.get('auth-sid') || ''
    if (!login.ok || !/^[A-Za-z0-9._-]{1,256}$/.test(sid)) return { state: 'FAILED', code: 'REGISTRY_LOGIN' }
    if (!['REGISTER', 'RENEW'].includes(i.action) || !/^[a-z0-9-]+\.(com|net|org|info|biz)$/.test(i.name))
      return { state: 'FAILED', code: 'REGISTRY_TLD_UNSUPPORTED' }
    const listed = await call('query-domain-list', { pattern: i.name, from: '0', to: '5' })
    if (!listed.ok) return inspect ? unknown() : { state: 'FAILED', code: 'REGISTRY_PREFLIGHT' }
    const line = listed.body
        .split(/\r?\n/)
        .map((l) => l.trim().split(/\s+/))
        .find((parts) => parts[0] === i.name),
      expiry = line ? new Date(line[1]) : null
    if (inspect) {
      const result = await call('result-list', {
        ...(reference ? { procid: reference } : {}),
        objid: i.name,
        cltrid: i.operationId,
        rtype: i.action === 'REGISTER' ? 'domain-register' : 'domain-renew',
      })
      if (!result.ok) return unknown()
      const replies = result.body
        .split(/\r?\n/)
        .map((line) => line.trim().split(/\s+/))
        .filter(
          (parts) =>
            (!reference || parts.includes(reference)) &&
            parts.includes(i.operationId) &&
            parts.includes(i.action === 'REGISTER' ? 'domain-register' : 'domain-renew'),
        )
      if (replies.length > 1) return unknown()
      if (!reference && replies.length === 1) {
        const procId = replies[0][2]
        if (!/^[A-Za-z0-9._:-]{1,128}$/.test(procId)) return unknown()
        reference = procId
      }
      if (replies.length !== 1 || !replies[0].includes('ack'))
        return { state: 'PENDING', code: 'REGISTRY_PENDING', reference }
      if (!line || !expiry || !Number.isFinite(expiry.getTime()))
        return { state: 'PENDING', code: 'REGISTRY_PROPAGATING', reference }
      if (i.action === 'RENEW' && expiry < new Date(String(i.config.targetExpiry)))
        return { state: 'PENDING', code: 'REGISTRY_PROPAGATING', reference }
      return {
        state: 'DONE',
        code: 'REGISTRY_CONFIRMED',
        reference,
        resourceId: i.name,
        data: { expiresAt: expiry.toISOString(), nameservers: i.config.nameservers as string[] },
      }
    }
    if (i.action === 'REGISTER' && line) return { state: 'FAILED', code: 'REGISTRY_ALREADY_OWNED' }
    if (i.action === 'RENEW' && (!line || !expiry || expiry.toISOString() !== String(i.config.previousExpiry)))
      return { state: 'FAILED', code: 'REGISTRY_EXPIRY_CHANGED' }
    const limit = String(i.config.jokerMaxPrice || ''),
      currency = String(i.config.jokerCurrency || '')
    if (!/^\d{1,6}(\.\d{1,2})?$/.test(limit) || Number(limit) <= 0 || !['USD', 'EUR'].includes(currency))
      return { state: 'FAILED', code: 'REGISTRY_BUDGET_CONFIG' }
    const priceType = i.action === 'REGISTER' ? 'create' : 'renew',
      price = await call('domain-check', {
        domain: i.name,
        period: String(Number(i.years) * 12),
        'check-price': priceType,
      })
    const priceValue =
      price.headers.get('domain-price-' + priceType) ||
      new RegExp('^domain-price-' + priceType + ':\\s*(.+)$', 'm').exec(price.body)?.[1] ||
      ''
    const quoted = /^([0-9]+(?:\.[0-9]{1,2})?)\s+([A-Z]{3})\s+([0-9]+)y$/.exec(priceValue)
    if (
      !price.ok ||
      !quoted ||
      quoted[2] !== currency ||
      Number(quoted[1]) > Number(limit) ||
      Number(quoted[3]) !== i.years
    )
      return { state: 'FAILED', code: 'REGISTRY_PRICE_REVIEW' }
    const handle = String(i.config.ownerHandle || ''),
      ns = i.config.nameservers as string[]
    if (i.action === 'REGISTER' && (!/^[A-Za-z0-9-]{3,64}$/.test(handle) || !Array.isArray(ns) || ns.length < 2))
      return { state: 'FAILED', code: 'REGISTRY_CONTACT_CONFIG' }
    const fields: Record<string, string> = {
      domain: i.name,
      'max-price': limit,
      privacy: i.action === 'REGISTER' ? 'none' : 'off',
      autorenew: '0',
      cltrid: i.operationId,
    }
    if (i.action === 'REGISTER')
      Object.assign(fields, {
        period: String(Number(i.years) * 12),
        status: 'production',
        'owner-c': handle,
        'admin-c': handle,
        'tech-c': handle,
        'billing-c': handle,
        'ns-list': ns.join(':'),
      })
    else fields.expyear = String(new Date(String(i.config.targetExpiry)).getUTCFullYear())
    try {
      const reply = await call(i.action === 'REGISTER' ? 'domain-register' : 'domain-renew', fields),
        ref = reply.headers.get('proc-id')
      if (!reply.ok) return { state: 'FAILED', code: 'REGISTRY_REQUEST_REFUSED' }
      return ref && /^[A-Za-z0-9._:-]{1,128}$/.test(ref)
        ? { state: 'PENDING', code: 'REGISTRY_PENDING', reference: ref }
        : unknown()
    } catch {
      return unknown()
    }
  } catch {
    return inspect ? unknown() : { state: 'FAILED', code: 'REGISTRY_PREFLIGHT' }
  } finally {
    if (sid)
      try {
        await call('logout', {})
      } catch {
        /* Session times out; no financial replay. */
      }
  }
}
