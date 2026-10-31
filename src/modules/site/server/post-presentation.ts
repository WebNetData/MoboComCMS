import { getJournalSettings } from '@/modules/journal/server/admin'
import { resolvePostStyle, type ResolvedPostStyle } from '@/modules/journal/domain/post-styles'
import type { RenderContext } from '@/modules/site/domain/theme-templates'
import type { BuilderDoc } from '@/modules/site/domain/builder'
import { getEntityTemplateId } from '@/modules/site/server/builder'

export type PostPresentation = { doc: null; style: ResolvedPostStyle | null }

/**
 * Articles use the native Journal page. Legacy layout ids and previews never execute.
 * Only valid styles apply: address, article, then Journal default.
 * Stored layouts remain archival data; authored article bodies are unchanged.
 */
export async function resolvePostPresentation(input: {
  postId: number
  format: string
  ctx: RenderContext
  previewTemplate?: { id: string; doc: BuilderDoc | null }
  askedStyle?: string
}): Promise<PostPresentation> {
  const settings = (await getJournalSettings()).postStyle
  for (const id of [input.askedStyle || '', await getEntityTemplateId('post', input.postId), settings.defaultId || 'ps-classic', 'ps-classic']) {
    const style = resolvePostStyle(id, settings)
    if (style) return { doc: null, style }
  }
  return { doc: null, style: null }
}
