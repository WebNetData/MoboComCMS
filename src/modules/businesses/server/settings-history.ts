import type { NextRequest } from 'next/server'
import type { AdminAuditInput } from '@/platform/audit/server'
import { getExtensionState, saveExtensionState } from '@/extensions/server/state'
import { recordRevision, RevisionError, type RestoreCommit } from '@/modules/content/server/revisions'
import type { Snapshot } from '@/modules/content/domain/revisions'
// These are the current audited non-secret policy definitions; lifecycle/identity stay outside history.
const keys = ['moderate-reviews', 'allow-suggestions', 'allow-claims', 'allow-reports', 'allow-purchase-proofs'] as const
const safe = (settings: Record<string, unknown>): Snapshot => Object.fromEntries(keys.map(key => [key, settings[key] !== false]))
export const businessSettingsState = async () => safe((await getExtensionState('businesses', [], undefined, true)).settings)
export async function saveBusinessSettings(req: NextRequest, actor: AdminAuditInput['actor'], input: Parameters<typeof saveExtensionState>[1]) {
  return saveExtensionState('businesses', input, { beforeCommit: async (tx, before, after) => {
    await recordRevision({ entityType: 'settings-businesses', entityId: 1, before: safe(before.settings), after: safe(after.settings), actor, client: tx, strict: true })
    const { auditAdminStrict } = await import('@/platform/audit/server')
    await auditAdminStrict({ req, actor, action: 'businesses.settings.update', targetType: 'setting', targetId: 'extension.businesses.state.v1' }, tx)
  } })
}
export async function restoreBusinessSettings(id: number, state: Snapshot, commit: RestoreCommit) {
  if (id !== 1) throw new RevisionError('not found', 404)
  const settings: Record<string, unknown> = {}
  for (const key of keys) if (Object.hasOwn(state, key)) {
    if (typeof state[key] !== 'boolean') throw new RevisionError('نسخهٔ سیاست کسب‌وکار معتبر نیست.', 422)
    settings[key] = state[key]
  }
  let before: Snapshot = {}, after: Snapshot = {}
  await saveExtensionState('businesses', { settings }, { beforeCommit: async (tx, prior, next) => { before = safe(prior.settings); after = safe(next.settings); await commit(tx, before, after) } })
  return { before, after }
}
