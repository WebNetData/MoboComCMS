/** Shapes of the bulk import admin API (see modules/imports/server/service.ts). */

export type FieldType = 'text' | 'longtext' | 'html' | 'slug' | 'int' | 'number' | 'money' | 'bool' | 'date' | 'image' | 'images' | 'list' | 'url' | 'enum' | 'category' | 'json' | 'duration'
export type FieldDef = {
  key: string; label: string; type: FieldType; requiredOnCreate?: boolean; updatable?: boolean; updateByDefault?: boolean
  selection?: { multiple: boolean }
  group?: string; hint?: string; implicit?: boolean; enum?: { value: string; label: string }[]
}
export type OptionDef = {
  key: string; label: string; type: 'select' | 'bool' | 'text' | 'number' | 'valueMap'
  choices?: { value: string; label: string }[]; default?: unknown; hint?: string; step: 4 | 8
  when?: { key: string; values: unknown[] }; valuesOf?: string; dynamic?: boolean; destructive?: boolean
}
export type Destination = {
  id: string; label: string; description: string; entity: string; enabled: boolean
  unavailableReason?: string
  fields: FieldDef[]; variantFields: FieldDef[]; variantLabel: string
  supports: { variants?: boolean; attributes?: boolean; specs?: boolean }; identity: string[]; options: OptionDef[]
}
export type Policy = { create: boolean; update: boolean }
export type Attribute = { source: string; name: string; variation: boolean; key?: string }
export type Settings = {
  fieldInputs?: import('@/modules/imports/domain/field-inputs').FieldInputs
  variantInputs?: import('@/modules/imports/domain/field-inputs').FieldInputs
  slugMode?: 'title' | 'source'; slugRemove?: string[]
  sheet: string; source: string
  mapping: Record<string, string>; variantMapping: Record<string, string>
  policies: Record<string, Policy>; variantPolicies: Record<string, Policy>
  existing: 'skip' | 'update' | 'fill-empty' | 'replace'
  protectEdits?: boolean
  variants: { mode: 'none' | 'nested' | 'flat'; source: string; groupBy: string }
  attributes: Attribute[]; specsSource: string; options: Record<string, unknown>
}
export type Column = { path: string; kind: 'value' | 'list' | 'objects' | 'object'; samples: string[]; filled: number }
export type Analysis = {
  columns: Column[]; rows: number; sheets: string[]; sheet: string; format: string
  sample: Record<string, unknown>[]; distinct: Record<string, string[]>
  suggestions: { mapping: Record<string, string>; variants: Settings['variants']; variantMapping: Record<string, string>; attributes: Attribute[] }
}
export type Message = { level: 'error' | 'warning' | 'info'; text: string }
export type LineState = 'IMPORTED' | 'IGNORED' | 'UNCHANGED' | 'CREATED' | 'NEW'
export type PreviewCard = {
  title: string; subtitle?: string; image?: string; action: string
  lines: { label: string; value: string; state: LineState }[]
  children?: { title: string; lines: { label: string; value: string; state: LineState }[] }[]
  messages: Message[]
}
export type Finding = {
  type: 'unknownAttribute' | 'newOption'; attribute: string; label: string; value?: string; group: string; product: string
  outcome: 'ignored' | 'added' | 'mapped' | 'rejected' | 'needs-mapping'; options?: string[]; variation?: boolean; mapKey?: string
  count: number; products: string[]
}
export type DryRun = {
  settingsHash: string; fileHash: string; at: string; total: number; valid: number; warnings: number; invalid: number
  actions: Record<string, number>; counters: Record<string, number>; duplicates: number; blocking: string[]
  problems: { index: number; rows: number[]; title: string; action: string; messages: Message[] }[]
  findings: Finding[]
}
export type Job = {
  id: number; adapter: string; status: string; fileName: string; format: string; total: number; cursor: number
  stats: Record<string, number>; settings: Partial<Settings>; dryRun: DryRun | null; templateId: number | null; error: string
  createdByEmail: string; createdAt: string; startedAt: string | null; finishedAt: string | null; updatedAt: string
}
export type RecordRow = {
  id: number; index: number; rows: number[]; sourceKey: string; title: string; action: string; status: string
  entityType: string; entityId: number | null; messages: Message[]
}
export type Template = { id: number; name: string; adapter: string; settings: Partial<Settings>; updatedAt: string }

export const JOB_STATUS: Record<string, [string, string]> = {
  DRAFT: ['پیش‌نویس', ''], QUEUED: ['در صف', 'is-info'], RUNNING: ['در حال اجرا', 'is-warn'], PAUSED: ['متوقف', 'is-info'],
  CANCELLED: ['لغو شد', 'is-bad'], DONE: ['کامل شد', 'is-ok'], DONE_WITH_ERRORS: ['کامل شد با خطا', 'is-warn'], FAILED: ['ناموفق', 'is-bad'],
  ROLLING_BACK: ['در حال بازگردانی', 'is-warn'], ROLLED_BACK: ['بازگردانی شد', 'is-info'],
}
export const RECORD_STATUS: Record<string, [string, string]> = {
  OK: ['موفق', 'is-ok'], WARNING: ['موفق با هشدار', 'is-warn'], FAILED: ['ناموفق', 'is-bad'], ROLLED_BACK: ['بازگردانده شد', 'is-info'], ROLLBACK_CONFLICT: ['بازگردانی ناقص', 'is-bad'],
}
export const ACTION_LABEL: Record<string, string> = { CREATE: 'ساخت', UPDATE: 'به‌روزرسانی', SKIP: 'رد', FAIL: 'خطا' }
export const LIVE = ['QUEUED', 'RUNNING', 'ROLLING_BACK']
