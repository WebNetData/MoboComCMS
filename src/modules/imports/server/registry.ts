import type { Action, Counters, FieldDef, FieldPolicy, ImportSettings, Message, PreviewCard, PreviewLine, SourceItem } from '@/modules/imports/domain/types'
import type { MediaResult } from '@/modules/imports/server/media'

/**
 * Import adapters: the business rules of one destination (store products,
 * magazine posts, films…). The engine owns parsing, mapping, the field
 * policy, jobs, media, progress, reports and rollback; an adapter only says
 * which fields it takes, how to find an existing row, what a record will do
 * (plan, read-only — also the dry run) and how to write it (apply).
 *
 *   registerImporter({ id: 'hosting-plan', label: '…', fields: [...], plan, apply, rollback })
 *
 * Nothing in the engine changes when an adapter is added.
 */

/** An adapter option shown in the wizard (product type, attribute groups, author…). */
export interface OptionDef {
  key: string
  label: string
  type: 'select' | 'bool' | 'text' | 'number' | 'valueMap'
  choices?: { value: string; label: string }[]
  default?: unknown
  hint?: string
  /** Wizard step: 4 = relations, 8 = import options. */
  step: 4 | 8
  /** Only shown when another option has one of these values. */
  when?: { key: string; values: unknown[] }
  /** valueMap: the distinct values of this destination field's source column become the keys. */
  valuesOf?: string
  /** Loads choices from the database (attribute groups, users…). */
  dynamic?: boolean
  destructive?: boolean
}

/** Per-run services the engine gives adapters. */
export interface ImportContext {
  jobId: number | null
  actor: { id: number; email: string }
  dryRun: boolean
  settings: ImportSettings
  /** Run-wide cache: resolved categories, brands, groups, identities… (no N+1 across records). */
  cache: Map<string, unknown>
  /** Keys of rows the dry run would create, so "17 categories to create" counts each once. */
  planned: Set<string>
  /** Copies a remote image into the media library (apply only). */
  importImage: (url: string) => Promise<MediaResult>
  /** Remote image addresses already in the library (dry run counts). */
  knownImages: Set<string>
  /** The field policy, enforced: only the values this record may write (create, or update of `current`). */
  allow: (values: Record<string, unknown>, mode: 'create' | 'update', current?: Record<string, unknown>) => Record<string, unknown>
  allowVariant: (values: Record<string, unknown>, mode: 'create' | 'update', current?: Record<string, unknown>) => Record<string, unknown>
  /** Preview lines: every mapped field with IMPORTED / IGNORED / UNCHANGED. */
  previewLines: (fields: FieldDef[], values: Record<string, unknown>, allowed: Record<string, unknown>, format?: (key: string, value: unknown) => string) => PreviewLine[]
}

/** What one record will do. Produced without writing anything. */
export interface Plan {
  action: Action
  title: string
  sourceKey: string
  entityId?: number
  messages: Message[]
  preview: PreviewCard
  counters: Counters
  /** Adapter-private resolved data handed to apply(). */
  data?: unknown
}

/** A row the import created or changed, with what rollback needs. */
export type Change =
  | { kind: 'created'; entity: string; id: number; stamp?: string }
  | { kind: 'updated'; entity: string; id: number; before: Record<string, unknown>; after: Record<string, unknown> }

export interface ApplyResult {
  action: Action
  entityType: string
  entityId?: number
  changes: Change[]
  messages: Message[]
  counters: Counters
}

export interface RollbackResult { undone: number; conflicts: string[] }

export interface ImportAdapter {
  id: string
  label: string
  description: string
  /** Singular name of what a record becomes ("محصول", "مطلب"). */
  entity: string
  /** Module that must be on for this destination (null = always). */
  module: string | null
  fields: FieldDef[]
  variantFields?: FieldDef[]
  supports: { variants?: boolean; attributes?: boolean; specs?: boolean }
  /** How an existing row is recognised, in order (shown in the wizard). */
  identity: string[]
  options: OptionDef[]
  normalizeOptions(raw: Record<string, unknown>): Record<string, unknown>
  /** Implicit fields in use with these settings (e.g. "variants" when variants are configured). */
  implicitActive?(settings: ImportSettings): string[]
  /** Choices for dynamic options. */
  choices?(key: string): Promise<{ value: string; label: string }[]>
  /** Batch lookups for a slice of items before planning them (identities, relations). */
  prepare?(items: SourceItem[], values: Record<string, unknown>[], ctx: ImportContext): Promise<void>
  /** Typed, policy-free values in; what would happen out. Must not write. */
  plan(item: SourceItem, values: Record<string, unknown>, variantValues: Record<string, unknown>[], ctx: ImportContext): Promise<Plan>
  /** Writes one record (its own transaction(s)); values are already filtered by the field policy. */
  apply(item: SourceItem, plan: Plan, ctx: ImportContext): Promise<ApplyResult>
  /** Undoes one record's changes where it is still safe (rows changed since are reported, not overwritten). */
  rollback(changes: Change[]): Promise<RollbackResult>
}

const registry = new Map<string, ImportAdapter>()

export function registerImporter(adapter: ImportAdapter) {
  if (!/^[a-z][a-z0-9-]{1,39}$/.test(adapter.id)) throw new Error(`invalid importer id: ${adapter.id}`)
  if (new Set(adapter.fields.map((field) => field.key)).size !== adapter.fields.length) throw new Error(`duplicate field in importer ${adapter.id}`)
  registry.set(adapter.id, adapter)
}

export const getImporter = (id: string) => registry.get(id) || null
export const listImporters = () => [...registry.values()]

/** The field policy as the adapter sees it, for building its preview lines. */
export type Policies = Record<string, FieldPolicy>
