import { db } from '@/platform/database/prisma'
import { logEvent } from '@/platform/observability/logger'
import { invocationPurpose, type AiOutcome, type AiUsage } from '../domain/telemetry'

type Meta = { purpose?: unknown; provider: string; model: string; kind?: 'text' | 'image'; transport?: 'api' | 'personal' }
type Fact = { usage?: AiUsage }
let warned = false
const unavailable = () => { if (!warned) { warned = true; logEvent('warn', 'ai.monitoring_unavailable', { reason: 'storage_unavailable' }) } }

/** An observation failure never retries inference, leaks input or interrupts the caller. */
export async function observeAi<T>(meta: Meta, work: (attempt: () => void, usage: (value: AiUsage | undefined) => void) => Promise<T>): Promise<{ value: T; observationId?: string }> {
  const started = Date.now(); let id: string | undefined, attempts = 0, facts: Fact = {}
  try { id = (await db.aiInvocation.create({ data: { purpose: invocationPurpose(meta.purpose), provider: meta.provider.slice(0, 60), model: meta.model.slice(0, 200), kind: meta.kind || 'text', transport: meta.transport || 'api' } })).id } catch { unavailable() }
  const finish = async (status: 'SUCCEEDED' | 'FAILED', error?: unknown) => {
    if (!id) return
    const e = error as { status?: unknown; credentialReason?: unknown } | undefined
    const errorKind = ['auth', 'quota', 'rate', 'unavailable'].includes(String(e?.credentialReason)) ? String(e?.credentialReason) : error ? 'request_failed' : ''
    try { await db.aiInvocation.updateMany({ where: { id, status: 'RUNNING' }, data: { status, finishedAt: new Date(), durationMs: Math.min(2_147_483_647, Math.max(0, Date.now() - started)), attempts, ...facts.usage, errorKind, errorStatus: typeof e?.status === 'number' && e.status >= 400 && e.status <= 599 ? e.status : null } }) } catch { unavailable() }
  }
  try { const value = await work(() => { attempts++ }, usage => { facts = { usage } }); await finish('SUCCEEDED'); return { value, ...(id ? { observationId: id } : {}) } }
  catch (error) { await finish('FAILED', error); throw error }
}

export async function supportOutcome(id: string | undefined, outcome: AiOutcome) {
  if (!id) return
  try { await db.aiInvocation.updateMany({ where: { id, purpose: 'support', status: 'SUCCEEDED' }, data: { outcome } }) } catch { unavailable() }
}
