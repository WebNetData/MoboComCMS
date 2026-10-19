'use client'

import { Mark } from '@tiptap/core'
import { TEXT_COLORS } from '@/modules/editor/domain/rich-text'

/** Only semantic theme tokens cross the adapter; pasted CSS and arbitrary colors do not. */
export const SemanticTextStyle = Mark.create({
  name: 'textStyle',
  addAttributes() { return { color: { default: null, parseHTML: element => TEXT_COLORS.find(color => element.classList.contains(`mcb-color-${color}`)) || null } } },
  parseHTML() { return [{ tag: 'span[class]', getAttrs: element => TEXT_COLORS.some(color => element.classList.contains(`mcb-color-${color}`)) ? {} : false }] },
  renderHTML({ mark }) { return ['span', TEXT_COLORS.includes(mark.attrs.color) ? { class: `mcb-color-${mark.attrs.color}` } : {}, 0] },
})

export const SemanticHighlight = Mark.create({
  name: 'highlight',
  parseHTML() { return [{ tag: 'mark' }] },
  renderHTML() { return ['mark', {}, 0] },
  addKeyboardShortcuts() { return { 'Mod-Shift-h': () => this.editor.commands.toggleMark(this.name) } },
})
