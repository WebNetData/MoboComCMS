import type { Metadata } from 'next'
import Link from 'next/link'
import RepairTracking from '@/components/forms/RepairTracking'
import './tracking.css'

export const metadata: Metadata = { title: 'پیگیری تعمیرات', robots: { index: false, follow: false } }

export default function RepairStatusPage() {
  return <main className="repair-tracking" dir="rtl">
    <nav aria-label="مسیر صفحه" className="repair-tracking__crumb"><Link href="/">خانه</Link><span aria-hidden="true"> / </span><span>پیگیری تعمیرات</span></nav>
    <header className="repair-tracking__intro"><p>خدمات و تعمیرات</p><h1>پیگیری تعمیرات</h1><span>با اطلاعات روی رسید، آخرین وضعیت دستگاه خود را ببینید.</span></header>
    <RepairTracking />
  </main>
}
