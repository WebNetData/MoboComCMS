import { randomUUID } from 'node:crypto'
import { blockEditorEnabled, prepareDocument } from '@/modules/editor/server/documents'
import type { EditorActor } from '@/modules/editor/server/documents'
import { AiOperationError } from '../../domain/operations'

/** Model output stays plain text; the host constructs and validates its own document. */
export async function operationDocument(body: string, actor: EditorActor) {
  const paragraphs = body.split(/\n\s*\n/).filter(Boolean)
  if (paragraphs.length > 100) throw new AiOperationError('متن طولانی است؛ هیچ بخشی بدون بررسی حذف نمی‌شود')
  const escape = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  if (!await blockEditorEnabled()) return { editorFormat: 'legacy', content: paragraphs.map(t => `<p>${escape(t).replace(/\n/g, '<br>')}</p>`).join('\n'), contentDocument: '' }
  const document = { version: 1, blocks: [{ id: 'b_' + randomUUID().replace(/-/g, '').slice(0, 16), type: 'content.richText', version: 2, props: { dir: 'auto', content: { type: 'doc', content: paragraphs.map(text => ({ type: 'paragraph', content: text.split('\n').flatMap((line, index) => [...(index ? [{ type: 'hardBreak' }] : []), ...(line ? [{ type: 'text', text: line }] : [])]) })) } } }] }
  const prepared = await prepareDocument(document, actor)
  return { editorFormat: 'blocks-v1', content: prepared.html, contentDocument: JSON.stringify(prepared.checked.document) }
}
