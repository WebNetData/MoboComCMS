// Rich text is authored in the admin panel but rendered on public pages and in
// the customer panel — always sanitize before it leaves the API.
import sanitizeHtml from 'sanitize-html'
import { CONTENT_FONT_SIZES, CONTENT_LINE_HEIGHTS, isContentFontFamily } from '@/shared/content/fonts'

// A font is kept only when it is one the editor offers; a size or a line height only when it is on the editor's list.
const FONT_FAMILY = { test: (value: string) => isContentFontFamily(value) } as unknown as RegExp
const FONT_SIZE = { test: (value: string) => CONTENT_FONT_SIZES.some((size) => value === `${size}px`) } as unknown as RegExp
const LINE_HEIGHT = { test: (value: string) => (CONTENT_LINE_HEIGHTS as readonly string[]).includes(value) } as unknown as RegExp

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'br', 'hr', 'blockquote', 'pre', 'code',
    'strong', 'b', 'em', 'i', 'u', 's', 'mark', 'sub', 'sup',
    'ul', 'ol', 'li',
    'a', 'img', 'figure', 'figcaption',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'span', 'div', 'iframe', 'label', 'input',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
    iframe: ['src', 'width', 'height', 'title', 'allow', 'allowfullscreen', 'frameborder'],
    span: ['class', 'style'],
    div: ['class', 'style'],
    p: ['class', 'style'],
    pre: ['tabindex', 'role', 'aria-label'],
    td: ['colspan', 'rowspan'],
    th: ['colspan', 'rowspan', 'scope'],
    label: ['for'],
    input: ['type', 'checked', 'disabled'],
    '*': ['data-type', 'data-checked', 'dir', 'style'],
  },
  allowedStyles: {
    '*': {
      'text-align': [/^(left|right|center|justify)$/],
      color: [/^#[0-9a-f]{3,8}$/i, /^rgb/i],
      'background-color': [/^#[0-9a-f]{3,8}$/i, /^rgb/i],
      'font-family': [FONT_FAMILY],
      'font-size': [FONT_SIZE],
      'line-height': [LINE_HEIGHT],
    },
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel', 'data'],
  allowedSchemesByTag: { img: ['http', 'https', 'data'] },
  allowProtocolRelative: false,
  transformTags: {
    // Scrollable code stays reachable by keyboard; author HTML cannot choose its tab order.
    pre: (tagName, attribs) => ({ tagName, attribs: { ...attribs, tabindex: '0', role: 'region', 'aria-label': 'بلوک کد' } }),
    // external links open in a new tab, safely
    a: (tagName, attribs) => {
      const href = attribs.href || ''
      if (/^https?:\/\//i.test(href)) {
        return { tagName, attribs: { ...attribs, target: '_blank', rel: 'noopener noreferrer nofollow' } }
      }
      return { tagName, attribs }
    },
  },
}

export function cleanRichText(input: string | null | undefined): string {
  if (!input) return ''
  return sanitizeHtml(String(input), OPTIONS)
}

const MESSAGE_OPTIONS: sanitizeHtml.IOptions = {
  ...OPTIONS,
  // conversations keep inline formatting only
  allowedTags: ['p', 'br', 'hr', 'h2', 'h3', 'h4', 'strong', 'b', 'em', 'i', 'u', 's', 'code', 'pre', 'ul', 'ol', 'li', 'blockquote', 'a', 'span'],
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
}

/**
 * Ticket / chat messages: literal text stays literal, editor HTML is sanitized
 * down to inline formatting so a message can never inject markup.
 */
export function sanitizeMessage(input: string | null | undefined): string {
  const raw = String(input || '').trim()
  if (!raw) return ''
  if (!/<[a-z][\s\S]*>/i.test(raw)) {
    return raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }
  return sanitizeHtml(raw, MESSAGE_OPTIONS)
}

/** Rendered in the panel: plain text is escaped, rich text is sanitized. */
export function renderMessage(input: string | null | undefined): string {
  return sanitizeMessage(input)
}

/** Strips every tag — for excerpts, meta descriptions and list previews. */
export function richTextToPlain(input: string | null | undefined, max = 0): string {
  const text = sanitizeHtml(String(input || ''), { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, ' ')
    .trim()
  if (max > 0 && text.length > max) return text.slice(0, max - 1) + '…'
  return text
}

const LENGTH = /^[\w\s.,%()\-/#]+$/
const WIDGET_STYLES: NonNullable<sanitizeHtml.IOptions['allowedStyles']> = {
  '*': {
    'text-align': [/^(left|right|center|justify)$/],
    color: [/^#[0-9a-f]{3,8}$/i, /^rgba?\(/i],
    'background-color': [/^#[0-9a-f]{3,8}$/i, /^rgba?\(/i],
    'background-image': [/^linear-gradient\([\w\s.,%#()\-]+\)$/i],
    'font-size': [LENGTH],
    'font-weight': [/^\d{3}$|^(bold|normal)$/],
    'line-height': [LENGTH],
    'letter-spacing': [LENGTH],
    padding: [LENGTH],
    margin: [LENGTH],
    width: [LENGTH],
    height: [LENGTH],
    'max-width': [LENGTH],
    'min-height': [LENGTH],
    'border-radius': [LENGTH],
    border: [LENGTH],
    gap: [LENGTH],
    display: [/^(block|inline|inline-block|flex|inline-flex|grid|inline-grid|none|table|table-cell)$/],
    'flex-direction': [/^(row|column|row-reverse|column-reverse)$/],
    'flex-wrap': [/^(wrap|nowrap|wrap-reverse)$/],
    'justify-content': [/^(flex-start|flex-end|center|space-between|space-around|space-evenly)$/],
    'align-items': [/^(flex-start|flex-end|center|baseline|stretch)$/],
    'grid-template-columns': [LENGTH],
    'object-fit': [/^(cover|contain|fill|none|scale-down)$/],
    opacity: [/^[\d.]+$/],
    'box-shadow': [LENGTH],
    'backdrop-filter': [/^blur\([\d.]+px\)$/],
  },
}

/**
 * Page-builder "custom code" widget in SAFE mode: rich layout/media markup is
 * kept, but scripts and <style> blocks are dropped (style goes through the CSS
 * field, which is sanitized separately).
 */
export function cleanWidgetHtml(input: string | null | undefined): string {
  if (!input) return ''
  return sanitizeHtml(String(input), {
    allowedTags: [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'p', 'br', 'hr', 'blockquote', 'pre', 'code',
      'strong', 'b', 'em', 'i', 'u', 's', 'mark', 'sub', 'sup',
      'ul', 'ol', 'li', 'dl', 'dt', 'dd',
      'a', 'img', 'figure', 'figcaption', 'picture', 'source',
      'video', 'audio', 'iframe',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'span', 'div', 'section', 'article', 'header', 'footer', 'main', 'aside', 'details', 'summary',
      'label', 'input', 'select', 'option', 'button',
    ],
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel', 'class'],
      img: ['src', 'alt', 'title', 'width', 'height', 'loading', 'class'],
      picture: ['class'],
      source: ['src', 'type', 'media', 'srcset'],
      video: ['src', 'poster', 'controls', 'loop', 'muted', 'autoplay', 'width', 'height', 'preload', 'class'],
      audio: ['src', 'controls', 'loop', 'muted', 'autoplay', 'class'],
      iframe: ['src', 'width', 'height', 'title', 'allow', 'allowfullscreen', 'frameborder', 'loading'],
      td: ['colspan', 'rowspan', 'class'],
      th: ['colspan', 'rowspan', 'scope', 'class'],
      input: ['type', 'name', 'value', 'placeholder', 'checked', 'disabled'],
      select: ['name', 'disabled'],
      option: ['value', 'selected'],
      button: ['type', 'disabled', 'class'],
      label: ['for'],
      '*': ['class', 'style', 'id', 'dir'],
    },
    allowedStyles: WIDGET_STYLES,
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesByTag: { img: ['http', 'https', 'data'], source: ['http', 'https'], video: ['http', 'https'], audio: ['http', 'https'], iframe: ['http', 'https'] },
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName, attribs) => {
        const href = attribs.href || ''
        if (/^https?:\/\//i.test(href)) return { tagName, attribs: { ...attribs, target: '_blank', rel: 'noopener noreferrer nofollow' } }
        return { tagName, attribs }
      },
      iframe: (tagName, attribs) => {
        const src = attribs.src || ''
        if (!/^https?:\/\//i.test(src)) return { tagName: 'span', attribs: {} }
        return { tagName, attribs: { ...attribs, loading: 'lazy' } }
      },
    },
  })
}

/** Page-builder <style> payload in SAFE mode: no tags, no imports, no legacy script vectors. */
export function sanitizeWidgetCss(input: string | null | undefined): string {
  return String(input || '')
    .replace(/<\/?[a-z][\s\S]*?>/gi, '')
    .replace(/@import[^;{]*/gi, '')
    .replace(/expression\s*\(/gi, '')
    .replace(/behavior\s*:/gi, '')
    .replace(/javascript\s*:/gi, '')
    .slice(0, 40000)
}
