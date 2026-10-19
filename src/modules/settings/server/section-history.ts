import { createHash } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { auditAdminStrict, type AdminAuditInput } from '@/platform/audit/server'
import { updateJsonSetting } from '@/modules/settings/server'
import { recordRevision, RevisionError, type RestoreCommit } from '@/modules/content/server/revisions'
import type { Snapshot } from '@/modules/content/domain/revisions'

export type SectionSettingsContext = Pick<AdminAuditInput, 'req' | 'actor'> & { expected?: string | null }
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
export const sectionSettingsRevision = (value: object) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const snapshot = (value: object): Snapshot => Object.fromEntries(Object.entries(value).map(([key, item]) => [key, item !== null && typeof item === 'object' ? JSON.stringify(item) : item]))

/** Normalizers own the known shape; retain future metadata on object/list entries by stable identity. */
function keepFuture(previous: unknown, next: unknown): unknown {
  if (Array.isArray(next)) return next.map((item, index) => {
    if (!object(item)) return item
    const old = Array.isArray(previous) ? item.key !== undefined || item.id !== undefined ? previous.find(row => object(row) && (item.key !== undefined ? row.key === item.key : row.id === item.id)) : previous[index] : undefined
    return keepFuture(old, item)
  })
  if (!object(next)) return next
  const out = object(previous) ? { ...previous } : {}
  for (const [key, item] of Object.entries(next)) out[key] = keepFuture(out[key], item)
  return out
}

/** A history adapter for an existing typed owner, not a registry of settings or permissions. */
export function createSectionSettingsHistory<T extends object>(key: string, entityType: string, normalize: (input: unknown) => T, auditMetadata: (settings: T) => Record<string, unknown> = () => ({})) {
  const shape = normalize({}) as Record<string, unknown>
  const parse = (raw: string | undefined): Record<string, unknown> => {
    if (raw === undefined) return {}
    try { const value: unknown = JSON.parse(raw); if (object(value)) return value } catch { /* refuse overwriting corrupt state */ }
    throw new RevisionError('تنظیمات ذخیره‌شده نیاز به بررسی دارد؛ چیزی تغییر نکرد', 409)
  }
  async function read(tx: Prisma.TransactionClient = db): Promise<T> { return normalize(parse((await tx.setting.findUnique({ where: { key } }))?.value)) }
  async function current() { return snapshot(await read()) }
  async function change(input: unknown, commit?: (tx: Prisma.TransactionClient, before: Snapshot, after: Snapshot, settings: T) => Promise<void>, expected?: string | null) {
    const value = typeof input === 'string' ? parse(input) : input
    if (!object(value)) throw new RevisionError('تنظیمات معتبر نیست', 422)
    const patch = Object.fromEntries(Object.keys(shape).filter(field => Object.hasOwn(value, field)).map(field => [field, value[field]]))
    return updateJsonSetting(key, async (stored, tx) => {
      const before = normalize(stored)
      if (expected && expected !== sectionSettingsRevision(before)) throw new RevisionError('تنظیمات هم‌زمان تغییر کرده است؛ صفحه را تازه کنید. تغییرات شما در فرم مانده است', 409)
      const after = normalize({ ...before, ...patch }) as T & Record<string, unknown>
      for (const field of Object.keys(patch)) stored[field] = keepFuture(stored[field], after[field])
      const settings = normalize(stored)
      await commit?.(tx, snapshot(before), snapshot(settings), settings)
      return settings
    })
  }
  async function save(input: unknown, context?: SectionSettingsContext) {
    return change(input, context ? async (tx, before, after, settings) => {
      await recordRevision({ entityType, entityId: 1, before, after, actor: context.actor, client: tx, strict: true })
      await auditAdminStrict({ req: context.req, actor: context.actor, action: `${entityType.replace(/^settings-/, '')}.settings.update`, targetType: 'setting', targetId: 0, metadata: auditMetadata(settings) }, tx)
    } : undefined, context?.expected)
  }
  async function restore(id: number, state: Snapshot, commit: RestoreCommit) {
    if (id !== 1) throw new RevisionError('تنظیمات پیدا نشد', 404)
    const patch: Record<string, unknown> = {}
    for (const field of Object.keys(shape)) {
      if (!Object.hasOwn(state, field)) continue
      const sample = shape[field], value = state[field]
      try {
        if (typeof sample === 'object') {
          const parsed: unknown = JSON.parse(String(value))
          if (Array.isArray(sample) ? !Array.isArray(parsed) : !object(parsed)) throw Error('shape')
          patch[field] = parsed
        } else {
          if (typeof value !== typeof sample || (typeof value === 'number' && !Number.isFinite(value))) throw Error('shape')
          patch[field] = value
        }
      } catch { throw new RevisionError('نسخهٔ تنظیمات معتبر نیست؛ چیزی تغییر نکرد', 422) }
    }
    let before: Record<string, unknown> = {}, after: Record<string, unknown> = {}
    await change(patch, async (tx, prior, next) => { before = prior; after = next; await commit(tx, prior, next) })
    return { before, after }
  }
  return { read, current, save, restore }
}
