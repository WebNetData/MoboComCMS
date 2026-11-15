import { requireModule } from '@/extensions/server/modules'
export default async function AutomationLayout({ children }: { children: React.ReactNode }) {
  await requireModule('automation')
  return children
}
