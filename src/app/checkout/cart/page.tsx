import { CartCheckoutView, checkoutMetadata } from '@/modules/store/server/pages/cart'

export const dynamic = 'force-dynamic'
export const metadata = checkoutMetadata
export default function CartCheckoutRoute() {
  return <CartCheckoutView />
}
