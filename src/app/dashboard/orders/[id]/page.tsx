import type { Metadata } from 'next'
import { MyOrderView } from '@/modules/store/server/pages/my-orders'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'جزئیات سفارش', robots: { index: false } }
export default async function MyOrderPage({ params }: { params: Promise<{ id: string }> }) {
  return <MyOrderView id={(await params).id} />
}
