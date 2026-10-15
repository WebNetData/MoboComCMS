import { requireModule } from '@/extensions/server/modules'
import BusinessManager from '@/components/businesses/BusinessManager'
export default async function BusinessesAdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireModule('businesses')
  const input = await searchParams, params = new URLSearchParams()
  for (const key of ['q', 'page', 'pendingPage', 'requestPage', 'edit']) if (typeof input[key] === 'string') params.set(key, input[key])
  const query = params.toString()
  return <BusinessManager key={query} query={query} />
}
