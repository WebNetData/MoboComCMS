import type { Metadata } from 'next'
import MiniAppShell from './MiniAppShell'
import './miniapp.css'

export const metadata: Metadata = { title: 'مینی‌اپ موبوکام', robots: { index: false, follow: false } }
export default function MiniAppLayout({ children }: { children: React.ReactNode }) { return <MiniAppShell>{children}</MiniAppShell> }
