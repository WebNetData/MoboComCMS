import type { BuilderDoc } from '@/modules/site/domain/builder'
import type { ThemeTemplateType } from '@/modules/site/domain/theme-templates'
import { getBuilderDoc } from '@/modules/site/server/builder'
import { isModuleEnabled } from '@/extensions/server/modules'

/**
 * Injected only by the admin live-preview route — the public router never passes it.
 * `pageId` is the builder document being edited; `doc` is its unsaved draft. When a
 * theme template is edited, `template` carries it so the page renders with it.
 */
export type BuilderPreview = {
  pageId: string
  doc: BuilderDoc | null
  template?: { id: string; type: ThemeTemplateType; doc: BuilderDoc | null }
}

export function isPreview(preview: BuilderPreview | undefined): boolean {
  return preview !== undefined
}

/** Only the document being edited is selectable in the live preview. */
export function editableFor(preview: BuilderPreview | undefined, pageId: string): boolean {
  return !preview || preview.pageId === pageId
}

/** Live preview serves the unsaved draft of the edited page; everything else reads stored documents. */
export async function resolveBuilderDoc(preview: BuilderPreview | undefined, pageId: string): Promise<BuilderDoc | null> {
  if (preview && preview.pageId === pageId) return preview.doc
  // Page builder off → every page falls back to its default layout (documents are kept).
  if (!await isModuleEnabled('page-builder')) return null
  return getBuilderDoc(pageId)
}

/** The theme template of a type currently being edited (live preview only). */
export function previewTemplate(preview: BuilderPreview | undefined, type: ThemeTemplateType): { id: string; doc: BuilderDoc | null } | undefined {
  return preview?.template && preview.template.type === type ? { id: preview.template.id, doc: preview.template.doc } : undefined
}
