import HomeView from '@/modules/site/server/pages/home/page'

export const dynamic = 'force-dynamic'
export default async function HomePage() {
  return <HomeView />
}
