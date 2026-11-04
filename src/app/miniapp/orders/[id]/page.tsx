import { MyOrderView } from '@/modules/store/server/pages/my-orders'
export const dynamic = 'force-dynamic'
export default async function MiniAppOrderPage({ params }: { params: Promise<{ id: string }> }) {
  return <MyOrderView id={(await params).id} base="/miniapp/orders" />
}
