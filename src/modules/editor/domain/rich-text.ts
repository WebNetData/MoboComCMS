/**
 * Rich text is stored as Tiptap (ProseMirror) JSON, checked against a closed list of nodes, marks
 * and attributes. HTML from a browser is never stored and never trusted: what is rendered is built
 * here from the checked JSON, with every piece of text escaped.
 */
import type { DocumentIssue } from '@/modules/editor/domain/document'

export interface RichTextMark { type: string; attrs?: Record<string, unknown> }
export interface RichTextNode { type: string; attrs?: Record<string, unknown>; content?: RichTextNode[]; text?: string; marks?: RichTextMark[] }
export interface RichTextDoc { type: 'doc'; content: RichTextNode[] }

export const RICH_TEXT_LIMITS = { maxNodes: 5000, maxDepth: 16, maxText: 200_000 } as const
export const TEXT_ALIGNS = ['start', 'center', 'end', 'justify', 'left', 'right'] as const
export const TEXT_DIRECTIONS = ['rtl', 'ltr', 'auto'] as const
/** Text colours are names of theme tokens, never colour values typed by a user. */
export const TEXT_COLORS = ['accent', 'muted', 'success', 'warning', 'danger'] as const
export const CODE_LANGUAGES = ['plain', 'bash', 'json', 'javascript', 'typescript', 'html', 'css', 'sql', 'python', 'php', 'yaml', 'ini', 'nginx'] as const

const BLOCK_NODES = new Set(['paragraph', 'heading', 'bulletList', 'orderedList', 'listItem', 'taskList', 'taskItem', 'blockquote', 'codeBlock', 'horizontalRule', 'hardBreak', 'text'])
const MARKS = new Set(['bold', 'italic', 'underline', 'strike', 'code', 'link', 'highlight', 'textStyle'])
const CHILDREN: Record<string, readonly string[]> = {
  doc: ['paragraph', 'heading', 'bulletList', 'orderedList', 'taskList', 'blockquote', 'codeBlock', 'horizontalRule'],
  paragraph: ['text', 'hardBreak'], heading: ['text', 'hardBreak'],
  bulletList: ['listItem'], orderedList: ['listItem'], taskList: ['taskItem'],
  listItem: ['paragraph', 'bulletList', 'orderedList', 'taskList', 'blockquote', 'codeBlock'],
  taskItem: ['paragraph', 'bulletList', 'orderedList', 'taskList'],
  blockquote: ['paragraph', 'heading', 'bulletList', 'orderedList', 'blockquote', 'codeBlock'],
  codeBlock: ['text'],
}

export const emptyRichText = (): RichTextDoc => ({ type: 'doc', content: [] })

const LETTER = /\p{Letter}/u
const RTL_LETTER = /[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufeff]/, LTR_LETTER = /[A-Za-z\u00c0-\u024f\u0370-\u03ff\u0400-\u052f]/

/**
 * The direction a piece of text reads in: that of its first letter. Persian, Arabic and Hebrew read
 * right to left, Latin, Greek and Cyrillic left to right; digits, spaces and punctuation say nothing.
 * Text with no letter has no direction of its own (null) and takes that of the page, which is right to left.
 */
export function textDirection(text: unknown): 'rtl' | 'ltr' | null {
  if (typeof text !== 'string') return null
  for (const char of text) {
    // Script ranges also contain punctuation, digits and marks; only letters decide direction.
    if (!LETTER.test(char)) continue
    if (RTL_LETTER.test(char)) return 'rtl'
    if (LTR_LETTER.test(char)) return 'ltr'
  }
  return null
}

/** A paragraph choice wins over the containing block; otherwise infer from the first letter. */
export function resolveTextDirection(chosen: unknown, inherited: unknown, text: unknown): 'rtl' | 'ltr' | null {
  if (chosen === 'rtl' || chosen === 'ltr') return chosen
  if (inherited === 'rtl' || inherited === 'ltr') return inherited
  return textDirection(text)
}

/** A link target a page may carry: http(s), a site path, an anchor, mail or phone. Nothing that runs. */
export function safeLinkHref(value: unknown): string | null {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!raw || raw.length > 2048 || /[\u0000-\u001f\u007f\s]/.test(raw)) return null
  if (raw.startsWith('#')) return /^#[A-Za-z0-9_\-:.%]{1,200}$/.test(raw) ? raw : null
  if (raw.startsWith('/')) return raw.startsWith('//') || raw.includes('\\') ? null : raw
  let url: URL
  try { url = new URL(raw) } catch { return null }
  if (url.protocol === 'http:' || url.protocol === 'https:') return url.username || url.password ? null : url.toString()
  if (url.protocol === 'mailto:' || url.protocol === 'tel:') return raw
  return null
}

const oneOf = <T extends string>(list: readonly T[], value: unknown): T | null => (typeof value === 'string' && (list as readonly string[]).includes(value) ? (value as T) : null)

/**
 * The checked copy of a rich text value. Unknown nodes, marks and attributes are left out and
 * reported; the result only ever holds what the renderer knows how to write.
 */
export function normalizeRichText(input: unknown, path = 'content'): { doc: RichTextDoc; issues: DocumentIssue[] } {
  const issues: DocumentIssue[] = []
  const issue = (at: string, code: string, message: string) => { if (issues.length < 50) issues.push({ level: 'error', path: at, code, message }) }
  let nodes = 0, textTotal = 0
  const marksOf = (raw: unknown, at: string): RichTextMark[] | undefined => {
    if (!Array.isArray(raw)) return undefined
    const out: RichTextMark[] = []
    for (const mark of raw as Array<Record<string, unknown>>) {
      const type = mark && typeof mark.type === 'string' ? mark.type : ''
      if (!MARKS.has(type)) { issue(at, 'rich-text.mark', `unknown mark "${type.slice(0, 30)}"`); continue }
      if (out.some((existing) => existing.type === type)) continue
      const attrs = (mark.attrs && typeof mark.attrs === 'object' ? mark.attrs : {}) as Record<string, unknown>
      if (type === 'link') {
        const href = safeLinkHref(attrs.href)
        if (!href) { issue(at, 'rich-text.link', 'a link target is not allowed'); continue }
        out.push({ type, attrs: { href, ...(attrs.target === '_blank' ? { target: '_blank' } : {}) } })
      } else if (type === 'textStyle') {
        const color = oneOf(TEXT_COLORS, attrs.color)
        if (color) out.push({ type, attrs: { color } })
        else if (attrs.color != null) issue(at, 'rich-text.color', 'a text colour is not a theme colour')
      } else out.push({ type })
    }
    return out.length ? out : undefined
  }
  const walk = (raw: unknown, parent: string, at: string, depth: number): RichTextNode | null => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { issue(at, 'rich-text.node', 'a node is not an object'); return null }
    const node = raw as Record<string, unknown>
    const type = typeof node.type === 'string' ? node.type : ''
    if (!BLOCK_NODES.has(type)) { issue(at, 'rich-text.node', `unknown node "${type.slice(0, 30)}"`); return null }
    if (!(CHILDREN[parent] || []).includes(type)) { issue(at, 'rich-text.place', `"${type}" cannot sit in "${parent}"`); return null }
    if (depth > RICH_TEXT_LIMITS.maxDepth) { issue(at, 'rich-text.depth', 'rich text is nested too deeply'); return null }
    if (++nodes > RICH_TEXT_LIMITS.maxNodes) { issue(at, 'rich-text.size', 'rich text has too many nodes'); return null }
    const attrsIn = (node.attrs && typeof node.attrs === 'object' ? node.attrs : {}) as Record<string, unknown>
    if (type === 'text') {
      const text = typeof node.text === 'string' ? node.text : ''
      if (!text) return null
      textTotal += text.length
      if (textTotal > RICH_TEXT_LIMITS.maxText) { issue(at, 'rich-text.size', 'rich text is too long'); return null }
      // Inside a code block text carries no marks.
      const marks = parent === 'codeBlock' ? undefined : marksOf(node.marks, at)
      return { type, text, ...(marks ? { marks } : {}) }
    }
    const attrs: Record<string, unknown> = {}
    if (type === 'paragraph' || type === 'heading') {
      const align = oneOf(TEXT_ALIGNS, attrsIn.textAlign); if (align) attrs.textAlign = align
      const dir = oneOf(TEXT_DIRECTIONS, attrsIn.dir); if (dir) attrs.dir = dir
    }
    if (type === 'heading') {
      // H1 is the page's own title; a document starts at H2.
      const level = Number(attrsIn.level)
      if (!Number.isInteger(level) || level < 2 || level > 6) { issue(at, 'rich-text.heading', 'a heading level must be 2 to 6'); attrs.level = 2 } else attrs.level = level
    }
    if (type === 'orderedList') { const start = Number(attrsIn.start); if (Number.isInteger(start) && start > 1 && start < 100000) attrs.start = start }
    if (type === 'taskItem') attrs.checked = attrsIn.checked === true
    if (type === 'codeBlock') attrs.language = oneOf(CODE_LANGUAGES, attrsIn.language) || 'plain'
    const out: RichTextNode = { type, ...(Object.keys(attrs).length ? { attrs } : {}) }
    if (CHILDREN[type]) {
      const children = Array.isArray(node.content) ? node.content : []
      out.content = children.map((child, index) => walk(child, type, `${at}.content[${index}]`, depth + 1)).filter((child): child is RichTextNode => child !== null)
    }
    return out
  }
  const root = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  if (input != null && root.type !== 'doc') issue(path, 'rich-text.doc', 'rich text must be a document')
  const content = Array.isArray(root.content) ? root.content : []
  return { doc: { type: 'doc', content: content.map((child, index) => walk(child, 'doc', `${path}.content[${index}]`, 1)).filter((child): child is RichTextNode => child !== null) }, issues }
}

// ------------------------------------------------------------------ reading

export const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const MARK_TAG: Record<string, string> = { bold: 'strong', italic: 'em', underline: 'u', strike: 's', code: 'code', highlight: 'mark' }
// Marks are written in one order whatever order they were stored in, so the same text always gives the same HTML.
const MARK_ORDER = ['link', 'textStyle', 'highlight', 'bold', 'italic', 'underline', 'strike', 'code']

function textHtml(node: RichTextNode): string {
  let html = escapeHtml(node.text || '')
  const marks = [...(node.marks || [])].sort((a, b) => MARK_ORDER.indexOf(b.type) - MARK_ORDER.indexOf(a.type))
  for (const mark of marks) {
    if (mark.type === 'link') {
      const href = safeLinkHref(mark.attrs?.href)
      if (!href) continue
      const outside = /^https?:/i.test(href)
      html = `<a href="${escapeHtml(href)}"${mark.attrs?.target === '_blank' || outside ? ' target="_blank"' : ''}${outside ? ' rel="noopener noreferrer nofollow"' : ''}>${html}</a>`
    } else if (mark.type === 'textStyle') {
      const color = oneOf(TEXT_COLORS, mark.attrs?.color)
      if (color) html = `<span class="mcb-color-${color}">${html}</span>`
    } else if (MARK_TAG[mark.type]) html = `<${MARK_TAG[mark.type]}>${html}</${MARK_TAG[mark.type]}>`
  }
  return html
}

const plainOf = (node: RichTextNode): string => (node.type === 'text' ? node.text || '' : (node.content || []).map(plainOf).join(' '))

/** The direction written on a block: the one the writer chose, or the one its own text reads in. Nothing when it has no letter. */
function dirAttr(node: RichTextNode, inherited?: unknown): string {
  const dir = resolveTextDirection(node.attrs?.dir, inherited, plainOf(node))
  return dir ? ` dir="${dir}"` : ''
}

function blockAttrs(node: RichTextNode, inherited?: unknown): string {
  const align = oneOf(TEXT_ALIGNS, node.attrs?.textAlign)
  return `${align ? ` class="mcb-align-${align}"` : ''}${dirAttr(node, inherited)}`
}

function nodeHtml(node: RichTextNode, inherited?: unknown): string {
  const inner = () => (node.content || []).map((child) => nodeHtml(child, inherited)).join('')
  switch (node.type) {
    case 'text': return textHtml(node)
    case 'hardBreak': return '<br>'
    case 'horizontalRule': return '<hr>'
    case 'paragraph': return `<p${blockAttrs(node, inherited)}>${inner()}</p>`
    case 'heading': { const level = Math.min(6, Math.max(2, Number(node.attrs?.level) || 2)); return `<h${level}${blockAttrs(node, inherited)}>${inner()}</h${level}>` }
    case 'bulletList': return `<ul${dirAttr(node, inherited)}>${inner()}</ul>`
    case 'orderedList': { const start = Number(node.attrs?.start); return `<ol${Number.isInteger(start) && start > 1 ? ` start="${start}"` : ''}${dirAttr(node, inherited)}>${inner()}</ol>` }
    case 'listItem': return `<li>${inner()}</li>`
    case 'taskList': return `<ul class="mcb-tasks"${dirAttr(node, inherited)}>${inner()}</ul>`
    case 'taskItem': return `<li class="mcb-task${node.attrs?.checked === true ? ' is-done' : ''}"><input type="checkbox" disabled${node.attrs?.checked === true ? ' checked' : ''}><div>${inner()}</div></li>`
    case 'blockquote': return `<blockquote${dirAttr(node, inherited)}>${inner()}</blockquote>`
    case 'codeBlock': { const language = oneOf(CODE_LANGUAGES, node.attrs?.language) || 'plain'; return `<pre dir="ltr"><code class="language-${language}">${(node.content || []).map((child) => escapeHtml(child.text || '')).join('')}</code></pre>` }
    default: return ''
  }
}

/** HTML of a rich text value. The value is checked first, whatever it was stored as. */
export function richTextHtml(input: unknown, inheritedDirection?: unknown): string {
  return normalizeRichText(input).doc.content.map((node) => nodeHtml(node, inheritedDirection)).join('')
}

export interface RichTextFacts { text: string; headings: Array<{ level: number; text: string }>; links: Array<{ href: string; text: string }> }

/** Plain text, headings and links of a rich text value, for search and SEO analysis. */
export function richTextFacts(input: unknown): RichTextFacts {
  const facts: RichTextFacts = { text: '', headings: [], links: [] }
  const lines: string[] = []
  const plain = (node: RichTextNode): string => (node.type === 'text' ? node.text || '' : node.type === 'hardBreak' ? '\n' : (node.content || []).map(plain).join(''))
  const walk = (node: RichTextNode) => {
    if (node.type === 'text') { for (const mark of node.marks || []) if (mark.type === 'link' && typeof mark.attrs?.href === 'string') facts.links.push({ href: mark.attrs.href, text: node.text || '' }); return }
    if (node.type === 'heading') facts.headings.push({ level: Number(node.attrs?.level) || 2, text: plain(node).trim() })
    if (node.type === 'paragraph' || node.type === 'heading' || node.type === 'codeBlock') { const line = plain(node).trim(); if (line) lines.push(line) }
    for (const child of node.content || []) walk(child)
  }
  for (const node of normalizeRichText(input).doc.content) walk(node)
  facts.text = lines.join('\n')
  return facts
}
