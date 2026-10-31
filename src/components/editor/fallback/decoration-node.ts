import { Mark, Node } from '@tiptap/core'

const kinds = ['note', 'tip', 'warning', 'success', 'quote', 'spoiler', 'columns']
export const EditorialDecorationNode = Node.create({
  name: 'editorialDecoration', group: 'block', content: 'block+', defining: true, priority: 1100,
  addAttributes() { return { kind: { default: 'note', rendered: false } } },
  parseHTML() { return ['div', 'blockquote', 'details'].map(tag => ({ tag: `${tag}[data-mc-decoration]`, ...(tag === 'details' ? { contentElement: 'div' } : {}), getAttrs: (element: HTMLElement) => kinds.includes(element.dataset.mcDecoration || '') ? { kind: element.dataset.mcDecoration } : false })) },
  renderHTML({ node }) {
    const kind = kinds.includes(node.attrs.kind) ? node.attrs.kind : 'note'
    const attrs = { class: `mc-decor mc-decor-${kind}`, 'data-mc-decoration': kind }
    return kind === 'spoiler' ? ['details', attrs, ['summary', {}, 'نمایش جزئیات'], ['div', {}, 0]] : [kind === 'quote' ? 'blockquote' : 'div', attrs, 0]
  },
})
export const EditorialHighlight = Mark.create({ name: 'editorialHighlight', parseHTML() { return [{ tag: 'mark' }] }, renderHTML() { return ['mark', { class: 'mc-highlight' }, 0] } })
