import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { auditSystemStrict } from '@/platform/audit/server'
import { assertFieldSelections } from '@/modules/imports/server/field-inputs'
import { destinationActor } from '@/modules/imports/server/authority'
import { claimImportUpdate, importContentState } from '@/modules/imports/server/edit-protection'
import { countImages, identityOf, loadIdentities, saveIdentity, seenBefore } from '../common'
import { normalizeName, toText } from '@/modules/imports/domain/values'
import type { FieldDef, SourceItem } from '@/modules/imports/domain/types'
import type { Change, ImportAdapter, ImportContext, Plan } from '@/modules/imports/server/registry'

export type Reader = Prisma.TransactionClient | typeof db
export type ProfileRow = Record<string, unknown> & { id: number; slug: string }
export type ProfileHooks = { beforeWrite(tx: Prisma.TransactionClient): Promise<void>; afterWrite(tx: Prisma.TransactionClient, id: number): Promise<void> }
export interface ProfileSpec {
  id: string; model: string; label: string; entity: string; module: string; requiredModules?: readonly string[]; permissions: readonly string[]
  fields: FieldDef[]; identity: string[]; titleKey: string; defaultStatus?: string
  read(id: number, reader: Reader): Promise<ProfileRow | null>
  matches(values: Record<string, unknown>, reader: Reader): Promise<ProfileRow[]>
  input(row: ProfileRow | null): Record<string, unknown>
  assertIdentity?(values: Record<string, unknown>, previous: ProfileRow): void
  validate(input: Record<string, unknown>, previous: ProfileRow | null, reader: Reader, allowed?: Record<string, unknown>): Promise<Record<string, unknown>>
  media?(input: Record<string, unknown>, allowed: Record<string, unknown>, ctx: ImportContext, messages: Plan['messages'], counters: Plan['counters']): Promise<Record<string, unknown>>
  mediaUrls?(input: Record<string, unknown>): string[]
  write(input: Record<string, unknown>, previous: ProfileRow | null, ctx: ImportContext, hooks: ProfileHooks): Promise<number>
  snapshot?(row: ProfileRow | null, input: Record<string, unknown>, reader: Reader): Promise<Record<string, unknown>>
  undo(change: Change, ctx: ImportContext): Promise<void>
}

export const jsonObject = (value: unknown, label: string): Record<string, unknown> => {
  let object = value
  if (typeof object === 'string') { try { object = JSON.parse(object) } catch { throw new Error(`${label}: JSON معتبر نیست`) } }
  if (!object || typeof object !== 'object' || Array.isArray(object)) throw new Error(`${label}: یک شیء JSON لازم است`)
  return object as Record<string, unknown>
}
export const serial = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
export const equal = (a: unknown, b: unknown) => JSON.stringify(serial(a)) === JSON.stringify(serial(b))
export function failure(item: SourceItem, text: string): Plan {
  const title = toText(item.values.title || item.values.name, 120) || `ردیف ${item.rows[0]}`
  const messages: Plan['messages'] = [{ level: 'error', text }]
  return { action: 'FAIL', title, sourceKey: '', messages, counters: {}, preview: { title, action: 'FAIL', lines: [], messages } }
}

/** Three profile destinations share only Imports mechanics; validation/writes stay in their actual owners. */
export function profileImporter(spec: ProfileSpec): ImportAdapter {
  const key = `profiles:${spec.id}`
  async function resolve(values: Record<string, unknown>, ctx: ImportContext) {
    const ext = toText(values.externalId, 190), id = ext ? identityOf(ctx, spec.model, ext) : undefined
    const candidates = await spec.matches(values, db)
    const bound = id ? await spec.read(id, db) : null
    if (id && !bound) throw new Error('شناسهٔ خارجی به رکورد حذف‌شده اشاره دارد؛ منبع و شناسه را بررسی کنید')
    const slug = String(values.slug || '')
    const explicit = slug ? candidates.filter(row => row.slug === slug) : []
    if (bound && slug && slug !== bound.slug) throw new Error('شناسهٔ خارجی و نامک به یک هویت اشاره نمی‌کنند؛ نشانی موجود تغییر نمی‌کند')
    if (bound) return bound
    if (explicit.length === 1) return explicit[0]
    if (candidates.length > 1) throw new Error('چند مورد با این مشخصات پیدا شد؛ شناسهٔ خارجی یا نامک دقیق را مشخص کنید')
    if (candidates.length === 1) {
      if (slug && candidates[0].slug !== slug) throw new Error('هویت موجود با نامک ورودی متفاوت است؛ نامک ثبت‌شده را وارد کنید')
      return candidates[0]
    }
    return null
  }
  return {
    id: spec.id, label: spec.label, description: `ورود کنترل‌شدهٔ ${spec.entity} با هویت ثابت، پیش‌نمایش دقیق و حفظ ویرایش‌های محلی`, entity: spec.entity,
    module: spec.module, requiredModules: spec.requiredModules, permissions: spec.permissions, strictValues: true, fields: spec.fields,
    supports: {}, identity: spec.identity,
    options: spec.defaultStatus ? [{ key: 'defaultStatus', label: 'وضعیت موارد جدید بدون ستون وضعیت', type: 'select', step: 8, default: 'DRAFT', choices: [{ value: 'DRAFT', label: 'پیش‌نویس' }, { value: 'PUBLISHED', label: 'منتشرشده' }] }] : [],
    normalizeOptions: raw => spec.defaultStatus ? { defaultStatus: raw.defaultStatus === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT' } : {},
    async prepare(_items, values, ctx) { await loadIdentities(ctx, spec.model, values.map(value => toText(value.externalId, 190)).filter(Boolean)) },
    async plan(item, values, _variants, ctx) {
      try {
        const previous = await resolve(values, ctx), title = toText(values[spec.titleKey] || previous?.[spec.titleKey], 160) || `ردیف ${item.rows[0]}`
        const sourceKey = toText(values.externalId || previous?.slug || values.slug || normalizeName(title), 190)
        const identifiers = [values.externalId ? `external:${values.externalId}` : '', values.slug ? `slug:${values.slug}` : '', !values.externalId && !values.slug ? `name:${normalizeName(title)}` : '', previous ? `id:${previous.id}` : ''].filter(Boolean)
        let duplicate: number | null = null
        for (const identifier of identifiers) { const first = seenBefore(ctx, `${key}:${identifier}`, item.index); if (first !== null) duplicate ??= first }
        const messages: Plan['messages'] = [], counters: Plan['counters'] = {}
        const action = duplicate !== null || previous && ctx.settings.existing === 'skip' ? 'SKIP' : previous ? 'UPDATE' : 'CREATE'
        if (duplicate !== null) { counters.duplicates = 1; messages.push({ level: 'warning', text: `تکراری در فایل مانند رکورد ${duplicate + 1}؛ دوباره نوشته نمی‌شود` }) }
        if (action === 'SKIP') return { action, title, sourceKey, entityId: previous?.id, messages, counters, preview: { title, action, lines: [], messages } }
        if (previous) spec.assertIdentity?.(values, previous)
        const current = spec.input(previous), allowed = ctx.allow(values, previous ? 'update' : 'create', current)
        if (!previous) for (const field of spec.fields.filter(field => field.requiredOnCreate)) if (!(field.key in allowed)) throw new Error(`${field.label} برای ساخت لازم است`)
        const input = await spec.validate({ ...(spec.defaultStatus ? { status: ctx.settings.options.defaultStatus || 'DRAFT' } : {}), ...current, ...allowed }, previous, db, allowed)
        countImages(ctx, spec.mediaUrls?.(allowed) || [], counters)
        const lines = ctx.previewLines(spec.fields, values, allowed, (_name, value) => typeof value === 'object' ? toText(JSON.stringify(value), 180) : toText(value, 180))
        const planned: Plan = { action: previous && !Object.keys(allowed).length ? 'SKIP' : action, title, sourceKey, entityId: previous?.id, messages, counters, preview: { title, action, lines, messages }, data: { values, previous, input } }
        return planned
      } catch (error) { return failure(item, error instanceof Error ? error.message : 'ردیف معتبر نیست') }
    },
    async apply(item, planned, ctx) {
      const data = planned.data as { values: Record<string, unknown>; previous: ProfileRow | null; input: Record<string, unknown> }
      const previous = data.previous, current = spec.input(previous), allowed = ctx.allow(data.values, previous ? 'update' : 'create', current)
      const messages: Plan['messages'] = [], counters: Plan['counters'] = {}, changes: Change[] = []
      let input = data.input, before: Record<string, unknown> | null = null, writtenAt: string | undefined, contentFingerprint: string | undefined
      if (spec.media) input = await spec.media(input, allowed, ctx, messages, counters)
      const identityCacheKey = `identity:${spec.model}`, cachedIdentity = ctx.cache.get(identityCacheKey) as Map<string,number> | undefined
      const identitiesBefore = cachedIdentity ? new Map(cachedIdentity) : undefined
      let id: number
      try { id = await spec.write(input, previous, ctx, {
        async beforeWrite(tx) {
          await destinationActor(ctx, tx)
          await assertFieldSelections(spec.id, item.values, data.values, tx, String(ctx.settings.options.categorySeparator || '>'))
          const actual = previous ? await spec.read(previous.id, tx) : null
          if (previous && (!actual || !equal(actual, previous))) throw new Error('رکورد یا روابط آن هم‌زمان تغییر کرده‌اند؛ دوباره پیش‌نمایش بگیرید')
          if (previous) spec.assertIdentity?.(data.values, actual!)
          // Re-run managed vocabulary and immutable-identity checks in the same transaction as the owner write.
          await spec.validate(input, actual, tx, allowed)
          before = spec.snapshot ? await spec.snapshot(actual, input, tx) : actual ? serial(actual) : null
          if (previous) await claimImportUpdate(tx, ctx, spec.model, previous.id)
        },
        async afterWrite(tx, savedId) {
          const saved = await spec.read(savedId, tx)
          if (!saved) throw new Error('ثبت مقصد تأیید نشد')
          const after = spec.snapshot ? await spec.snapshot(saved, input, tx) : serial(saved)
          if (previous) changes.push({ kind: 'updated', entity: spec.model, id: savedId, before: before!, after })
          else changes.push({ kind: 'created', entity: spec.model, id: savedId, stamp: JSON.stringify({ before, after }) })
          await saveIdentity(tx, ctx, spec.model, toText(data.values.externalId, 190), savedId)
          const state = await importContentState(spec.id, savedId, tx)
          writtenAt = state?.updatedAt.toISOString(); contentFingerprint = state?.fingerprint
          await auditSystemStrict({ actor: ctx.actor, action: 'import.profile.save', targetType: spec.model, targetId: savedId, metadata: { jobId: ctx.jobId, adapter: spec.id, action: planned.action } }, tx)
        },
      }) } catch (error) { if (identitiesBefore) ctx.cache.set(identityCacheKey, identitiesBefore); else ctx.cache.delete(identityCacheKey); throw error }
      seenBefore(ctx, `${key}:id:${id}`, item.index)
      return { action: previous ? 'UPDATE' : 'CREATE', entityType: spec.model, entityId: id, changes, messages, counters, writtenAt, contentFingerprint }
    },
    async rollback(changes, ctx) {
      if (!ctx) return { undone: 0, conflicts: ['اطلاعات اختیار اجرای بازگردانی موجود نیست'] }
      const conflicts: string[] = []; let undone = 0
      for (const change of [...changes].reverse()) {
        if (change.entity !== spec.model) { conflicts.push('نوع سابقه با مقصد یکی نیست'); continue }
        try { await spec.undo(change, ctx); undone++ } catch (error) { conflicts.push(error instanceof Error ? error.message : 'بازگردانی انجام نشد') }
      }
      return { undone, conflicts }
    },
  }
}
