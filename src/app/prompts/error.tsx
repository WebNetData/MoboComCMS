'use client'
import s from '@/components/prompts/PromptMaster.module.css'
export default function PromptErrorPage({ reset }: { reset: () => void }) {
  return <main className={s.page} dir="rtl"><div className={s.empty} role="alert"><h1>پرامپت مستر موقتاً پاسخ نمی‌دهد</h1><p>اطلاعات ذخیره‌شده حفظ می‌شوند. کمی بعد دوباره تلاش کنید.</p><button type="button" onClick={reset} className={s.primary}>تلاش دوباره</button></div></main>
}
