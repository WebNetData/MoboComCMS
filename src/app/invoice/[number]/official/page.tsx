import OfficialInvoicePage from '@/modules/billing/server/pages/invoice/[number]/official'

export { generateMetadata } from '@/modules/billing/server/pages/invoice/[number]/official'
export const dynamic = 'force-dynamic'

export default function Page({ params }: { params: Promise<{ number: string }> }) {
  return <OfficialInvoicePage params={params} />
}
