import { MyOrdersView } from '@/modules/store/server/pages/my-orders'
export const dynamic = 'force-dynamic'
export default async function MiniAppOrdersPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  return <MyOrdersView tab={(await searchParams).tab} base="/miniapp/orders" />
}
