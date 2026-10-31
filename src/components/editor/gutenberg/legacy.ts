'use client'

import { generateJSON } from '@tiptap/core'
import type { EngineBlock } from '@/modules/editor/adapters/gutenberg/convert'
import { engineName, newEngineAttributes } from '@/modules/editor/adapters/gutenberg/convert'
import type { BlockRegistry } from '@/modules/editor/domain/registry'
import { richTextExtensions } from './RichTextField'
import { editorialMedia, embedOf, mediaShortcodes } from '@/shared/media/editorial'
import { renderBBCode } from '@/shared/content/bbcode'

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
  const body = new DOMParser().parseFromString(`<body>${renderBBCode(mediaShortcodes(html))}</body>`, 'text/html').body
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
    const decoration = element.getAttribute('data-mc-decoration')
    if (decoration && ['note', 'tip', 'warning', 'success', 'quote', 'spoiler', 'columns'].includes(decoration)) {
      flush()
      if (decoration === 'columns') {
        const columns = block('layout.columns', { columns: { desktop: 2, tablet: 2, mobile: 1 }, gap: 'md' })
        for (const child of [...element.children]) { const column = block('layout.column', {}), nested = legacyToEngineBlocks(child.innerHTML, registry); column.innerBlocks = nested.blocks; dropped += nested.dropped; columns.innerBlocks.push(column) }
        blocks.push(columns)
      } else {
        const copy = element.cloneNode(true) as Element, title = copy.querySelector(':scope > .mc-decor-label')?.textContent || ''
        copy.querySelector(':scope > .mc-decor-label')?.remove()
        const contentElement = decoration === 'spoiler' ? copy.querySelector(':scope > div') || copy : copy
        dropped += contentElement.querySelectorAll('img,iframe,video,audio,[data-mc-decoration],mark.mc-highlight').length
        const content = generateJSON(contentElement.innerHTML, richTextExtensions)
        blocks.push(decoration === 'quote' ? block('content.quote', { content, cite: '' }) : decoration === 'spoiler' ? block('content.faq', { items: [{ question: 'نمایش جزئیات', answer: content }], open: 'none' }) : block('content.callout', { tone: decoration === 'warning' ? 'warning' : decoration === 'success' ? 'success' : 'info', title, content }))
      }
      continue
    }
    const mediaNode = element.matches('video,audio') ? element : element.querySelector(':scope > video,:scope > audio')
    const media = editorialMedia(element.hasAttribute('data-mc-media') ? { kind: element.getAttribute('data-mc-media'), src: element.getAttribute('data-mc-src'), title: element.getAttribute('data-mc-title'), poster: element.getAttribute('data-mc-poster') || '', audioKind: element.getAttribute('data-mc-audio-kind'), ratio: element.getAttribute('data-mc-ratio'), caption: element.querySelector('figcaption')?.textContent || '' } : mediaNode ? { kind: mediaNode.tagName.toLowerCase(), src: mediaNode.getAttribute('src') || mediaNode.querySelector('source')?.getAttribute('src'), title: mediaNode.getAttribute('aria-label') || mediaNode.getAttribute('title') || '', poster: mediaNode.getAttribute('poster') || '', caption: element.querySelector('figcaption')?.textContent || '' } : null)
    if (media) {
      flush()
      if (media.kind === 'embed') blocks.push(block('content.embed', { embed: { url: media.src }, title: media.title, ratio: media.ratio }))
      else blocks.push(block(media.kind === 'video' ? 'content.video' : 'content.audio', { title: media.title, ratio: media.ratio, audioKind: media.audioKind, file: { src: media.src, caption: media.caption }, poster: { src: media.poster } }))
      continue
    }
    const frame = element.tagName === 'IFRAME' ? element : element.children.length === 1 && element.children[0].tagName === 'IFRAME' && !element.textContent?.trim() ? element.children[0] : null
    if (frame) {
      const src = frame.getAttribute('src') || ''
      if (embedOf(src)) { flush(); blocks.push(block('content.embed', { embed: { provider: '', url: src }, title: frame.getAttribute('title') || '' })) } else dropped += 1
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
    dropped += element.querySelectorAll('img, iframe, video, audio, mark.mc-highlight').length
    pending.push(element.outerHTML)
  }
  flush()
  return { blocks, dropped }
}
