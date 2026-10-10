import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { resolveTextDirection } from '@/modules/editor/domain/rich-text'

/**
 * While writing, every paragraph, heading, list and quote is shown in the direction of its own text: Persian from the
 * right, English from the left, an empty one from the right like the page. This only decides how the editor shows it;
 * nothing is stored. A direction the writer chose (a `dir` attribute on the block) wins.
 *
 * Used by both editors: the block editor's rich text and the older HTML editor.
 */
export const TypedDirection = Extension.create({
  name: 'mobocomTypedDirection',
  addOptions() { return { direction: (): unknown => undefined } },
  addProseMirrorPlugins() {
    const inherited = this.options.direction
    const DIRECTED = new Set(['paragraph', 'heading', 'bulletList', 'orderedList', 'taskList', 'blockquote'])
    return [new Plugin({
      key: new PluginKey('mobocomTypedDirection'),
      props: {
        decorations(state) {
          const decorations: Decoration[] = []
          state.doc.descendants((node, pos) => {
            if (!DIRECTED.has(node.type.name)) return node.type.name !== 'codeBlock'
            const dir = resolveTextDirection(node.attrs.dir, inherited(), node.textContent)
            if (dir) decorations.push(Decoration.node(pos, pos + node.nodeSize, { dir }))
            return true
          })
          return DecorationSet.create(state.doc, decorations)
        },
      },
    })]
  },
})
