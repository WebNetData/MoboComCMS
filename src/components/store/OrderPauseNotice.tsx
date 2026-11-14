import Link from '@/components/AppLink'
export default function OrderPauseNotice({ message }: { message: string }) {
  return message ? <aside className="sx-pause-notice" role="status"><p>{message}</p><Link href="/dashboard/orders">پیگیری سفارش‌های قبلی</Link></aside> : null
}
