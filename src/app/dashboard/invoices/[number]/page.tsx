import '../../../account-orders.css'
import type { Metadata } from 'next'
import { serviceOrderingAccess } from '@/modules/account/server/service-ordering'
import InvoicePage from '@/modules/billing/server/pages/invoice/[number]/page'
export const metadata: Metadata = { title: 'فاکتور من', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'
export default async function MemberInvoice({ params }: { params: Promise<{ number: string }> }) { await serviceOrderingAccess(); return <InvoicePage params={params} surface="dashboard" /> }
