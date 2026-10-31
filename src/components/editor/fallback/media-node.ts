import { Node } from '@tiptap/core'
import { editorialMedia, type EditorialMedia } from '@/shared/media/editorial'

/** The lightweight HTML editor keeps the same media representation when Classic is switched off. */
export const EditorialMediaNode = Node.create({
  name: 'editorialMedia', group: 'block', atom: true, draggable: true,
  addAttributes() { return { media: { default: null, rendered: false } } },
  parseHTML() { return [{ tag: 'figure[data-mc-media]', getAttrs: element => {
    const media = editorialMedia({ kind: element.getAttribute('data-mc-media'), src: element.getAttribute('data-mc-src'), title: element.getAttribute('data-mc-title'), poster: element.getAttribute('data-mc-poster') || '', audioKind: element.getAttribute('data-mc-audio-kind'), ratio: element.getAttribute('data-mc-ratio'), caption: element.querySelector('figcaption')?.textContent || '' })
    return media ? { media } : false
  } }] },
  renderHTML({ node }) {
    const p = editorialMedia(node.attrs.media) as EditorialMedia | null
    if (!p) return ['p', {}, '']
    const attrs = { class: 'mc-media', 'data-mc-media': p.kind, 'data-mc-src': p.src, 'data-mc-title': p.title, 'data-mc-poster': p.poster, 'data-mc-audio-kind': p.audioKind, 'data-mc-ratio': p.ratio }
    const fallback = p.kind === 'embed' ? ['a', { href: p.src, target: '_blank', rel: 'noopener noreferrer' }, p.title || 'ویدیو'] : [p.kind, { src: p.src, controls: '', preload: 'none', 'aria-label': p.title || 'رسانه', ...(p.kind === 'video' ? { playsinline: '', poster: p.poster } : {}) }]
    return ['figure', attrs, ['div', { class: 'mc-media-slot', 'data-mc-player': '' }, fallback], ...(p.caption ? [['figcaption', {}, p.caption]] : [])] as import('@tiptap/pm/model').DOMOutputSpec
  },
})
