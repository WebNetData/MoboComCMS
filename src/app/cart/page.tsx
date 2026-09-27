import { CartView, cartMetadata } from '@/modules/store/server/pages/cart'

export const dynamic = 'force-dynamic'
export const metadata = cartMetadata
export default function CartRoute() {
  return <CartView />
}
