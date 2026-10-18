import type { Prisma } from '@prisma/client'
import { randomUUID, createHash } from 'node:crypto'
import { db } from '@/platform/database/prisma'
import { updateJsonSetting } from '@/modules/settings/server'
import { auditAdminStrict, type AdminAuditInput } from '@/platform/audit/server'
import { recordRevision, RevisionError, type RestoreCommit } from '@/modules/content/server/revisions'
import type { Snapshot } from '@/modules/content/domain/revisions'
import { DEFAULT_FORUM_SETTINGS, REACTION_EMOJI, normalizeForumSettings, sameReactionWeights } from '@/modules/forum/domain/community'

export const FORUM_SETTINGS_KEY = 'forum.settings.v1'
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const snapshotOf = (input: Record<string, unknown>) => Object.fromEntries(Object.entries(normalizeForumSettings(input)).map(([key, value]) => [key, value && typeof value === 'object' ? JSON.stringify(value) : value]))
export const forumSettingsRevision = (value: Record<string, unknown>) => createHash('sha256').update(JSON.stringify(normalizeForumSettings(value))).digest('hex')
export async function forumSettingsState(tx: Prisma.TransactionClient = db) {
  const row = await tx.setting.findUnique({ where: { key: FORUM_SETTINGS_KEY } })
  if (!row) return snapshotOf({})
  let value: unknown
  try { value = JSON.parse(row.value) } catch { throw new RevisionError('تنظیمات تالار نیاز به بررسی دارد', 409) }
  if (!object(value)) throw new RevisionError('تنظیمات تالار معتبر نیست', 409)
  return snapshotOf(value)
}

/** Replace known fields, recursively preserving stored future fields outside the current owner's schema. */
function keepUnknown(stored: Record<string, unknown>, next: Record<string, unknown>, known: Record<string, unknown>): Record<string, unknown> {
  const out = { ...stored }
  for (const key of Object.keys(known)) {
    if (!Object.hasOwn(next, key)) { delete out[key]; continue }
    out[key] = object(next[key]) && object(known[key]) ? keepUnknown(object(stored[key]) ? stored[key] : {}, next[key], known[key]) : next[key]
  }
  return out
}

async function change(input: Record<string, unknown>, commit?: RestoreCommit, expected?: string | null) {
  return updateJsonSetting(FORUM_SETTINGS_KEY, async (stored, tx) => {
    const before = normalizeForumSettings(stored), previous = snapshotOf(stored)
    if (expected && expected !== forumSettingsRevision(stored)) throw new RevisionError('تنظیمات تالار هم‌زمان تغییر کرده است؛ صفحه را تازه کنید', 409)
    const patch = Object.fromEntries(Object.keys(DEFAULT_FORUM_SETTINGS).filter(key => Object.hasOwn(input, key)).map(key => [key, input[key]]))
    const merged = { ...before, ...patch, ...(object(patch.trust) ? { trust: { ...before.trust, ...Object.fromEntries(Object.entries(patch.trust).map(([level, values]) => [level, { ...before.trust[Number(level) as 1 | 2 | 3], ...(object(values) ? values : {}) }])) } } : {}), ...(object(patch.watchedWords) ? { watchedWords: { ...before.watchedWords, ...patch.watchedWords } } : {}) }
    const after = normalizeForumSettings(merged)
    for (const key of Object.keys(patch) as Array<keyof typeof after>) {
      const known = key === 'reactionWeights' ? Object.fromEntries(Object.keys(REACTION_EMOJI).map(key => [key, 1])) : before[key]
      if (key === 'levels' && Array.isArray(stored.levels)) {
        const prior = stored.levels
        stored.levels = after.levels.map(level => ({ ...prior.find(value => object(value) && value.id === level.id), ...level }))
      } else stored[key] = object(after[key]) && object(known) ? keepUnknown(object(stored[key]) ? stored[key] : {}, after[key], known) : after[key]
    }
    // Recount all stored reactions atomically with changing their weights, including on restore.
    if (!sameReactionWeights(before, after)) await tx.backgroundJob.create({ data: { kind: 'forum.reputation-recount', payload: JSON.stringify({ cursor: 0 }), dedupeKey: `forum-reputation:${randomUUID()}` } })
    await commit?.(tx, previous, snapshotOf(stored))
    return { before: previous, after: snapshotOf(stored), settings: after }
  })
}

export async function saveForumSettings(input: Record<string, unknown>, context?: Pick<AdminAuditInput, 'req' | 'actor'>, expected?: string | null) {
  const result = await change(input, context ? async (tx, before, after) => {
    await recordRevision({ entityType: 'settings-forum', entityId: 1, before, after, actor: context.actor, client: tx, strict: true })
    await auditAdminStrict({ ...context, action: 'forum.settings.update', targetType: 'setting', targetId: FORUM_SETTINGS_KEY }, tx)
  } : undefined, expected)
  return result.settings
}

export async function restoreForumSettings(id: number, snapshot: Snapshot, commit: RestoreCommit) {
  if (id !== 1) throw new RevisionError('تنظیمات پیدا نشد', 404)
  const patch: Record<string, unknown> = {}
  for (const key of Object.keys(DEFAULT_FORUM_SETTINGS)) {
    if (!Object.hasOwn(snapshot, key)) continue
    const value = snapshot[key]
    try { patch[key] = typeof DEFAULT_FORUM_SETTINGS[key as keyof typeof DEFAULT_FORUM_SETTINGS] === 'object' ? JSON.parse(String(value)) : value } catch { throw new RevisionError('نسخهٔ تنظیمات معتبر نیست', 422) }
  }
  return change(patch, commit)
}
