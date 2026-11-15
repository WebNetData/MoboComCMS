import { requireModule } from '@/extensions/server/modules'
export default async function CounterLayout({ children }: { children: React.ReactNode }) {
  await requireModule('instore')
  return children
}
