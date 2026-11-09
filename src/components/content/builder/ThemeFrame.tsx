import type { ReactNode } from 'react'
import BuilderRenderer from './BuilderRenderer'
import { docHasSlotWidget } from '@/modules/site/domain/builder'
import type { BuilderValues } from '@/modules/site/domain/builder-surfaces'
import type { RenderContext } from '@/modules/site/domain/theme-templates'
import { resolveThemeTemplate } from '@/modules/site/server/theme-templates'

/**
 * Wraps an owner page (archive, search results, not found) in the published theme template whose rules match.
 * The owner keeps its data, access and actions: its rendered output is the template's «current content» block,
 * or follows the template when the template has no such block. Without a matching template nothing changes.
 */
export default async function ThemeFrame({ type, context, values, locale, children }: {
  type: 'archive' | 'search' | 'not-found'
  context: RenderContext
  values?: BuilderValues
  locale: 'fa' | 'en'
  children: ReactNode
}) {
  const template = await resolveThemeTemplate(type, context).catch(() => null)
  if (!template) return children
  return <div className={`br-surface br-theme-${type}`}>
    <BuilderRenderer doc={template.doc} locale={locale} values={values} slots={{ 'surface-content': children }} />
    {!docHasSlotWidget(template.doc, 'surface-content') && children}
  </div>
}
