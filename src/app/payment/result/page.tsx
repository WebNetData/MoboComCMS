import type { Metadata } from 'next'
import PaymentResultPage from '@/modules/billing/server/pages/payment/result/page'
export const metadata: Metadata = { title: 'نتیجهٔ پرداخت', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'
export default function PaymentResultRoute({ searchParams }: { searchParams: Promise<{ invoice?: string; order?: string; failed?: string; reason?: string }> }) { return <PaymentResultPage searchParams={searchParams} /> }
