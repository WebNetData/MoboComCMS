/**
 * JSON-LD for an inline <script type="application/ld+json">. JSON.stringify
 * alone is not safe there: a title or description containing "</script>"
 * would end the script element. `<`, `>`, `&` and the JS line separators are
 * written as \u escapes, which JSON parsers read back unchanged.
 */
const LINE_SEPARATOR = new RegExp(String.fromCharCode(0x2028), 'g')
const PARAGRAPH_SEPARATOR = new RegExp(String.fromCharCode(0x2029), 'g')

export function safeJsonLd(value: unknown): string {
  return JSON.stringify(value ?? null)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(LINE_SEPARATOR, '\\u2028')
    .replace(PARAGRAPH_SEPARATOR, '\\u2029')
}
