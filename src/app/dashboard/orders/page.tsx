import type { Metadata } from 'next'
import { MyOrdersView } from '@/modules/store/server/pages/my-orders'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'سفارش‌های من', robots: { index: false } }
export default async function MyOrdersPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  return <MyOrdersView tab={(await searchParams).tab} />
}
