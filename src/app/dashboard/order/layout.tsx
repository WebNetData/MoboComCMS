import type { Metadata } from 'next'
import './order.css'
import '@/components/hosting/hosting.css'
import '@/components/hosting/domains.css'
export const metadata: Metadata = { title: 'سفارش خدمات', robots: { index: false, follow: false } }
export default function OrderLayout({ children }: { children: React.ReactNode }) { return children }
