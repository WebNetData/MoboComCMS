import { requireModule } from '@/extensions/server/modules'
export default async function RequestsLayout({ children }: { children: React.ReactNode }) {
  await requireModule('forms')
  return children
}
