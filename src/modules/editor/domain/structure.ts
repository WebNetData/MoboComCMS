import { jsonCopy, newBlockId, type MoboComBlock, type MoboComDocument } from '@/modules/editor/domain/document'

/** A reused pattern gets fresh identity, including children of unavailable block types. */
export function instantiatePattern(document: MoboComDocument): MoboComDocument {
  const copy = jsonCopy(document) as MoboComDocument
  const visit = (blocks: MoboComBlock[]) => blocks.forEach(block => { block.id = newBlockId(); if (block.children) visit(block.children) })
  visit(copy.blocks)
  return copy
}

type Position = { block: MoboComBlock; parent: string; siblings: string[] }
function positions(document: MoboComDocument) {
  const found = new Map<string, Position>()
  const visit = (blocks: MoboComBlock[], parent: string) => blocks.forEach(block => {
    found.set(block.id, { block, parent, siblings: blocks.map(value => value.id) })
    if (block.children) visit(block.children, block.id)
  })
  visit(document.blocks, '')
  return found
}

/** The server applies this too: hiding Gutenberg's unlock action is not authorization. */
export const lockSignature = (block: MoboComBlock) => `${block.type}:${!!block.lock?.move}:${!!block.lock?.remove}`
export function structureViolation(before: MoboComDocument, after: MoboComDocument, approvedNewLocks = new Set<string>()): string | null {
  const old = positions(before), next = positions(after)
  for (const [id, value] of next) {
    const was = old.get(id)?.block.lock
    if (!old.has(id) && approvedNewLocks.has(lockSignature(value.block))) continue
    if (!!was?.move !== !!value.block.lock?.move || !!was?.remove !== !!value.block.lock?.remove) return 'فقط مدیر همین بخش می‌تواند قفل ساختار را تغییر دهد.'
  }
  for (const [id, was] of old) {
    const now = next.get(id)
    if (!now && was.block.lock?.remove) return 'بلوک محافظت‌شده قابل حذف نیست.'
    if (!now || !was.block.lock?.move) continue
    if (was.parent !== now.parent) return 'جابه‌جایی بلوک محافظت‌شده مجاز نیست.'
    const survivors = new Set(was.siblings.filter(other => next.get(other)?.parent === was.parent))
    // Adding/removing unrelated blocks is allowed; crossing a remaining sibling is a move.
    const prior = was.siblings.filter(other => survivors.has(other)), current = now.siblings.filter(other => survivors.has(other))
    if (prior.indexOf(id) !== current.indexOf(id) || prior.slice(0, prior.indexOf(id)).some(other => current.indexOf(other) > current.indexOf(id))) return 'جابه‌جایی بلوک محافظت‌شده مجاز نیست.'
  }
  return null
}
