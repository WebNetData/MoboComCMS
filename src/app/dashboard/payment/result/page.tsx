import type { Metadata } from 'next'
import { serviceOrderingAccess } from '@/modules/account/server/service-ordering'
import PaymentResultPage from '@/modules/billing/server/pages/payment/result/page'
export const metadata: Metadata = { title: 'وضعیت پرداخت', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'
export default async function MemberPaymentResult({ searchParams }: { searchParams: Promise<{ invoice?: string; order?: string; failed?: string; reason?: string }> }) { await serviceOrderingAccess(); return <PaymentResultPage searchParams={searchParams} surface="dashboard" /> }
