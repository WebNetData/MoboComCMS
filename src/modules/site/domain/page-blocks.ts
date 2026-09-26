export const BLOCK_KINDS = ['hero', 'text', 'image', 'columns', 'stats', 'cta', 'faq'] as const
export type BlockKind = typeof BLOCK_KINDS[number]
export type PageBlock = { id: string; kind: BlockKind; title: string; titleEn: string; text: string; textEn: string; image: string; link: string; linkLabel: string; linkLabelEn: string; items: string; itemsEn: string; tone: 'dark' | 'light' | 'accent' }

const string = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : ''
const safeImage = (value: unknown) => {
  const url = string(value, 2048)
  if (!url || /^\/(?!\/)[^\s<>\\]*$/.test(url)) return url
  try { const parsed = new URL(url); if (['https:', 'http:'].includes(parsed.protocol) && !/[\s<>\\]/.test(url)) return url } catch { /* invalid */ }
  throw new Error('Invalid image URL')
}
const safeLink = (value: unknown) => {
  const url = string(value, 512)
  if (!url || /^\/(?!\/)[^\s<>\\]*$/.test(url)) return url
  try { const parsed = new URL(url); if (['https:', 'http:'].includes(parsed.protocol) && !/[\s<>\\]/.test(url)) return url } catch { /* invalid */ }
  throw new Error('Invalid button URL')
}

export function validatePageBlocks(input: unknown): PageBlock[] {
  if (!Array.isArray(input) || input.length > 40) throw new Error('Invalid page sections')
  const seen = new Set<string>()
  return input.map((item, index) => {
    if (!item || typeof item !== 'object' || !BLOCK_KINDS.includes(item.kind)) throw new Error(`Invalid section ${index + 1}`)
    const id = string(item.id, 64)
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id) || seen.has(id)) throw new Error('Invalid section ID')
    seen.add(id)
    return {
      id, kind: item.kind as BlockKind, title: string(item.title, 200), titleEn: string(item.titleEn, 200),
      text: string(item.text, 5000), textEn: string(item.textEn, 5000), image: safeImage(item.image),
      link: safeLink(item.link), linkLabel: string(item.linkLabel, 80), linkLabelEn: string(item.linkLabelEn, 80),
      items: string(item.items, 4000), itemsEn: string(item.itemsEn, 4000),
      tone: ['dark', 'light', 'accent'].includes(item.tone) ? item.tone : 'dark',
    }
  })
}
