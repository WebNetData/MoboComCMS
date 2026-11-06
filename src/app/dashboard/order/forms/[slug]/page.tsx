import { notFound } from 'next/navigation'
import Link from '@/components/AppLink'
import PublicForm from '@/components/site/PublicForm'
import { serviceOrderingAccess } from '@/modules/account/server/service-ordering'
import { publicFormBySlug } from '@/modules/forms/server/service'
import { publicForm } from '@/modules/forms/domain/forms'
import OrderTrail from '../../OrderTrail'

export default async function MemberServiceForm({ params }: { params: Promise<{ slug: string }> }) {
  await serviceOrderingAccess()
  const found = await publicFormBySlug((await params).slug)
  if (!found?.form.settings?.payment.enabled) notFound()
  return <div className="dt-page do-page" dir="rtl"><Link href="/dashboard/order?category=forms">← انتخاب خدمت دیگر</Link><OrderTrail step={2} /><PublicForm form={publicForm(found.form)} state={found.state} headingLevel={1} surface="dashboard" /></div>
}
