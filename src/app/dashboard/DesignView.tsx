import type { BuilderPreview } from '@/modules/site/server/builder-preview'
import { DASHBOARD_PARTS } from '@/modules/site/domain/builder-surfaces'
import { DashboardOutlet } from '@/app/dashboard/design-parts'
import DashboardHome from '@/app/dashboard/OverviewHome'
import BuilderRenderer from '@/components/content/builder/BuilderRenderer'
import { resolveSurfaceTemplate } from '@/modules/site/server/builder-surfaces'
import { getServerLocale } from '@/i18n/server'

/** No private overview query here; the existing client owner loads only its member. */
export default async function DashboardDesign({ preview }: { preview?: BuilderPreview }) {
  const template = await resolveSurfaceTemplate('dashboard', 0, preview)
  if (!template) return <DashboardHome />
  const locale = await getServerLocale()
  const slots = Object.fromEntries(DASHBOARD_PARTS.map(part => ['dashboard-' + part, <DashboardOutlet key={part} part={part} />]))
  return <DashboardHome><BuilderRenderer doc={template.doc} locale={locale} preview={!!preview} slots={{ ...slots, 'surface-content': <DashboardOutlet part="all" /> }} /></DashboardHome>
}
