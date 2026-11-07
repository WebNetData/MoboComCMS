import type { ReactNode } from 'react'
import BuilderRenderer, { type BuilderSlots } from './BuilderRenderer'
import { resolveSurfaceTemplate } from '@/modules/site/server/builder-surfaces'
import { docHasSlotWidget } from '@/modules/site/domain/builder'
import type { BuilderSurface, BuilderValues } from '@/modules/site/domain/builder-surfaces'
import type { BuilderPreview } from '@/modules/site/server/builder-preview'

export type SurfaceDesign = { surface: BuilderSurface; entryId: number; values?: BuilderValues; preview?: BuilderPreview }
/** Mounted by the owner only after its content/access decisions; never fetches private data. */
export default async function DesignSurface({ design, children, locale, slots }: {
  design: SurfaceDesign; children: ReactNode; locale: 'fa' | 'en'; slots?: BuilderSlots
}) {
  const template = await resolveSurfaceTemplate(design.surface, design.entryId, design.preview)
  if (!template) return children
  const doc = template.doc
  return <div className={`br-surface br-surface-${design.surface}`}>
    <BuilderRenderer doc={doc} locale={locale} preview={!!design.preview} values={design.values} slots={{ 'surface-content': children, ...slots }} />
    {design.surface !== 'dashboard' && !docHasSlotWidget(doc, 'surface-content') && children}
  </div>
}
