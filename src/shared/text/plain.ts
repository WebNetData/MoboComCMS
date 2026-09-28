// Plain text for places that show text, not markup (summaries, cards, sliders,
// meta descriptions). Editors and imports sometimes store HTML in those fields;
// this keeps the words, separates blocks and decodes entities. React escapes
// the result when rendering, so it is safe to display.

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', zwnj: '‌', zwj: '‍', laquo: '«', raquo: '»', hellip: '…', ndash: '–', mdash: '—' }

export function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === '#') {
      const point = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      return Number.isFinite(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : match
    }
    return ENTITIES[code.toLowerCase()] ?? match
  })
}

export function plainText(input: string | null | undefined, max = 0): string {
  const text = decodeEntities(String(input ?? '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\s*br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|blockquote|tr|section|article)\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ''))
    .replace(/\s+/g, ' ')
    .trim()
  return max > 0 && text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}
