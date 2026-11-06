import { notFound } from 'next/navigation'
import { serviceOrderingAccess } from '@/modules/account/server/service-ordering'
import { CartCheckoutView, checkoutMetadata } from '@/modules/store/server/pages/cart'
export const metadata = checkoutMetadata
export const dynamic = 'force-dynamic'
export default async function MemberCheckout() { if (!(await serviceOrderingAccess()).store) notFound(); return <CartCheckoutView surface="dashboard" /> }
