import type { Metadata } from 'next'
import Link from '@/components/AppLink'
import { MAINTENANCE_SECTIONS } from '@/modules/site/domain/maintenance'
import '../maintenance/maintenance.css'

export const metadata: Metadata = { title: 'این بخش برای گروه‌های خاصی است', robots: { index: false, follow: false } }

/** What a signed-in member sees in place of a section limited to other groups. The proxy shows it under the section's own address, with status 403. */
export default async function SectionLocked({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const { section } = await searchParams
  const label = MAINTENANCE_SECTIONS.find((item) => item.id === section)?.label
  return (
    <main className="mnt" dir="rtl">
      <section className="mnt-card" aria-labelledby="locked-title">
        {label ? <span className="mnt-chip">{label}</span> : null}
        <h1 id="locked-title" className="mnt-title">این بخش برای گروه‌های خاصی باز است</h1>
        <p className="mnt-text">حساب شما عضو این گروه‌ها نیست. اگر فکر می‌کنید باید دسترسی داشته باشید، با پشتیبانی تماس بگیرید.</p>
        <Link href="/" className="mnt-home">بازگشت به صفحهٔ اصلی</Link>
      </section>
    </main>
  )
}
