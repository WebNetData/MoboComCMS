import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import ReceiptSheet from '@/components/forms/ReceiptSheet'
import PrintButton from '@/components/forms/PrintButton'
import { receiptByToken } from '@/modules/forms/server/counter'
import '@/app/receipt.css'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'رسید پذیرش', robots: { index: false, follow: false } }

/** The customer's copy of a receipt, behind the link their SMS carries (forms/server/counter). */
export default async function ReceiptPage({ params }: { params: Promise<{ token: string }> }) {
  const receipt = await receiptByToken((await params).token)
  if (!receipt) notFound()
  return <main className="rc-page"><div className="rc-tools"><PrintButton /></div><ReceiptSheet receipt={receipt} /></main>
}
