/**
 * Bulk import: shared types. The engine (server/engine.ts) turns an uploaded
 * file into items with the admin's mapping, and hands each item to the
 * adapter of the destination section (server/adapters/*). Pure types and
 * limits only.
 */

/** Limits for untrusted files. */
export const LIMITS = {
  uploadBytes: 25 * 1024 * 1024,
  /** XLSX: uncompressed size of every part read, and the ratio that marks a ZIP bomb. */
  xlsxUnpackedBytes: 120 * 1024 * 1024,
  xlsxRatio: 250,
  xlsxEntries: 5000,
  xlsxSheets: 50,
  /** Every non-empty cell of the chosen sheet. */
  xlsxCells: 2_000_000,
  rows: 20_000,
  columns: 250,
  cellChars: 60_000,
  jsonDepth: 12,
  variantsPerItem: 100,
  imagesPerItem: 30,
  previewItems: 20,
} as const

export type FieldType =
  | 'text' | 'longtext' | 'html' | 'slug' | 'int' | 'number' | 'money' | 'bool' | 'date'
  | 'image' | 'images' | 'list' | 'url' | 'enum' | 'category' | 'json' | 'duration'

/** A destination field an adapter accepts. */
export interface FieldDef {
  key: string
  label: string
  type: FieldType
  /** Needed to create a row (the schema has no usable default). */
  requiredOnCreate?: boolean
  /** Existing rows may be updated with it (false: create only, e.g. slug). */
  updatable?: boolean
  /** Default for "update existing" in the field selection step. */
  updateByDefault?: boolean
  /** Source column names that probably mean this field. */
  synonyms?: string[]
  enum?: { value: string; label: string }[]
  group?: 'main' | 'content' | 'media' | 'relations' | 'commerce' | 'seo' | 'meta'
  hint?: string
  /** Opt-in strict length bound; older destination coercion remains compatible. */
  maxLength?: number
  /** Not read from one column but built from other settings (specifications, variants); still has a create/update policy. */
  implicit?: boolean
}

/** How a field is used: on create, on update, or not at all (both off = ignored everywhere). */
export type FieldPolicy = { create: boolean; update: boolean }

export type ExistingMode = 'skip' | 'update' | 'fill-empty' | 'replace'
export type MissingMode = 'create' | 'error' | 'manual'

/** A source attribute (column or object key) that becomes a store attribute. */
export type AttributeSource = { source: string; name: string; key?: string; variation: boolean }

/** Validated import settings (stored on the job and in templates). */
export interface ImportSettings {
  adapter: string
  /** Source system of the file's external ids (supplier-a, imdb…): ids are unique per source. */
  source: string
  sheet: string
  /** destination field key → source path ('' = not mapped). */
  mapping: Record<string, string>
  /** variant field key → source path, relative to a nested variant or the flat row. */
  variantMapping: Record<string, string>
  policies: Record<string, FieldPolicy>
  variantPolicies: Record<string, FieldPolicy>
  existing: ExistingMode
  /** Explicit safe re-import policy. Missing on historical saved jobs keeps their old behavior. */
  protectEdits?: boolean
  variants: { mode: 'none' | 'nested' | 'flat'; source: string; groupBy: string }
  attributes: AttributeSource[]
  /** Source path of an object/list of name→value specifications ({"RAM": "8 GB"} or [{name, value}]). */
  specsSource: string
  /** Adapter options (store: product type, attribute groups, currency…). */
  options: Record<string, unknown>
}

/** One item built from the file, before the adapter sees it. */
export interface SourceItem {
  index: number
  /** Row numbers (1-based, header excluded) that made this item. */
  rows: number[]
  values: Record<string, unknown>
  variants: Record<string, unknown>[]
  /** Attribute name → value (specifications and variation values of the parent). */
  specs: Record<string, string>
  /** Per-variant attribute values, aligned with `variants`. */
  variantAttributes: Record<string, string>[]
  raw: Record<string, unknown>
  /** Problems found while building the item (e.g. flat rows of one group that disagree). */
  notes?: Message[]
}

export type Level = 'error' | 'warning' | 'info'
export type Message = { level: Level; text: string }

export type Action = 'CREATE' | 'UPDATE' | 'SKIP' | 'FAIL'

/** A line of the preview card: a value and whether it will be written. */
export type PreviewLine = { label: string; value: string; state: 'IMPORTED' | 'IGNORED' | 'UNCHANGED' | 'CREATED' | 'NEW' }

export interface PreviewCard {
  title: string
  subtitle?: string
  image?: string
  action: Action
  lines: PreviewLine[]
  children?: { title: string; lines: PreviewLine[] }[]
  messages: Message[]
}

/** Counters an adapter adds to the dry run and the final report ("variantsCreated": 12). */
export type Counters = Record<string, number>
