import { notFound } from 'next/navigation'
import MerchantEntry from '@/components/pay/merchant-entry'
const views = ['payments','settlements','terminals','reports','api','operations','webhooks']
export default async function Page({ params }: { params: Promise<{ view: string }> }) {
  const { view } = await params
  if (!views.includes(view)) notFound()
  return <MerchantEntry view={view} />
}
