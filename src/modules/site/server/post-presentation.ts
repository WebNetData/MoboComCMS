import { isModuleEnabled } from '@/extensions/server/modules'
import { getJournalSettings } from '@/modules/journal/server/admin'
import { isStyleId, resolvePostStyle, type ResolvedPostStyle } from '@/modules/journal/domain/post-styles'
import type { RenderContext } from '@/modules/site/domain/theme-templates'
import type { BuilderDoc } from '@/modules/site/domain/builder'
import { getEntityTemplateId } from '@/modules/site/server/builder'
import { layoutDocById, resolveThemeTemplate } from '@/modules/site/server/theme-templates'

export type PostPresentation = { doc: BuilderDoc | null; style: ResolvedPostStyle | null }

/**
 * How one article's page is laid out and dressed, first match wins:
 * a style asked for in the address (a look before choosing), the article's own choice, its format's choice,
 * a published single-post builder template whose display rules match, then the magazine's default style.
 * A choice is a style (`ps-…`, `psc-…`) or a builder layout; one that no longer exists is passed over.
 * `previewTemplate` replaces all of it while a single-post template is being edited in the builder.
 */
export async function resolvePostPresentation(input: {
  postId: number
  format: string
  ctx: RenderContext
  previewTemplate?: { id: string; doc: BuilderDoc | null }
  askedStyle?: string
}): Promise<PostPresentation> {
  if (input.previewTemplate) return { doc: input.previewTemplate.doc, style: null }
  const [settings, builderOn] = await Promise.all([getJournalSettings().then((value) => value.postStyle), isModuleEnabled('page-builder')])
  const choose = async (id: string): Promise<PostPresentation | null> => {
    if (!id) return null
    if (isStyleId(id)) { const style = resolvePostStyle(id, settings); return style ? { doc: null, style } : null }
    if (!builderOn) return null
    const doc = await layoutDocById('post', id)
    return doc ? { doc, style: null } : null
  }
  const asked = input.askedStyle && isStyleId(input.askedStyle) ? await choose(input.askedStyle) : null
  if (asked) return asked
  const own = await choose(await getEntityTemplateId('post', input.postId))
  if (own) return own
  const byFormat = await choose(settings.byFormat[input.format] || '')
  if (byFormat) return byFormat
  if (builderOn) {
    const theme = await resolveThemeTemplate('single-post', input.ctx)
    if (theme?.doc) return { doc: theme.doc, style: null }
  }
  return { doc: null, style: resolvePostStyle(settings.defaultId || 'ps-classic', settings) }
}
