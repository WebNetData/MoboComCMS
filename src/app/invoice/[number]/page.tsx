import type { Metadata } from 'next'
import InvoicePage from '@/modules/billing/server/pages/invoice/[number]/page'
export const metadata: Metadata = { title: 'فاکتور', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'
export default function InvoiceRoute({ params }: { params: Promise<{ number: string }> }) { return <InvoicePage params={params} /> }
