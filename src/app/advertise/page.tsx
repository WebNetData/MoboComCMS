import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { moduleGuard } from '@/extensions/server/modules'
import { AdvertisePage } from '@/components/promo/AdvertiserPortal'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'تبلیغات در سایت', description: 'بستهٔ تبلیغاتی بخرید و بنر خود را در جایگاه‌های سایت نمایش دهید.' }

export default async function Advertise() {
  if (await moduleGuard('ads')) notFound()
  return <AdvertisePage />
}
