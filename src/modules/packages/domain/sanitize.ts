import sanitizeHtml from 'sanitize-html'

// Package HTML is admin-uploaded but rendered for every visitor, so it is
// treated as untrusted: no scripts, event handlers, frames, forms or inline
// styles (styling belongs in the package's CSS files). Relative asset links
// are rewritten to the package's public file endpoint.

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!))

export interface TemplateContext { brand: string; locale: string; settings: Readonly<Record<string, string>> }

/** {{site.brand}}, {{locale}} and {{settings.key}} placeholders, HTML-escaped. */
export function renderPlaceholders(source: string, context: TemplateContext) {
  return source.replace(/\{\{\s*(site\.brand|locale|settings\.([a-zA-Z][a-zA-Z0-9_]*))\s*\}\}/g, (_match, name: string, key?: string) => {
    if (name === 'site.brand') return escapeHtml(context.brand)
    if (name === 'locale') return escapeHtml(context.locale)
    return escapeHtml(context.settings[key!] ?? '')
  })
}

const isRelative = (url: string) => !!url && !/^(?:[a-z][a-z0-9+.-]*:|\/|#|\?)/i.test(url)
const resolveAsset = (url: string, base: string) => isRelative(url) ? `${base}/${url.replace(/^\.\//, '')}` : url

const GLOBAL_ATTRIBUTES = ['class', 'id', 'dir', 'lang', 'title', 'role', 'aria-*', 'data-*']

export function sanitizePackageHtml(html: string, assetBase: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      'section', 'article', 'header', 'footer', 'aside', 'nav', 'main', 'div', 'span', 'p', 'br', 'hr',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'b', 'em', 'i', 'u', 's', 'small', 'mark', 'sub', 'sup', 'bdi', 'time', 'abbr',
      'blockquote', 'pre', 'code', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'details', 'summary',
      'a', 'img', 'picture', 'source', 'figure', 'figcaption', 'video', 'audio',
      'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'button',
    ],
    allowedAttributes: {
      '*': GLOBAL_ATTRIBUTES,
      a: ['href', 'target', 'rel'],
      img: ['src', 'srcset', 'alt', 'width', 'height', 'loading', 'decoding'],
      source: ['src', 'srcset', 'type', 'media'],
      video: ['src', 'poster', 'controls', 'muted', 'loop', 'playsinline', 'autoplay', 'width', 'height', 'preload'],
      audio: ['src', 'controls', 'loop', 'preload'],
      time: ['datetime'],
      td: ['colspan', 'rowspan'], th: ['colspan', 'rowspan', 'scope'],
      details: ['open'],
      button: ['type'],
    },
    allowedSchemes: ['https', 'mailto', 'tel'],
    allowedSchemesByTag: { a: ['https', 'http', 'mailto', 'tel', 'tg'] },
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName, attribs) => {
        const href = resolveAsset(attribs.href || '', assetBase)
        const external = /^https?:\/\//i.test(href)
        return { tagName, attribs: { ...attribs, href, ...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {}) } }
      },
      img: (tagName, attribs) => ({ tagName, attribs: { ...attribs, src: resolveAsset(attribs.src || '', assetBase), loading: attribs.loading || 'lazy' } }),
      source: (tagName, attribs) => ({ tagName, attribs: { ...attribs, ...(attribs.src ? { src: resolveAsset(attribs.src, assetBase) } : {}) } }),
      video: (tagName, attribs) => ({ tagName, attribs: { ...attribs, ...(attribs.src ? { src: resolveAsset(attribs.src, assetBase) } : {}), ...(attribs.poster ? { poster: resolveAsset(attribs.poster, assetBase) } : {}) } }),
      audio: (tagName, attribs) => ({ tagName, attribs: { ...attribs, ...(attribs.src ? { src: resolveAsset(attribs.src, assetBase) } : {}) } }),
      button: (tagName, attribs) => ({ tagName, attribs: { ...attribs, type: 'button' } }),
    },
  })
}

/**
 * Package stylesheets: strip markup and legacy script vectors, drop @import and
 * any url() that is not https, data:image or a file inside the package.
 */
export function sanitizePackageCss(css: string, assetBase: string): string {
  return css
    .replace(/<\/?[a-z!][\s\S]*?>/gi, '')
    .replace(/<\s*\/?\s*style/gi, '')
    .replace(/@import[^;{]*;?/gi, '')
    .replace(/expression\s*\(/gi, '')
    .replace(/behavior\s*:/gi, '')
    .replace(/-moz-binding\s*:/gi, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/url\(\s*(['"]?)([^'")]*)\1\s*\)/gi, (_match, _quote: string, url: string) => {
      const value = url.trim()
      if (/^https:\/\//i.test(value) || /^data:(?:image\/(?:png|jpe?g|gif|webp)|font\/woff2?);base64,[A-Za-z0-9+/=]+$/i.test(value)) return `url("${value}")`
      if (isRelative(value) && !value.includes('..')) return `url("${resolveAsset(value, assetBase)}")`
      return 'none'
    })
}
