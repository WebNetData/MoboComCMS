import { notFound } from 'next/navigation'
import { serviceOrderingAccess } from '@/modules/account/server/service-ordering'
import ProductPage from '@/modules/catalog/server/pages/products/[slug]/page'
import Link from '@/components/AppLink'
import OrderTrail from '../../OrderTrail'

export default async function MemberServiceProduct({ params }: { params: Promise<{ slug: string }> }) {
  if (!(await serviceOrderingAccess()).store) notFound()
  return <div className="dt-page do-page sx-page" dir="rtl"><Link href="/dashboard/order?category=digital">← انتخاب خدمت دیگر</Link><OrderTrail step={2} /><ProductPage params={params} surface="dashboard" /></div>
}
