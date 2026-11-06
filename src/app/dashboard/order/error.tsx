'use client'
export default function ErrorView({ reset }: { reset: () => void }) { return <section className="do-empty do-error" role="alert"><h2>سرویس‌ها دریافت نشدند</h2><p>اطلاعات سفارش قبلی شما محفوظ است. اتصال را بررسی کنید و دوباره تلاش کنید.</p><button type="button" className="btn btn-primary" onClick={reset}>تلاش دوباره</button></section> }
