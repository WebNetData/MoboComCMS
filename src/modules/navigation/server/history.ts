import { normalizeMegaConfig } from '@/modules/navigation/domain/megamenu'
import { getMegaConfig, saveMegaConfig } from '@/modules/navigation/server/megamenu'
import { RevisionError, type RestoreCommit } from '@/modules/content/server/revisions'
import type { Snapshot } from '@/modules/content/domain/revisions'
import { configurationSnapshot, configurationValue } from '@/modules/settings/server/configuration-history'
import { isDeepStrictEqual } from 'node:util'
export const navigationSettingsState = async () => configurationSnapshot(await getMegaConfig(true))
export async function restoreNavigationSettings(id: number, state: Snapshot, commit: RestoreCommit) {
  if (id !== 1) throw new RevisionError('not found', 404)
  const raw = configurationValue(state), value = normalizeMegaConfig(raw)
  if (!isDeepStrictEqual(JSON.parse(JSON.stringify(value)), raw)) throw new RevisionError('نسخهٔ منو معتبر نیست؛ چیزی تغییر نکرد.', 422)
  let before: Snapshot = {}, after: Snapshot = {}
  await saveMegaConfig(value, { beforeCommit: async (tx, next, previous) => { before = configurationSnapshot(previous); after = configurationSnapshot(next); await commit(tx, before, after) } })
  return { before, after }
}
