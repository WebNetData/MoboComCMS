import { plainText } from '@/shared/text/plain'
import { pageBlocksHtml } from '@/modules/editor/server/documents'
import { getModuleStates } from '@/extensions/server/modules'
import { builderContentText } from '@/modules/site/domain/builder-content'
import { BUNDLED_TEMPLATES } from '@/modules/site/domain/builder-templates'
import { listUserTemplates } from '@/modules/site/server/builder'
import { resolveBuilderDoc } from '@/modules/site/server/builder-preview'

type PageContent = { id: number; title: string; titleEn: string; content: string; contentEn: string; editorFormat: string; contentDocument: string }

/** Reads only live persisted sources. Private preview drafts never enter public metadata. */
export async function pageDescription(page: PageContent, locale: 'fa' | 'en', template: string): Promise<string> {
  // Match the Page route's canonical renderer without resolving unrelated live catalogue feeds.
  const blocks = pageBlocksHtml(page)
  const doc = await resolveBuilderDoc(undefined, String(page.id))
  const body = plainText(blocks ?? (locale === 'fa' ? page.content : page.contentEn || page.content))
  let design = ''
  if (doc) {
    const needsTemplates = doc.sections.some(section => section.columns.some(column => column.widgets.some(widget => widget.type === 'template')))
    const [modules, saved] = await Promise.all([getModuleStates(), needsTemplates ? listUserTemplates() : Promise.resolve([])])
    const templates = new Map([...BUNDLED_TEMPLATES, ...saved].map(entry => [entry.id, entry.doc]))
    design = builderContentText(doc, locale, templates, modules)
  }
  const parts = template === 'none' ? [design, body] : [body, design]
  const text = parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
  return text ? text.length > 160 ? text.slice(0, 159).trimEnd()+'…' : text : plainText(locale === 'fa' ? page.title : page.titleEn || page.title, 160)
}
