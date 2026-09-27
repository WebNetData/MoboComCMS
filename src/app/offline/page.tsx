import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'اتصال اینترنت برقرار نیست', robots: { index: false } }

/** Shown by the service worker when a page cannot be loaded offline. */
export default function OfflinePage() {
  return (
    <main className="pwa-offline" dir="rtl">
      <span aria-hidden="true">📶</span>
      <h1>اتصال اینترنت برقرار نیست</h1>
      <p>به نظر می‌رسد آفلاین هستید. اتصال را بررسی کنید و دوباره تلاش کنید؛ صفحه‌هایی که قبلاً باز کرده‌اید ممکن است همچنان در دسترس باشند.</p>
      <a href="/" className="btn btn-primary">تلاش دوباره</a>
    </main>
  )
}
