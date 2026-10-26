import Link from '@/components/AppLink'

/** Both HTML projections come from the guarded canonical server renderer. */
export default function DocumentProposalPreview({ title, itemId, liveHtml, previewHtml, stale }: { title: string; itemId: number; liveHtml: string; previewHtml: string; stale: boolean }) {
  return <section className="mc-editor mc-proposal-preview" dir="rtl">
    <header className="mc-editor-bar">
      <div className="mc-editor-heading"><Link href={`/admin/posts?edit=${itemId}`} className="mc-editor-back">بازگشت به بررسی پیشنهاد</Link><h1>{title}</h1><p>متن منتشرشده و پیشنهاد نویسنده را کنار هم بررسی کنید.</p></div>
      <span className="mc-editor-state">پیش‌نمایش؛ فقط خواندنی</span>
    </header>
    {stale && <p className="mc-editor-notice is-error" role="alert">نسخهٔ منتشرشده بعد از این پیشنهاد تغییر کرده است. اعمال متن متوقف است؛ پیشنهاد را برای بازنویسی به نویسنده برگردانید.</p>}
    <div className="mc-proposal-columns">
      <section aria-labelledby="mc-live-title"><h2 id="mc-live-title">نسخهٔ منتشرشده</h2><div className="mcb-document" dangerouslySetInnerHTML={{ __html: liveHtml }} /></section>
      <section aria-labelledby="mc-proposed-title"><h2 id="mc-proposed-title">پیشنهاد نویسنده</h2><div className="mcb-document" dangerouslySetInnerHTML={{ __html: previewHtml }} /></section>
    </div>
  </section>
}
