// IPPanel Edge API (https://edge.ippanel.com/v1). Authorization header is the
// raw API key from "User panel → Developers → Access keys". Responses are
// { data, meta: { status, message, message_code } }.

const BASE_URL = 'https://edge.ippanel.com/v1'
const TIMEOUT_MS = 15_000

export interface IppanelResult { ok: boolean; id: string; error: string }

type Envelope = { data?: { message_outbox_ids?: number[]; credit?: number } | null; meta?: { status?: boolean; message?: string } }

async function call(apiKey: string, path: string, init: { method: 'GET' | 'POST'; body?: unknown }): Promise<{ ok: boolean; body: Envelope | null; error: string }> {
  let response: Response
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method: init.method,
      headers: { Authorization: apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    })
  } catch {
    return { ok: false, body: null, error: 'اتصال به IPPanel برقرار نشد' }
  }
  const body = await response.json().catch(() => null) as Envelope | null
  const ok = response.ok && body?.meta?.status === true
  return { ok, body, error: ok ? '' : (body?.meta?.message || `IPPanel HTTP ${response.status}`).slice(0, 300) }
}

const outboxId = (body: Envelope | null) => String(body?.data?.message_outbox_ids?.[0] ?? '')

/** Plain text ("webservice") message to one or more recipients. */
export async function sendText(apiKey: string, from: string, recipients: string[], message: string): Promise<IppanelResult> {
  const res = await call(apiKey, '/api/send', { method: 'POST', body: { sending_type: 'webservice', from_number: from, message, params: { recipients } } })
  return { ok: res.ok, id: outboxId(res.body), error: res.error }
}

/** Approved pattern to a single recipient (delivered fast, not queued for review). */
export async function sendPattern(apiKey: string, from: string, recipient: string, code: string, params: Record<string, string>): Promise<IppanelResult> {
  const res = await call(apiKey, '/api/send', { method: 'POST', body: { sending_type: 'pattern', from_number: from, code, recipients: [recipient], params } })
  return { ok: res.ok, id: outboxId(res.body), error: res.error }
}

/** Account credit (Rial), used by the admin "test connection" button. */
export async function credit(apiKey: string): Promise<{ ok: boolean; credit: number; error: string }> {
  const res = await call(apiKey, '/api/payment/credit/mine', { method: 'GET' })
  return { ok: res.ok, credit: Number(res.body?.data?.credit) || 0, error: res.error }
}
