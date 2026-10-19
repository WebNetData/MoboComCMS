/**
 * The block registry: every block type MoboCom knows, with its schema, its place in a tree, who may
 * use it and how an older version of its props becomes the current one. The editor, the validator
 * and the renderers all ask the registry; none of them has a list of block types of its own.
 *
 * A module or an extension adds a block by registering a definition. Nothing in the editing engine
 * or in the editor core changes for it.
 */
import { BLOCK_TYPE } from '@/modules/editor/domain/document'
import type { FieldSchema } from '@/modules/editor/domain/fields'

export type BlockCategory = 'layout' | 'content' | 'media' | 'store' | 'journal' | 'cinema' | 'music' | 'games' | 'software' | 'forum' | 'extension'

export interface BlockDefinition {
  /** `owner.name`: `layout.section`, `content.richText`, `store.productGrid`. */
  type: string
  /** The version of this type's props. A change that old props do not satisfy raises it and adds a migration. */
  version: number
  category: BlockCategory
  label: { fa: string; en: string }
  /** The name of an icon of the admin icon set. */
  icon: string
  /** `static`: everything shown is in the props. `dynamic`: the props are a question, answered when the page is rendered. */
  kind: 'static' | 'dynamic'
  fields: FieldSchema
  /** Absent: the block holds no blocks. `'any'`: any block that accepts this parent. */
  children?: { allowed: readonly string[] | 'any'; max?: number }
  /** Absent: anywhere, the top of a document included. Otherwise only inside these types. */
  parents?: readonly string[]
  /** The permission needed to add or change this block; absent: whoever may edit the document. */
  permission?: string
  /** `migrate[n]` turns props of version n into props of version n + 1. Every step from an older version must exist. */
  migrate?: Record<number, (props: Record<string, unknown>) => Record<string, unknown>>
  /** The module or extension that supplies the block; shown when the block is unknown because its owner is off. */
  owner?: string
  /** Trusted owner contribution, answered by the existing public item registry at read time. */
  dataSource?: { kind: 'public-items'; itemType: string }
}

export class BlockRegistry {
  private readonly blocks = new Map<string, BlockDefinition>()
  constructor(private readonly options: { requireMigrations?: boolean } = {}) {}

  register(definition: BlockDefinition): this {
    if (!BLOCK_TYPE.test(definition.type)) throw new Error(`"${definition.type}" is not a block type (owner.name)`)
    if (!Number.isInteger(definition.version) || definition.version < 1) throw new Error(`block ${definition.type}: the version must be a whole number from 1`)
    if (this.blocks.has(definition.type)) throw new Error(`block ${definition.type} is registered twice`)
    if (this.options.requireMigrations !== false) for (let from = 1; from < definition.version; from += 1) if (typeof definition.migrate?.[from] !== 'function') throw new Error(`block ${definition.type}: no migration from version ${from} to ${from + 1}`)
    this.blocks.set(definition.type, definition)
    return this
  }

  get(type: string): BlockDefinition | undefined { return this.blocks.get(type) }
  has(type: string): boolean { return this.blocks.has(type) }
  list(): BlockDefinition[] { return [...this.blocks.values()] }

  /** Whether `child` may sit directly inside `parent` (null: the top of a document). */
  accepts(parent: BlockDefinition | null, child: BlockDefinition): boolean {
    if (parent === null) return !child.parents
    if (!parent.children) return false
    if (child.parents && !child.parents.includes(parent.type)) return false
    return parent.children.allowed === 'any' ? true : parent.children.allowed.includes(child.type)
  }
}
