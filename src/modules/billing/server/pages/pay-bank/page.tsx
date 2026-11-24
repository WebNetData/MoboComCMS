import { notFound } from 'next/navigation'
import { requireModule } from '@/extensions/server/modules'
import BankCheckout from '@/components/pay/bank-checkout'

export const metadata = { title: 'پرداخت بانکی | موبوکام‌پی', robots: { index: false, follow: false } }
export default async function PayBankPage({ params }: { params: Promise<{ id: string }> }) {
  await requireModule('mobocom-pay')
  const { id } = await params
  if (!/^[A-Za-z0-9_-]{32}$/.test(id)) notFound()
  return <BankCheckout id={id} />
}
