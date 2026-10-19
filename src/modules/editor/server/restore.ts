import { RevisionError } from '@/modules/content/server/revisions'
import { readDocument } from '@/modules/editor/domain/validate'
import { documentHtml } from '@/modules/editor/domain/render'
import { editorRegistry } from '@/modules/editor/server/blocks/registry'

/** History cannot replace a good body with an old truncated/corrupt JSON copy. */
export function restoredDocumentFields(current: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const format = patch.editorFormat ?? current.editorFormat
  if (format === 'legacy') return Object.hasOwn(patch, 'editorFormat') ? { contentDocument: '' } : {}
  if (format !== 'blocks-v1') throw new RevisionError('قالب این نسخه قابل بازگردانی نیست', 422)
  const stored = patch.contentDocument ?? current.contentDocument
  const registry = editorRegistry(), read = readDocument(typeof stored === 'string' ? stored : '', registry)
  if (!read.ok) throw new RevisionError('متن بلوکی این نسخه ناقص یا نامعتبر است؛ محتوای فعلی تغییر نکرد', 422)
  return { contentDocument: JSON.stringify(read.document), content: documentHtml(read.document, registry) }
}
