// The classic editor's own rules, kept away from the browser code so they can be tested: which tools each kind
// of content gets, and what a quick tag of the Text tab does to the HTML around the selection.

export const CLASSIC_EDITOR_PLUGIN = 'classic-editor'

export type ClassicToolbar = 'full' | 'basic'

/** Tools of the open-source TinyMCE only. `full` is for staff-written content, `basic` for short descriptions. */
export const CLASSIC_TOOLBARS: Record<ClassicToolbar, string> = {
  full: 'blocks | bold italic underline strikethrough | forecolor backcolor | alignright aligncenter alignleft alignjustify | bullist numlist outdent indent | blockquote link image table codesample charmap | rtl ltr | removeformat | searchreplace fullscreen | undo redo',
  basic: 'bold italic underline strikethrough | bullist numlist | blockquote link | rtl ltr | removeformat | undo redo',
}

export interface Quicktag { id: string; label: string; fa: string; en: string }

/** The buttons above the Text tab, in the order a WordPress writer knows them. */
export const QUICKTAGS: readonly Quicktag[] = [
  { id: 'b', label: 'b', fa: 'پررنگ', en: 'Bold' },
  { id: 'i', label: 'i', fa: 'کج', en: 'Italic' },
  { id: 'link', label: 'link', fa: 'پیوند', en: 'Link' },
  { id: 'b-quote', label: 'b-quote', fa: 'نقل‌قول', en: 'Quote' },
  { id: 'del', label: 'del', fa: 'خط‌خورده', en: 'Deleted text' },
  { id: 'img', label: 'img', fa: 'تصویر', en: 'Image' },
  { id: 'ul', label: 'ul', fa: 'فهرست نشانه‌دار', en: 'Bulleted list' },
  { id: 'ol', label: 'ol', fa: 'فهرست شماره‌دار', en: 'Numbered list' },
  { id: 'li', label: 'li', fa: 'مورد فهرست', en: 'List item' },
  { id: 'code', label: 'code', fa: 'کد', en: 'Code' },
  { id: 'h2', label: 'h2', fa: 'تیتر ۲', en: 'Heading 2' },
  { id: 'h3', label: 'h3', fa: 'تیتر ۳', en: 'Heading 3' },
  { id: 'p', label: 'p', fa: 'پاراگراف', en: 'Paragraph' },
]

const WRAP: Record<string, [string, string]> = {
  b: ['<strong>', '</strong>'], i: ['<em>', '</em>'], 'b-quote': ['<blockquote>', '</blockquote>'], del: ['<del>', '</del>'],
  ul: ['<ul>\n', '\n</ul>'], ol: ['<ol>\n', '\n</ol>'], li: ['<li>', '</li>'], code: ['<code>', '</code>'],
  h2: ['<h2>', '</h2>'], h3: ['<h3>', '</h3>'], p: ['<p>', '</p>'],
}

/** An address a writer may put in a link or a picture: a web address, a site path or an anchor — nothing that runs. */
export function quicktagUrl(value: string): string | null {
  const url = value.trim()
  // No quotes, brackets or backslashes, and no "//host" (that is another site, written to look like a path).
  if (!url || /[\s"'<>\\]/.test(url) || url.startsWith('//')) return null
  if (/^(https?:\/\/|\/(?!\/)|#|mailto:|tel:)/i.test(url)) return url
  return /^[a-z][a-z0-9+.-]*:/i.test(url) ? null : `https://${url}`
}

/**
 * What pressing a quick tag does: wraps the selection (or, with nothing selected, leaves an empty pair with the
 * caret inside). `link` and `img` ask for an address; a refused or unsafe one changes nothing (null).
 */
export function applyQuicktag(value: string, from: number, to: number, tag: string, ask: (label: string) => string): { value: string; start: number; end: number } | null {
  const start = Math.max(0, Math.min(from, to, value.length)), end = Math.max(start, Math.min(Math.max(from, to), value.length))
  const selected = value.slice(start, end)
  const put = (open: string, close: string, inner = selected) => {
    const next = value.slice(0, start) + open + inner + close + value.slice(end)
    const caret = start + open.length
    return { value: next, start: caret, end: caret + inner.length }
  }
  if (tag === 'link') {
    const url = quicktagUrl(ask('نشانی پیوند'))
    return url ? put(`<a href="${url}">`, '</a>') : null
  }
  if (tag === 'img') {
    const url = quicktagUrl(ask('نشانی تصویر'))
    if (!url) return null
    const html = `<img src="${url}" alt="${selected.replace(/["<>]/g, '')}" />`
    const next = value.slice(0, start) + html + value.slice(end)
    return { value: next, start: start + html.length, end: start + html.length }
  }
  const pair = WRAP[tag]
  return pair ? put(pair[0], pair[1]) : null
}

export interface PictureChoice { url: string; alt: string; caption: string; /** 0 = as stored; otherwise one of the widths the image route serves. */ width: number; align: 'none' | 'center' | 'right' | 'left' }

const PICTURE_WIDTHS = [320, 480, 640, 960, 1280]
const text = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * The HTML a chosen picture becomes in the text. Only markup the server's cleaning keeps is produced: an img with
 * its alternative text, inside a figure when it has a caption, aligned through text-align. A smaller size asks the
 * image route for that width, so the page does not download the original. An address that is not a web address or
 * a site path gives nothing.
 */
export function pictureHtml(choice: PictureChoice): string {
  const base = quicktagUrl(choice.url)
  if (!base) return ''
  const sized = PICTURE_WIDTHS.includes(choice.width) && /^\/api\/media\/covers\/[\w.-]+$/.test(base)
  const img = `<img src="${text(sized ? `${base}?w=${choice.width}` : base)}" alt="${text(choice.alt.trim())}"${sized ? ` width="${choice.width}"` : ''} loading="lazy" />`
  const align = choice.align === 'center' || choice.align === 'right' || choice.align === 'left' ? ` style="text-align: ${choice.align}"` : ''
  const caption = choice.caption.trim()
  if (caption) return `<figure${align}>${img}<figcaption>${text(caption)}</figcaption></figure>`
  return align ? `<p${align}>${img}</p>` : img
}
