'use client'

import { generateJSON } from '@tiptap/core'
import type { EngineBlock } from '@/modules/editor/adapters/gutenberg/convert'
import { engineName, newEngineAttributes } from '@/modules/editor/adapters/gutenberg/convert'
import type { BlockRegistry } from '@/modules/editor/domain/registry'
import { richTextExtensions } from './RichTextField'

/**
 * The body of an item written in the old editor, as blocks for the writer to look at. Text becomes
 * rich text blocks; an image that stands by itself becomes an image block; a YouTube, Aparat or
 * Vimeo frame becomes a video block. Nothing here is stored: the result is what the editor opens
 * with, and the server checks whatever is saved from it like any other document.
 *
 * What the document format has no place for (frames of other sites, scripts, styles) is
 * left out and counted, so the writer is told.
 */
export function legacyToEngineBlocks(html: string, registry: BlockRegistry): { blocks: EngineBlock[]; dropped: number } {
  const body = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body
  const blocks: EngineBlock[] = []
  let dropped = 0, pending: string[] = []
  const usable = (src: string | null) => (src && (/^https:\/\//i.test(src) || (src.startsWith('/') && !src.startsWith('//'))) ? src : '')
  const block = (type: string, attributes: Record<string, unknown>): EngineBlock => ({ name: engineName(type), attributes: { ...newEngineAttributes(type, registry), ...attributes }, innerBlocks: [] })
  const flush = () => {
    const text = pending.join('').trim(); pending = []
    if (!text) return
    // H1 is the item's own title: a heading of the old body starts one level down.
    const json = generateJSON(text.replace(/<(\/?)h1(\s|>)/gi, '<$1h2$2'), richTextExtensions)
    if (Array.isArray(json.content) && json.content.length) blocks.push(block('content.richText', { content: json }))
  }
  const imageOf = (node: Element): HTMLImageElement | null => {
    if (node.tagName === 'IMG') return node as HTMLImageElement
    const images = node.querySelectorAll('img')
    // A paragraph or figure that holds one image and no words of its own is that image.
    const words = (node.tagName === 'FIGURE' ? [...node.childNodes].filter((child) => (child as Element).tagName !== 'FIGCAPTION') : [...node.childNodes]).map((child) => child.textContent || '').join('').trim()
    return (node.tagName === 'P' || node.tagName === 'FIGURE' || node.tagName === 'DIV') && images.length === 1 && !words ? images[0] : null
  }
  for (const node of [...body.childNodes]) {
    if (node.nodeType === Node.TEXT_NODE) { if (node.textContent?.trim()) pending.push(`<p>${node.textContent.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>`); continue }
    if (node.nodeType !== Node.ELEMENT_NODE) continue
    const element = node as Element
    if (['SCRIPT', 'STYLE', 'LINK', 'META', 'OBJECT', 'EMBED', 'FORM'].includes(element.tagName)) { dropped += 1; continue }
    const frame = element.tagName === 'IFRAME' ? element : element.children.length === 1 && element.children[0].tagName === 'IFRAME' && !element.textContent?.trim() ? element.children[0] : null
    if (frame) {
      const src = frame.getAttribute('src') || ''
      if (/^https:\/\/(www\.)?(youtube(-nocookie)?\.com|youtu\.be|aparat\.com|player\.vimeo\.com|vimeo\.com)\//i.test(src)) { flush(); blocks.push(block('content.embed', { embed: { provider: '', url: src }, title: frame.getAttribute('title') || '' })) } else dropped += 1
      continue
    }
    const image = imageOf(element)
    if (image) {
      const src = usable(image.getAttribute('src'))
      if (!src) { dropped += 1; continue }
      flush()
      const size = (name: string) => { const n = Number(image.getAttribute(name)); return Number.isInteger(n) && n > 0 ? n : 0 }
      blocks.push(block('content.image', { image: { src, alt: image.getAttribute('alt') || '', caption: element.querySelector('figcaption')?.textContent?.trim() || '', width: size('width'), height: size('height'), mime: '' } }))
      continue
    }
    // Images inside running text have no place in rich text: they are counted, the words around them are kept.
    dropped += element.querySelectorAll('img, iframe, video, audio').length
    pending.push(element.outerHTML)
  }
  flush()
  return { blocks, dropped }
}
