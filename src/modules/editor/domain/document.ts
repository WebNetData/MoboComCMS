/**
 * The MoboCom document: the format block content is stored in.
 *
 * It belongs to MoboCom. An editing engine (Gutenberg today) reads and writes it through an
 * adapter and never stores its own serialization. A block names its type and the version of
 * that type's schema; its props are data, never markup.
 */

export const DOCUMENT_VERSION = 1

export interface MoboComBlock {
  id: string
  type: string
  version: number
  props: Record<string, unknown>
  /** Structural protection; text and field values remain editable. */
  lock?: { move?: boolean; remove?: boolean }
  children?: MoboComBlock[]
}

export interface MoboComDocument {
  version: number
  blocks: MoboComBlock[]
}

/** How content of an item is stored: the editor it was written in. */
export const EDITOR_FORMATS = ['legacy', 'blocks-v1'] as const
export type EditorFormat = (typeof EDITOR_FORMATS)[number]

export const DOCUMENT_LIMITS = { maxBlocks: 2000, maxDepth: 12, maxBytes: 2 * 1024 * 1024 } as const

export const BLOCK_ID = /^[A-Za-z0-9_-]{4,40}$/
export const BLOCK_TYPE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*\.[a-z][A-Za-z0-9]*$/

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'
export function newBlockId(random: () => number = Math.random): string {
  let id = 'b_'
  for (let index = 0; index < 12; index += 1) id += ALPHABET[Math.floor(random() * ALPHABET.length)]
  return id
}

export const emptyDocument = (): MoboComDocument => ({ version: DOCUMENT_VERSION, blocks: [] })

export type IssueLevel = 'error' | 'warning'
export interface DocumentIssue { level: IssueLevel; path: string; code: string; message: string }

/** Visits every block, parents before children. `path` is where the block sits ("blocks[0].children[2]"). */
export function walkBlocks(blocks: readonly MoboComBlock[], visit: (block: MoboComBlock, path: string, depth: number, parent: MoboComBlock | null) => void, base = 'blocks', depth = 1, parent: MoboComBlock | null = null) {
  blocks.forEach((block, index) => {
    const path = `${base}[${index}]`
    visit(block, path, depth, parent)
    if (Array.isArray(block.children)) walkBlocks(block.children, visit, `${path}.children`, depth + 1, block)
  })
}

/** A value JSON can carry, copied; anything else (functions, symbols, cycles, huge depth) becomes null. */
export function jsonCopy(value: unknown, depth = 0): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (depth > 40 || typeof value !== 'object') return null
  if (Array.isArray(value)) return value.map((item) => jsonCopy(item, depth + 1))
  const out: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) if (key !== '__proto__' && key !== 'constructor' && key !== 'prototype') out[key] = jsonCopy(item, depth + 1)
  return out
}
