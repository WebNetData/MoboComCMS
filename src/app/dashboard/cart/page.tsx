import { notFound } from 'next/navigation'
import { serviceOrderingAccess } from '@/modules/account/server/service-ordering'
import { CartView, cartMetadata } from '@/modules/store/server/pages/cart'
export const metadata = cartMetadata
export const dynamic = 'force-dynamic'
export default async function MemberCart() { if (!(await serviceOrderingAccess()).store) notFound(); return <CartView surface="dashboard" /> }
